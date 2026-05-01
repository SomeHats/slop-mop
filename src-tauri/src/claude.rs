use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tiny_http::{Method, Response, Server};

use crate::error::Error;
use crate::git::{commit_with_session_trailer, get_head_commit_hash, stage_all_and_check_dirty};

/// Resolve the user's login-shell PATH once. macOS GUI apps launched from
/// Finder otherwise get a minimal PATH that won't include brew/nvm/etc.
fn shell_path() -> &'static str {
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        Command::new(&shell)
            .args(["-ilc", "echo $PATH"])
            .stderr(std::process::Stdio::null())
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| std::env::var("PATH").unwrap_or_default())
    })
}

/// Find `claude` on the shell PATH.
fn find_claude() -> Option<PathBuf> {
    for dir in shell_path().split(':') {
        let candidate = PathBuf::from(dir).join("claude");
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

pub struct ClaudeProcess {
    window_label: String,
    master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    settings_path: PathBuf,
    hook_server: Arc<Server>,
    /// The Claude session id, captured when the SessionStart hook fires. None
    /// while the user is sitting in the `--resume` picker (no session active yet).
    session_id: Arc<Mutex<Option<String>>>,
    /// Prompt text from the most recent UserPromptSubmit, awaiting Stop. Taken
    /// (cleared) by the Stop handler so it can use it as the post-prompt commit
    /// message.
    pending_prompt: Arc<Mutex<Option<String>>>,
}

pub struct ClaudeManager(pub Mutex<HashMap<String, ClaudeProcess>>);

impl ClaudeManager {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }

    pub fn kill_for_window(&self, label: &str) {
        let mut procs = match self.0.lock() {
            Ok(p) => p,
            Err(_) => return,
        };
        let ids: Vec<String> = procs
            .iter()
            .filter(|(_, p)| p.window_label == label)
            .map(|(id, _)| id.clone())
            .collect();
        for id in ids {
            if let Some(p) = procs.remove(&id) {
                shutdown_process(&p);
            }
        }
    }
}

fn shutdown_process(p: &ClaudeProcess) {
    if let Ok(mut c) = p.child.lock() {
        let _ = c.kill();
    }
    p.hook_server.unblock();
    let _ = fs::remove_file(&p.settings_path);
}

#[derive(Clone, Serialize)]
struct ClaudeOutputEvent {
    agent_id: String,
    /// base64-encoded bytes (keeps ANSI/UTF-8 intact)
    data: String,
}

#[derive(Clone, Serialize)]
struct ClaudeExitEvent {
    agent_id: String,
}

#[derive(Clone, Serialize)]
struct SessionStartedEvent {
    agent_id: String,
    session_id: String,
    /// "startup" | "resume" | "clear" | "compact" — passed through from Claude.
    source: String,
}

#[derive(Serialize)]
pub struct SpawnClaudeResult {
    pub agent_id: String,
}

#[tauri::command]
pub fn spawn_claude(
    window: WebviewWindow,
    app: AppHandle,
    manager: State<'_, ClaudeManager>,
    project_path: String,
    project_id: String,
    resume: bool,
) -> Result<SpawnClaudeResult, Error> {
    // Clean up any prior process for this window (frontend reload safety).
    manager.kill_for_window(window.label());

    let agent_id = uuid::Uuid::new_v4().to_string();

    // 1. Bind the hook HTTP server on a random localhost port.
    let server = Server::http("127.0.0.1:0")
        .map_err(|e| Error::AgentSpawnFailed(format!("hook server bind failed: {e}")))?;
    let hook_port = server
        .server_addr()
        .to_ip()
        .ok_or_else(|| Error::AgentSpawnFailed("hook server missing ip addr".into()))?
        .port();
    let server = Arc::new(server);

    // 2. Write temp settings.json with UserPromptSubmit + SessionStart hooks.
    let settings_path = std::env::temp_dir().join(format!("claude-creche-{agent_id}.json"));
    let prompt_hook_url =
        format!("http://127.0.0.1:{hook_port}/prompt?project_id={project_id}&agent_id={agent_id}");
    let session_hook_url = format!(
        "http://127.0.0.1:{hook_port}/session-start?project_id={project_id}&agent_id={agent_id}"
    );
    let stop_hook_url =
        format!("http://127.0.0.1:{hook_port}/stop?project_id={project_id}&agent_id={agent_id}");
    let settings_json = serde_json::json!({
        "hooks": {
            "UserPromptSubmit": [
                {
                    "hooks": [
                        {
                            "type": "command",
                            "command": format!(
                                "curl -sS --max-time 30 -X POST '{prompt_hook_url}' --data-binary @-"
                            )
                        }
                    ]
                }
            ],
            "SessionStart": [
                {
                    "hooks": [
                        {
                            "type": "command",
                            "command": format!(
                                "curl -sS --max-time 5 -X POST '{session_hook_url}' --data-binary @-"
                            )
                        }
                    ]
                }
            ],
            "Stop": [
                {
                    "hooks": [
                        {
                            "type": "command",
                            "command": format!(
                                "curl -sS --max-time 30 -X POST '{stop_hook_url}' --data-binary @-"
                            )
                        }
                    ]
                }
            ]
        }
    });
    fs::write(
        &settings_path,
        serde_json::to_string_pretty(&settings_json).unwrap(),
    )
    .map_err(|e| Error::AgentSpawnFailed(format!("writing settings.json failed: {e}")))?;

    eprintln!(
        "[claude] spawn agent_id={agent_id} hook_port={hook_port} resume={resume} settings={}",
        settings_path.display()
    );
    eprintln!("[claude] prompt hook: {prompt_hook_url}");
    eprintln!("[claude] session-start hook: {session_hook_url}");
    eprintln!("[claude] stop hook: {stop_hook_url}");

    // 3. Resolve the `claude` binary.
    let claude_bin = find_claude().ok_or_else(|| {
        Error::AgentSpawnFailed("`claude` CLI not found on PATH. Install Claude Code first.".into())
    })?;

    // 4. Open PTY and spawn `claude --settings <file>`.
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 40,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| Error::AgentSpawnFailed(format!("openpty failed: {e}")))?;

    let mut cmd = CommandBuilder::new(&claude_bin);
    cmd.arg("--settings");
    cmd.arg(&settings_path);
    if resume {
        cmd.arg("--resume");
    }
    cmd.cwd(&project_path);
    cmd.env("PATH", shell_path());
    cmd.env("TERM", "xterm-256color");
    // Pin truecolor so claude emits 24-bit RGB SGRs regardless of how the app
    // was launched. Without this, a bundled .app inherits an empty COLORTERM
    // and falls back to the 256-color palette, while `pnpm dev` inherits
    // COLORTERM=truecolor from the surrounding shell — producing visibly
    // different colors between dev and prod.
    cmd.env("COLORTERM", "truecolor");

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| Error::AgentSpawnFailed(format!("spawn claude failed: {e}")))?;
    drop(pair.slave);

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| Error::AgentSpawnFailed(format!("take_writer failed: {e}")))?;
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| Error::AgentSpawnFailed(format!("try_clone_reader failed: {e}")))?;

    let master = Arc::new(Mutex::new(pair.master));
    let writer = Arc::new(Mutex::new(writer));
    let child = Arc::new(Mutex::new(child));

    // 5. Reader thread → emit claude-output events.
    {
        let app = app.clone();
        let id = agent_id.clone();
        let child = Arc::clone(&child);
        thread::spawn(move || {
            let mut reader = reader;
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = B64.encode(&buf[..n]);
                        let _ = app.emit(
                            "claude-output",
                            ClaudeOutputEvent {
                                agent_id: id.clone(),
                                data,
                            },
                        );
                    }
                    Err(_) => break,
                }
            }
            let _ = app.emit(
                "claude-exit",
                ClaudeExitEvent {
                    agent_id: id.clone(),
                },
            );
            if let Ok(mut c) = child.lock() {
                let _ = c.wait();
            }
        });
    }

    let session_id = Arc::new(Mutex::new(None::<String>));
    let pending_prompt = Arc::new(Mutex::new(None::<String>));

    // 6. Hook listener thread.
    {
        let app = app.clone();
        let window_label = window.label().to_string();
        let server = Arc::clone(&server);
        thread::spawn(move || run_hook_server(app, window_label, server));
    }

    let process = ClaudeProcess {
        window_label: window.label().to_string(),
        master,
        writer,
        child,
        settings_path,
        hook_server: server,
        session_id,
        pending_prompt,
    };

    manager
        .0
        .lock()
        .map_err(|e| Error::AgentSpawnFailed(e.to_string()))?
        .insert(agent_id.clone(), process);

    Ok(SpawnClaudeResult { agent_id })
}

#[tauri::command]
pub fn write_claude_stdin(
    manager: State<'_, ClaudeManager>,
    agent_id: String,
    data: String,
) -> Result<(), Error> {
    let procs = manager
        .0
        .lock()
        .map_err(|e| Error::AgentStdinWrite(e.to_string()))?;
    let proc = procs
        .get(&agent_id)
        .ok_or_else(|| Error::AgentNotFound(agent_id.clone()))?;
    // Frontend sends base64-encoded bytes so arbitrary key sequences survive the JSON round-trip.
    let bytes = B64
        .decode(&data)
        .map_err(|e| Error::AgentStdinWrite(format!("bad base64: {e}")))?;
    let mut writer = proc
        .writer
        .lock()
        .map_err(|e| Error::AgentStdinWrite(e.to_string()))?;
    writer
        .write_all(&bytes)
        .map_err(|e| Error::AgentStdinWrite(e.to_string()))?;
    writer
        .flush()
        .map_err(|e| Error::AgentStdinWrite(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub fn resize_claude(
    manager: State<'_, ClaudeManager>,
    agent_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), Error> {
    let procs = manager
        .0
        .lock()
        .map_err(|e| Error::AgentStdinWrite(e.to_string()))?;
    let proc = procs
        .get(&agent_id)
        .ok_or_else(|| Error::AgentNotFound(agent_id.clone()))?;
    let master = proc
        .master
        .lock()
        .map_err(|e| Error::AgentStdinWrite(e.to_string()))?;
    master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| Error::AgentStdinWrite(format!("resize failed: {e}")))?;
    Ok(())
}

#[tauri::command]
pub fn kill_claude(manager: State<'_, ClaudeManager>, agent_id: String) -> Result<(), Error> {
    let mut procs = manager
        .0
        .lock()
        .map_err(|e| Error::AgentNotFound(e.to_string()))?;
    if let Some(p) = procs.remove(&agent_id) {
        shutdown_process(&p);
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Hook HTTP server
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize)]
struct PromptCommittedEvent {
    agent_id: String,
    session_id: String,
    commit_hash: String,
    prompt: String,
    timestamp_unix: i64,
}

#[derive(Clone, Serialize)]
struct CommitStatusEvent {
    agent_id: String,
}

fn emit_to_window<S: Serialize + Clone>(
    app: &AppHandle,
    window_label: &str,
    event: &str,
    payload: S,
) {
    for (_, w) in app.webview_windows() {
        if w.label() == window_label {
            let _ = w.emit(event, payload);
            return;
        }
    }
}

fn run_hook_server(app: AppHandle, window_label: String, server: Arc<Server>) {
    eprintln!(
        "[hook] listener started window={window_label} addr={:?}",
        server.server_addr()
    );
    // recv_timeout lets us exit promptly when `unblock()` is called on shutdown.
    loop {
        match server.recv_timeout(Duration::from_millis(500)) {
            Ok(Some(req)) => handle_hook_request(&app, &window_label, req),
            Ok(None) => continue, // timeout, keep polling
            Err(e) => {
                eprintln!("[hook] server recv error, stopping: {e}");
                break;
            }
        }
    }
    eprintln!("[hook] listener stopped window={window_label}");
}

fn handle_hook_request(app: &AppHandle, window_label: &str, mut req: tiny_http::Request) {
    let t_start = std::time::Instant::now();
    eprintln!(
        "[hook] request received method={:?} url={} remote={:?}",
        req.method(),
        req.url(),
        req.remote_addr()
    );

    if *req.method() != Method::Post {
        let _ = req.respond(Response::from_string("method not allowed").with_status_code(405));
        return;
    }

    let url = req.url().to_string();
    let path = url.split('?').next().unwrap_or("").to_string();
    let (_project_id, agent_id) = parse_query(&url);

    let mut body = String::new();
    if let Err(e) = req.as_reader().read_to_string(&mut body) {
        eprintln!("[hook] failed to read body: {e}");
        let _ = req.respond(Response::from_string("").with_status_code(200));
        return;
    }
    eprintln!("[hook] path={path} body_bytes={}", body.len());

    let parsed: serde_json::Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[hook] bad json: {e} body={body}");
            let _ = req.respond(Response::from_string("").with_status_code(200));
            return;
        }
    };

    match path.as_str() {
        "/prompt" => handle_prompt(app, window_label, &agent_id, &parsed),
        "/session-start" => handle_session_start(app, window_label, &agent_id, &parsed),
        "/stop" => handle_stop(app, window_label, &agent_id, &parsed),
        other => eprintln!("[hook] unknown path: {other}"),
    }

    let _ = req.respond(Response::from_string("").with_status_code(200));
    eprintln!("[hook] responded 200 ({:?} total)", t_start.elapsed());
}

/// UserPromptSubmit: stash the prompt for the upcoming Stop, and commit any
/// pre-existing uncommitted work as a "check point" so Claude's diff is clean.
fn handle_prompt(app: &AppHandle, window_label: &str, agent_id: &str, parsed: &serde_json::Value) {
    let session_id = parsed
        .get("session_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let prompt = parsed
        .get("prompt")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let cwd = parsed
        .get("cwd")
        .and_then(|v| v.as_str())
        .map(PathBuf::from);

    eprintln!(
        "[hook] prompt agent_id={agent_id} session_id={session_id} prompt_len={} cwd={:?}",
        prompt.len(),
        cwd
    );

    // Cache the prompt so the Stop handler can use it as the commit subject.
    if let Some(manager) = app.try_state::<ClaudeManager>() {
        if let Ok(procs) = manager.0.lock() {
            if let Some(p) = procs.get(agent_id) {
                if let Ok(mut slot) = p.pending_prompt.lock() {
                    *slot = Some(prompt.clone());
                }
            }
        }
    }

    let Some(path) = cwd.as_deref() else {
        eprintln!("[hook] missing cwd in hook payload");
        return;
    };
    if session_id.is_empty() {
        eprintln!("[hook] missing session_id; skipping checkpoint");
        return;
    }

    match stage_all_and_check_dirty(path) {
        Ok(false) => eprintln!("[hook] checkpoint skipped (clean tree)"),
        Ok(true) => {
            let payload = CommitStatusEvent {
                agent_id: agent_id.to_string(),
            };
            emit_to_window(app, window_label, "commit-started", payload.clone());
            match commit_with_session_trailer(path, &session_id, "check point") {
                Ok(()) => eprintln!("[hook] checkpoint committed"),
                Err(e) => eprintln!("[hook] checkpoint commit failed: {e}"),
            }
            emit_to_window(app, window_label, "commit-finished", payload);
        }
        Err(e) => eprintln!("[hook] checkpoint stage failed: {e}"),
    }
}

/// Stop: commit Claude's changes (if any) with the prompt as the message.
fn handle_stop(app: &AppHandle, window_label: &str, agent_id: &str, parsed: &serde_json::Value) {
    let session_id = parsed
        .get("session_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let cwd = parsed
        .get("cwd")
        .and_then(|v| v.as_str())
        .map(PathBuf::from);

    let prompt = take_pending_prompt(app, agent_id);
    eprintln!(
        "[hook] stop agent_id={agent_id} session_id={session_id} has_prompt={} cwd={:?}",
        prompt.is_some(),
        cwd
    );

    let (Some(path), Some(prompt)) = (cwd.as_deref(), prompt) else {
        return;
    };
    if session_id.is_empty() {
        return;
    }

    let dirty = match stage_all_and_check_dirty(path) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[hook] stop stage failed: {e}");
            return;
        }
    };
    if !dirty {
        eprintln!("[hook] stop skipped (no changes from prompt)");
        return;
    }

    let status_payload = CommitStatusEvent {
        agent_id: agent_id.to_string(),
    };
    emit_to_window(app, window_label, "commit-started", status_payload.clone());

    // Ask claude -p to generate a commit message from the staged diff. Fall
    // back to the prompt's first line if it fails (network/auth/etc.) so the
    // user never loses a commit.
    let generated = match generate_commit_message(path) {
        Ok(m) => m,
        Err(e) => {
            eprintln!("[hook] stop: claude -p failed, falling back to prompt: {e}");
            first_line(&prompt)
        }
    };
    let full_message = format!("{generated}\n\nPrompt: {prompt}");
    let subject = first_line(&generated);

    let commit_result = commit_with_session_trailer(path, &session_id, &full_message);
    emit_to_window(app, window_label, "commit-finished", status_payload);
    if let Err(e) = commit_result {
        eprintln!("[hook] stop commit failed: {e}");
        return;
    }

    let commit_hash = match get_head_commit_hash(path) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("[hook] stop: get HEAD failed: {e}");
            return;
        }
    };
    let timestamp_unix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let event = PromptCommittedEvent {
        agent_id: agent_id.to_string(),
        session_id,
        commit_hash,
        prompt: subject,
        timestamp_unix,
    };
    emit_to_window(app, window_label, "prompt-committed", event);
    eprintln!("[hook] stop commit emitted");
}

fn take_pending_prompt(app: &AppHandle, agent_id: &str) -> Option<String> {
    let manager = app.try_state::<ClaudeManager>()?;
    let procs = manager.0.lock().ok()?;
    let proc = procs.get(agent_id)?;
    let mut slot = proc.pending_prompt.lock().ok()?;
    slot.take()
}

fn first_line(s: &str) -> String {
    s.lines().next().unwrap_or("").trim().to_string()
}

/// Shell out to `claude -p` to generate a commit message for the currently
/// staged changes. Runs in the project cwd so claude can inspect the diff via
/// its own bash tool. Returns the trimmed stdout (multi-line OK — first line
/// is the subject, rest is the body).
fn generate_commit_message(cwd: &std::path::Path) -> Result<String, String> {
    let prompt = "Inspect the staged git changes (e.g. `git diff --cached`) and write a concise commit message for them. Output ONLY the commit message text — no markdown fencing, no quoting, no preamble. The first line must be a short subject in imperative mood under 70 chars; you may follow it with a blank line and a brief body. Do not use any sort of prefix to your commit message.";
    let out = Command::new("claude")
        .args(["-p", prompt])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("spawn claude -p: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "claude -p exit={:?} stderr={}",
            out.status.code(),
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let msg = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if msg.is_empty() {
        return Err("claude -p returned empty output".to_string());
    }
    Ok(msg)
}

fn handle_session_start(
    app: &AppHandle,
    window_label: &str,
    agent_id: &str,
    parsed: &serde_json::Value,
) {
    let session_id = parsed
        .get("session_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let source = parsed
        .get("source")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    eprintln!("[hook] session-start agent_id={agent_id} session_id={session_id} source={source}");
    if session_id.is_empty() {
        return;
    }

    // Persist the session id on the matching ClaudeProcess.
    if let Some(manager) = app.try_state::<ClaudeManager>() {
        if let Ok(procs) = manager.0.lock() {
            if let Some(p) = procs.get(agent_id) {
                if let Ok(mut s) = p.session_id.lock() {
                    *s = Some(session_id.clone());
                }
            }
        }
    }

    // Notify the project window so the UI can hide the "New session" overlay.
    let event = SessionStartedEvent {
        agent_id: agent_id.to_string(),
        session_id,
        source,
    };
    emit_to_window(app, window_label, "session-started", event);
}

fn parse_query(url: &str) -> (String, String) {
    let mut project_id = String::new();
    let mut agent_id = String::new();
    if let Some((_, qs)) = url.split_once('?') {
        for pair in qs.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                let decoded = url_decode(v);
                match k {
                    "project_id" => project_id = decoded,
                    "agent_id" => agent_id = decoded,
                    _ => {}
                }
            }
        }
    }
    (project_id, agent_id)
}

fn url_decode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) =
                u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16)
            {
                out.push(b as char);
                i += 3;
                continue;
            }
        }
        if bytes[i] == b'+' {
            out.push(' ');
        } else {
            out.push(bytes[i] as char);
        }
        i += 1;
    }
    out
}
