mod claude;
mod comments;
mod commits;
mod db;
mod diff;
mod error;
mod git;
mod menu;
mod project;
mod watcher;
mod window;

use std::sync::Mutex;
use tauri::Manager;

/// Tracks the label of the last window that was destroyed, so the run-loop
/// can decide whether to quit or reopen the picker.
// woke2 impl WIN-RL1
struct LastDestroyedLabel(Mutex<String>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&data_dir).expect("failed to create app data dir");
            let db_path = data_dir.join("slop-mop.db");
            let database = db::Db::open(&db_path).expect("failed to open database");
            app.manage(database);
            app.manage(claude::ClaudeManager::new());
            app.manage(watcher::WatcherManager::new());
            app.manage(LastDestroyedLabel(Mutex::new(String::new())));

            let handle = app.handle();
            let m = menu::build_menu(handle).expect("failed to build menu");
            app.set_menu(m).expect("failed to set menu");
            app.on_menu_event(move |app, event| {
                menu::handle_event(app, &event);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            project::open_project,
            project::list_recent_projects,
            project::remove_project,
            project::get_project_settings,
            project::update_project_settings,
            project::get_head_branch,
            claude::spawn_claude,
            claude::write_claude_stdin,
            claude::resize_claude,
            claude::kill_claude,
            commits::list_session_commits,
            window::open_project_window,
            diff::batch_diff_stats,
            diff::get_range_diff,
            watcher::start_watching,
            watcher::stop_watching,
            comments::create_comment,
            comments::list_comments,
            comments::delete_comment,
            comments::update_comment,
            comments::project_comments,
            comments::anchor_for_workdir,
        ])
        // woke2 impl WIN-RL4
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<LastDestroyedLabel>() {
                    if let Ok(mut label) = state.0.lock() {
                        *label = window.label().to_string();
                    }
                }
                // Kill claude processes and stop watcher owned by this window
                if let Some(manager) = window.try_state::<claude::ClaudeManager>() {
                    manager.kill_for_window(window.label());
                }
                if let Some(w) = window.try_state::<watcher::WatcherManager>() {
                    w.stop_for_window(window.label());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        // woke2 impl WIN-RL2, WIN-RL3
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if app.webview_windows().is_empty() {
                    let was_picker = app
                        .try_state::<LastDestroyedLabel>()
                        .and_then(|s| s.0.lock().ok().map(|l| l.as_str() == "picker"))
                        .unwrap_or(false);

                    if was_picker {
                        // Picker was the last window closed — let the app quit
                        return;
                    }

                    // A project window was the last to close — reopen the picker
                    api.prevent_exit();
                    if let Err(e) = window::open_picker_window(app) {
                        eprintln!("Failed to reopen picker: {e}");
                    }
                } else {
                    api.prevent_exit();
                }
            }
        });
}
