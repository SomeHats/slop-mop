use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

use crate::error::Error;

const BINARY_NAME: &str = "claude-agent-acp";
const BUNDLED_SCRIPT: &str = "agent-bundle/claude-agent-acp.mjs";

/// Get the user's login shell PATH (cached).
/// macOS GUI apps launched from Finder get a minimal PATH that doesn't include
/// brew, nvm, etc. We resolve the full PATH once by asking the user's shell.
fn shell_path() -> &'static str {
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        Command::new(&shell)
            .args(["-ilc", "echo $PATH"])
            .stderr(Stdio::null())
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| std::env::var("PATH").unwrap_or_default())
    })
}

/// Find `node` on the user's shell PATH.
fn find_node() -> Option<PathBuf> {
    for dir in shell_path().split(':') {
        let candidate = PathBuf::from(dir).join("node");
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

/// How to launch the agent process.
enum AgentLaunch {
    /// Run `node <script>` using the bundled JS files in the app's resources.
    Bundled { node: PathBuf, script: PathBuf },
    /// Run the standalone binary/script directly (dev mode or PATH fallback).
    Direct { binary: PathBuf },
}

/// Resolve the best way to launch claude-agent-acp.
/// Priority:
/// 1. Bundled JS in the app's resource directory (works in .app bundles)
/// 2. node_modules/.bin/ relative to the dev build (works during `tauri dev`)
/// 3. Bare binary name on the user's shell PATH
fn resolve_agent_launch(app: &AppHandle) -> AgentLaunch {
    // 1. Try bundled resource
    if let Ok(resource_dir) = app.path().resource_dir() {
        let script = resource_dir.join(BUNDLED_SCRIPT);
        if script.exists() {
            if let Some(node) = find_node() {
                return AgentLaunch::Bundled { node, script };
            }
        }
    }

    // 2. Dev build: exe is at src-tauri/target/{debug,release}/claude-creche
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let dev_local = exe_dir
                .join("../../../node_modules/.bin")
                .join(BINARY_NAME);
            if dev_local.exists() {
                return AgentLaunch::Direct { binary: dev_local };
            }
        }
    }

    // 3. Search the user's shell PATH
    for dir in shell_path().split(':') {
        let candidate = PathBuf::from(dir).join(BINARY_NAME);
        if candidate.exists() {
            return AgentLaunch::Direct {
                binary: candidate,
            };
        }
    }

    AgentLaunch::Direct {
        binary: PathBuf::from(BINARY_NAME),
    }
}

pub struct AgentProcess {
    window_label: String,
    stdin: Mutex<ChildStdin>,
    child: Mutex<Child>,
}

pub struct AgentManager(pub Mutex<HashMap<String, AgentProcess>>);

impl AgentManager {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }

    pub fn kill_for_window(&self, label: &str) {
        let mut agents = match self.0.lock() {
            Ok(a) => a,
            Err(_) => return,
        };
        let ids: Vec<String> = agents
            .iter()
            .filter(|(_, a)| a.window_label == label)
            .map(|(id, _)| id.clone())
            .collect();
        for id in ids {
            if let Some(agent) = agents.remove(&id) {
                if let Ok(mut child) = agent.child.into_inner() {
                    let _ = child.kill();
                }
            }
        }
    }

    pub fn kill_all(&self) {
        let mut agents = match self.0.lock() {
            Ok(a) => a,
            Err(_) => return,
        };
        for (_, agent) in agents.drain() {
            if let Ok(mut child) = agent.child.into_inner() {
                let _ = child.kill();
            }
        }
    }
}

#[derive(Clone, Serialize)]
struct AgentStdoutEvent {
    agent_id: String,
    line: String,
}

#[derive(Clone, Serialize)]
struct AgentExitEvent {
    agent_id: String,
}

#[tauri::command]
pub fn spawn_agent(
    window: WebviewWindow,
    app: AppHandle,
    manager: State<'_, AgentManager>,
    project_path: String,
) -> Result<String, Error> {
    // Kill any existing agents for this window — handles frontend reloads
    // where the old process would otherwise be orphaned.
    manager.kill_for_window(window.label());

    let launch = resolve_agent_launch(&app);
    let (display_name, mut cmd) = match &launch {
        AgentLaunch::Bundled { node, script } => {
            let mut c = Command::new(node);
            c.arg(script);
            (format!("node {}", script.display()), c)
        }
        AgentLaunch::Direct { binary } => {
            (binary.display().to_string(), Command::new(binary))
        }
    };
    let mut child = cmd
        .current_dir(&project_path)
        .env("PATH", shell_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => Error::AgentSpawnFailed(format!(
                "Agent not found (tried {display_name}). Is Node.js installed?",
            )),
            std::io::ErrorKind::PermissionDenied => Error::AgentSpawnFailed(format!(
                "Permission denied running \"{display_name}\": {e}",
            )),
            _ => Error::AgentSpawnFailed(format!(
                "Failed to spawn \"{display_name}\": {e}",
            )),
        })?;

    let agent_id = uuid::Uuid::new_v4().to_string();
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| Error::AgentSpawnFailed("failed to capture stdout".to_string()))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| Error::AgentSpawnFailed("failed to capture stdin".to_string()))?;

    let emit_id = agent_id.clone();
    let emit_app = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    let _ = emit_app.emit(
                        "agent-stdout",
                        AgentStdoutEvent {
                            agent_id: emit_id.clone(),
                            line,
                        },
                    );
                }
                Err(_) => break,
            }
        }
        let _ = emit_app.emit(
            "agent-exit",
            AgentExitEvent {
                agent_id: emit_id.clone(),
            },
        );
    });

    let process = AgentProcess {
        window_label: window.label().to_string(),
        stdin: Mutex::new(stdin),
        child: Mutex::new(child),
    };

    let mut agents = manager
        .0
        .lock()
        .map_err(|e| Error::AgentSpawnFailed(e.to_string()))?;
    agents.insert(agent_id.clone(), process);

    Ok(agent_id)
}

#[tauri::command]
pub fn write_agent_stdin(
    manager: State<'_, AgentManager>,
    agent_id: String,
    data: String,
) -> Result<(), Error> {
    let agents = manager
        .0
        .lock()
        .map_err(|e| Error::AgentStdinWrite(e.to_string()))?;
    let agent = agents
        .get(&agent_id)
        .ok_or_else(|| Error::AgentNotFound(agent_id.clone()))?;
    let mut stdin = agent
        .stdin
        .lock()
        .map_err(|e| Error::AgentStdinWrite(e.to_string()))?;
    stdin
        .write_all(data.as_bytes())
        .map_err(|e| Error::AgentStdinWrite(e.to_string()))?;
    stdin
        .flush()
        .map_err(|e| Error::AgentStdinWrite(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub fn kill_agent(manager: State<'_, AgentManager>, agent_id: String) -> Result<(), Error> {
    let mut agents = manager
        .0
        .lock()
        .map_err(|e| Error::AgentNotFound(e.to_string()))?;
    let agent = agents
        .remove(&agent_id)
        .ok_or_else(|| Error::AgentNotFound(agent_id.clone()))?;
    if let Ok(mut child) = agent.child.into_inner() {
        let _ = child.kill();
    }
    Ok(())
}
