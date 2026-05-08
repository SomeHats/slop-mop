---
name: Native window construction and run-loop
description: The picker / project windows, project injection, and the multi-window run loop
---

# Windows

The app uses a separate native window per project, plus a "picker" window for selecting projects. See [project picker](project.spec.md) for the underlying upsert.

## Picker window

- !WIN-PK1 `open_picker_window` is idempotent — if the picker exists it focuses it and returns without rebuilding
- !WIN-PK2 Picker window has overlay title bar, hidden title, custom traffic-light position (12,16), 600×500 size, centered

## Project window

- !WIN-PJ1 `open_project_window` upserts the project first; non-repos return `Error::NotAGitRepo` before any window is built
- !WIN-PJ2 Window labels are `project-<uuid>` so multiple project windows can coexist
- !WIN-PJ3 Project metadata is injected via `window.__PROJECT = {…}` in an initialization script so the React app boots already knowing its project
- !WIN-PJ4 Title is the project's name; chrome matches the picker (overlay title bar, traffic light at 12,16)
- !WIN-PJ5 Default size is 1200×800
- !WIN-PJ6 After opening a project window, closes any open picker and refreshes the Open Recent menu

## Run loop

- !WIN-RL1 The last destroyed window's label is tracked in `LastDestroyedLabel` so the exit handler can decide whether to quit or re-open the picker
- !WIN-RL2 If a project window was the last to close, `prevent_exit` and re-open the picker
- !WIN-RL3 If the picker was the last to close, allow the app to quit
- !WIN-RL4 Window destroy kills any agents and stops any watchers attached to that window label (see [auto-commit](claude.spec.md) and [watcher](watcher.spec.md))
