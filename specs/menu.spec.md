---
name: Native menu bar
description: macOS-shaped native menu — File / Edit / Window with an Open Recent submenu seeded from the projects DB
---

# Native menu

`build_menu` constructs the app's macOS-style native menu and `handle_event` dispatches its actions.

## Menu structure

- !MNU-B1 File menu has `Open…` (CmdOrCtrl+O), a separator, an `Open Recent` submenu, another separator, and `Close Window` (CmdOrCtrl+W)
- !MNU-B2 On macOS the leading app submenu carries About / Hide / Show All / Quit predefined items, titled with the app's product name (or `Slop Mop` fallback)
- !MNU-B3 Edit submenu has Undo / Redo / Cut / Copy / Paste / Select All
- !MNU-B4 Window submenu has Minimize and Fullscreen
- !MNU-RC1 `Open Recent` is populated from `project::list_projects` — each entry shows `<name> — <path>`
- !MNU-RC2 Each recent entry's id is `recent:<path>` so the handler can route by id prefix

## Event handling

- !MNU-EV1 `open` opens a folder picker (must run async — dialog is blocking) and routes the chosen path to `window::open_project_window`
- !MNU-EV2 `recent:<path>` opens the project window directly without re-prompting
- !MNU-EV3 `close-window` closes whichever webview window is currently focused
- !MNU-RF1 `refresh_recent_menu` rebuilds the entire menu from the DB and re-installs it after a project upsert
