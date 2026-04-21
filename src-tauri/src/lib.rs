mod agent;
mod db;
mod diff;
mod error;
mod menu;
mod permission;
mod project;
mod snapshot;
mod watcher;
mod window;

use std::sync::Mutex;
use tauri::Manager;

/// Tracks the label of the last window that was destroyed, so the run-loop
/// can decide whether to quit or reopen the picker.
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
            let db_path = data_dir.join("creche.db");
            let database = db::Db::open(&db_path).expect("failed to open database");
            app.manage(database);
            app.manage(agent::AgentManager::new());
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
            agent::spawn_agent,
            agent::write_agent_stdin,
            agent::kill_agent,
            snapshot::is_worktree_dirty,
            snapshot::record_prompt_snapshot,
            snapshot::list_prompt_snapshots,
            window::open_project_window,
            diff::batch_diff_stats,
            diff::get_repo_diff,
            watcher::start_watching,
            watcher::stop_watching,
            permission::get_permission_rules,
            permission::create_permission_rules,
            permission::delete_permission_rule,
            permission::get_execute_rules,
            permission::get_execute_flag_rules,
            permission::get_execute_file_rules,
            permission::create_execute_rule,
            permission::create_execute_flag_rules,
            permission::create_execute_file_rules,
            permission::delete_execute_rule,
            permission::delete_execute_flag_rule,
            permission::delete_execute_file_rule,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<LastDestroyedLabel>() {
                    if let Ok(mut label) = state.0.lock() {
                        *label = window.label().to_string();
                    }
                }
                // Kill agents and stop watcher owned by this window
                if let Some(manager) = window.try_state::<agent::AgentManager>() {
                    manager.kill_for_window(window.label());
                }
                if let Some(w) = window.try_state::<watcher::WatcherManager>() {
                    w.stop_for_window(window.label());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
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
