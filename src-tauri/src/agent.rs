use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::error::Error;

const BINARY_NAME: &str = "claude-agent-acp";

/// Resolve the claude-agent-acp binary path.
/// Checks node_modules/.bin/ relative to the Cargo manifest dir (i.e. the project root's
/// node_modules) first, then falls back to bare name (PATH lookup).
fn resolve_agent_binary() -> PathBuf {
    let local = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../node_modules/.bin")
        .join(BINARY_NAME);
    if local.exists() {
        return local;
    }
    PathBuf::from(BINARY_NAME)
}

pub struct AgentProcess {
    stdin: Mutex<ChildStdin>,
    child: Mutex<Child>,
}

pub struct AgentManager(pub Mutex<HashMap<String, AgentProcess>>);

impl AgentManager {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
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
    app: AppHandle,
    manager: State<'_, AgentManager>,
    project_path: String,
) -> Result<String, Error> {
    let bin = resolve_agent_binary();
    let mut child = Command::new(&bin)
        .current_dir(&project_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => Error::AgentSpawnFailed(format!(
                "\"claude-agent-acp\" not found (tried {}). \
                 Run `pnpm add @zed-industries/claude-agent-acp` in the project root.",
                bin.display()
            )),
            std::io::ErrorKind::PermissionDenied => Error::AgentSpawnFailed(format!(
                "Permission denied running \"{}\": {e}",
                bin.display()
            )),
            _ => Error::AgentSpawnFailed(format!(
                "Failed to spawn \"{}\": {e}",
                bin.display()
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
