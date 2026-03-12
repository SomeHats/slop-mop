use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Manager, Wry};

use crate::db::Db;
use crate::project;

/// Build the native menu bar for the app.
pub fn build_menu(app: &AppHandle) -> Result<Menu<Wry>, tauri::Error> {
    let recent_submenu = build_recent_submenu(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&MenuItemBuilder::with_id("open", "Open...").accelerator("CmdOrCtrl+O").build(app)?)
        .separator()
        .item(&recent_submenu)
        .separator()
        .item(&MenuItemBuilder::with_id("close-window", "Close Window").accelerator("CmdOrCtrl+W").build(app)?)
        .build()?;

    let menu = Menu::with_items(app, &[
        #[cfg(target_os = "macos")]
        &SubmenuBuilder::new(app, app.config().product_name.as_deref().unwrap_or("Claude Crèche"))
            .about(None)
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?,
        &file_menu,
        &SubmenuBuilder::new(app, "Edit")
            .undo()
            .redo()
            .separator()
            .cut()
            .copy()
            .paste()
            .select_all()
            .build()?,
        &SubmenuBuilder::new(app, "Window")
            .minimize()
            .item(&PredefinedMenuItem::fullscreen(app, None)?)
            .build()?,
    ])?;

    Ok(menu)
}

fn build_recent_submenu(app: &AppHandle) -> Result<tauri::menu::Submenu<Wry>, tauri::Error> {
    let mut submenu = SubmenuBuilder::new(app, "Open Recent");

    if let Some(db) = app.try_state::<Db>() {
        if let Ok(projects) = project::list_projects(&db) {
            for p in &projects {
                let id = format!("recent:{}", p.path);
                submenu = submenu.item(
                    &MenuItemBuilder::with_id(&id, &format!("{} — {}", p.name, p.path))
                        .build(app)?,
                );
            }
        }
    }

    submenu.build()
}

/// Handle menu events dispatched from the Tauri runtime.
pub fn handle_event(app: &AppHandle, event: &tauri::menu::MenuEvent) {
    let id = event.id().0.as_str();

    if id == "open" {
        handle_open(app);
    } else if id == "close-window" {
        handle_close_window(app);
    } else if let Some(path) = id.strip_prefix("recent:") {
        handle_open_recent(app, path.to_string());
    }
}

fn handle_open(app: &AppHandle) {
    let app = app.clone();
    // Must run async — dialog is blocking
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_dialog::DialogExt;
        let picked = app.dialog().file().blocking_pick_folder();
        if let Some(dir) = picked {
            if let Some(path) = dir.as_path() {
                let path_str = path.to_string_lossy().to_string();
                if let Err(e) = crate::window::open_project_window(app, path_str).await {
                    eprintln!("Failed to open project: {e}");
                }
            }
        }
    });
}

fn handle_open_recent(app: &AppHandle, path: String) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = crate::window::open_project_window(app, path).await {
            eprintln!("Failed to open recent project: {e}");
        }
    });
}

fn handle_close_window(app: &AppHandle) {
    // Find the focused webview window and close it
    for (_, w) in app.webview_windows() {
        if w.is_focused().unwrap_or(false) {
            let _: Result<(), _> = w.close();
            return;
        }
    }
}

/// Rebuild the Open Recent submenu from the database.
pub fn refresh_recent_menu(app: &AppHandle) {
    if let Ok(menu) = build_menu(app) {
        let _ = app.set_menu(menu);
    }
}
