---
name: Project picker and per-project settings UI
description: The picker window's recent-projects list and the project settings popover (commit-prefix mode)
---

# Projects UI

The frontend for the [project picker](project.spec.md). The picker window appears on launch and after the last project window closes.

## Project picker window

- !PFE-PK1 Loads recent projects via `tauri.listRecentProjects` on mount
- !PFE-PK2 "Open Project" button opens the OS folder picker; cancel is a no-op
- !PFE-PK3 Calls `tauri.openProjectWindow(path)` to spawn the project window; loading state suppresses double-clicks
- !PFE-PK4 Errors from open / list / remove surface as a destructive-styled message under the open button
- !PFE-PK5 Recent list is capped to the first 3 entries returned (the backend already orders by recency)
- !PFE-PK6 Each recent row's row-click opens that project; X icon (visible on hover) calls `removeProject` and refreshes the list
- !PFE-PK7 Title bar carries the `data-tauri-drag-region` so the macOS-style chromeless window stays draggable
- !PFE-PK8 Recent rows are `flex-nowrap` with `min-w-0` content so long names and paths truncate with an ellipsis (and surface the full string via `title`) instead of wrapping or pushing the X button onto a new line

## Project settings popover

- !PFE-ST1 Re-fetches the current branch every time the popover opens (the user may have run `git checkout` outside the app)
- !PFE-ST2 Shows three radio options — `none`, `full`, `feature` — with a sample subject preview using the current branch
- !PFE-ST3 `full` and `feature` options are dimmed (opacity-60) when the branch is unknown (detached HEAD or non-repo path)
- !PFE-ST4 `featurePart` mirrors the backend's `feature` mode: strip up to and including the first `/`; branches without `/` return their own name
- !PFE-ST5 Settings updates are written through `onUpdate` → `useProjectSettings.update`
- !PFE-ST6 The settings button has `data-tauri-no-drag-region` so the title-bar drag doesn't swallow clicks
- !PFE-ST7 A separate "Diff" section in the popover holds an "Ignore whitespace" Switch wired to `ignoreWhitespace`; flipping it calls `onUpdate({ ignoreWhitespace })`

## useProjectSettings

- !PFE-PS1 Loads the saved settings on mount and keeps a `lastSavedRef` snapshot for optimistic-revert
- !PFE-PS2 `update` applies the partial optimistically, then writes through `tauri.updateProjectSettings`; on error reverts both the state and the snapshot
- !PFE-PS3 `branchPrefixMode` defaults to `none` when the saved settings have no value
- !PFE-PS4 `ignoreWhitespace` defaults to `false` when the saved settings have no value
