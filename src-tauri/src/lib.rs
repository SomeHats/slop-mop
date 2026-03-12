mod agent;
mod db;
mod diff;
mod error;
mod menu;
mod project;
mod snapshot;
mod window;

use tauri::Manager;

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
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Kill agents owned by this window
                if let Some(manager) = window.try_state::<agent::AgentManager>() {
                    manager.kill_all();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                // Prevent auto-exit when last window closes — we manage that ourselves
                // by reopening the picker in on_window_event
                api.prevent_exit();

                // If no windows remain, reopen the picker
                if app.webview_windows().is_empty() {
                    if let Err(e) = window::open_picker_window(app) {
                        eprintln!("Failed to reopen picker: {e}");
                    }
                }
            }
        });
}
