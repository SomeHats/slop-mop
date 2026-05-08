use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebouncedEventKind, Debouncer};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

use crate::error::Error;

#[derive(Clone, Serialize)]
struct FsChangeEvent {}

pub struct WatcherManager(Mutex<HashMap<String, Debouncer<notify::RecommendedWatcher>>>);

impl WatcherManager {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }

    // woke2 impl WCH-S7
    pub fn stop_for_window(&self, label: &str) {
        if let Ok(mut guard) = self.0.lock() {
            guard.remove(label);
        }
    }
}

// woke2 impl WCH-S1, WCH-S2, WCH-S3, WCH-S4, WCH-S5
#[tauri::command]
pub fn start_watching(
    window: WebviewWindow,
    app: AppHandle,
    project_path: String,
) -> Result<(), Error> {
    let manager = app.state::<WatcherManager>();
    let label = window.label().to_string();

    // Stop any existing watcher for this window first
    {
        let mut guard = manager
            .0
            .lock()
            .map_err(|e| Error::Watcher(e.to_string()))?;
        guard.remove(&label);
    }

    let emit_app = app.clone();
    let mut debouncer = new_debouncer(
        std::time::Duration::from_millis(300),
        move |result: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
            let events = match result {
                Ok(events) => events,
                Err(_) => return,
            };

            // Filter out .git/ changes
            let has_relevant = events.iter().any(|e| {
                e.kind == DebouncedEventKind::Any
                    && !e.path.components().any(|c| c.as_os_str() == ".git")
            });

            if has_relevant {
                let _ = emit_app.emit("fs-change", FsChangeEvent {});
            }
        },
    )
    .map_err(|e| Error::Watcher(e.to_string()))?;

    debouncer
        .watcher()
        .watch(Path::new(&project_path), RecursiveMode::Recursive)
        .map_err(|e| Error::Watcher(e.to_string()))?;

    let mut guard = manager
        .0
        .lock()
        .map_err(|e| Error::Watcher(e.to_string()))?;
    guard.insert(label, debouncer);

    Ok(())
}

// woke2 impl WCH-S6
#[tauri::command]
pub fn stop_watching(
    window: WebviewWindow,
    manager: State<'_, WatcherManager>,
) -> Result<(), Error> {
    let mut guard = manager
        .0
        .lock()
        .map_err(|e| Error::Watcher(e.to_string()))?;
    guard.remove(window.label());
    Ok(())
}
