mod agent;
mod db;
mod error;
mod project;

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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            project::open_project,
            project::list_recent_projects,
            project::remove_project,
            agent::spawn_agent,
            agent::write_agent_stdin,
            agent::kill_agent,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(manager) = window.try_state::<agent::AgentManager>() {
                    manager.kill_all();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
