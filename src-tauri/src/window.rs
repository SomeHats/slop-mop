use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::db::Db;
use crate::error::Error;
use crate::project;

/// Create and show the project picker window.
/// Does nothing if the picker window already exists (brings it to front instead).
pub fn open_picker_window(app: &AppHandle) -> Result<(), Error> {
    if let Some(w) = app.get_webview_window("picker") {
        let _ = w.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(app, "picker", WebviewUrl::default())
        .title("Claude Crèche")
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .inner_size(600.0, 500.0)
        .center()
        .build()
        .map_err(|e| Error::Window(e.to_string()))?;

    Ok(())
}

/// Open a project in a new OS window.
/// Validates the path as a git repo, upserts into the DB, creates a new window
/// with `window.__PROJECT` injected, and closes the picker if open.
#[tauri::command]
pub async fn open_project_window(app: AppHandle, path: String) -> Result<(), Error> {
    let db = app.state::<Db>();
    let project = project::upsert_project(&db, &path)?;

    let label = format!("project-{}", uuid::Uuid::new_v4());
    let project_json = serde_json::to_string(&project)
        .map_err(|e| Error::Window(e.to_string()))?;

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::default())
        .title(&project.name)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .inner_size(1200.0, 800.0)
        .initialization_script(&format!("window.__PROJECT = {};", project_json))
        .build()
        .map_err(|e| Error::Window(e.to_string()))?;

    // Close the picker window if it's open
    if let Some(picker) = app.get_webview_window("picker") {
        let _ = picker.close();
    }

    // Refresh the Open Recent menu
    crate::menu::refresh_recent_menu(&app);

    Ok(())
}
