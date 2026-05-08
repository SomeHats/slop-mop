---
name: App shell
description: Top-level App component — picks between picker and project view, wires session/comments/diff state together
---

# App shell

`App` is the root React component. It chooses between [picker](projects-frontend.spec.md) and `ProjectApp` based on whether `window.__PROJECT` was injected by the backend at window creation time.

## Top-level routing

- !APP-RT1 If `window.__PROJECT` is undefined, renders `<ProjectPicker />`
- !APP-RT2 If `window.__PROJECT` is set, renders `<ProjectApp>` with its `path`, `id`, `name`

## Session bootstrap

- !APP-SB1 Starts the FS watcher on mount via `tauri.startWatching(projectPath)`
- !APP-SB2 Refetches commits whenever the user changes branch-prefix mode (so the sidebar's `currentPrefix` updates)
- !APP-SB3 When the Stop hook lands a new commit, jumps the selection to that commit so the user sees what just changed

## Comment workflows

- !APP-CM1 `handleResolveAnchor` resolves a clicked diff range: in commit mode (selection.newer non-null), uses that hash directly; in workdir mode, calls `anchorForWorkdir` to translate workdir lines back to HEAD
- !APP-CM2 Successful workdir anchoring returns the resolved `(commit_hash, line_start, line_end)`; "uncommittable" returns `{ ok: false }`
- !APP-CM3 `handleSubmitComment` writes the comment via `tauri.createComment` and adds it to the session list
- !APP-CM4 No-op submit when no `sessionId` (defensive against early submission)
- !APP-CO1 Merges synthesised comment-only file diffs after the real ones so files containing non-orphaned comments always appear in the diff view, even when unchanged in the active range

## Submit staged comments to agent

- !APP-SS1 No-op when the agent is busy (belt-and-braces; the button is also disabled)
- !APP-SS2 Drops staged comments through `prepareSubmit` to get ordered, sendable payloads
- !APP-SS3 Sends Ctrl-S (0x13) first to clear any half-typed text in Claude Code's input box
- !APP-SS4 Writes the formatted body and the submitting `\r` as *separate* PTY writes with a 50ms delay — when text + `\r` arrive in one read() Claude treats it as a paste and the `\r` becomes literal input instead of a submit
- !APP-SS5 Removes the sent comments from storage (also clears them from the staged set)
- !APP-SS6 Pops the selection back to `null` so the user sees the agent take the comments

## Jump-to-comment

- !APP-JC1 If the comment's diff-view projection is `located`, scrolls to that line in the active diff via the imperative `DiffPanelHandle.scrollToLine`
- !APP-JC2 If scroll fails (file isn't currently rendered) or the projection isn't located, navigates the selection to the comment's anchor commit so the user sees it in its original place

## Layout chrome

- !APP-LC1 Title bar carries the project name + a settings button; row is `data-tauri-drag-region` so the user can drag the window
- !APP-LC2 When fullscreen is off, leaves 78px of left padding for the macOS traffic lights
- !APP-LC3 The terminal stays mounted in layout (real dimensions) at all times — covered with `inert` + `aria-hidden` when the diff is shown — so xterm's buffer survives navigation
- !APP-LC4 Diff panel only renders (overlay-style) when a selection is active
- !APP-LC5 New-session button overlays the `--resume` picker only when sessionId is null and the user is in resume mode and the agent is connected — pressing it triggers `restart({ resume: false })`
- !APP-LC6 Errors from the session are surfaced in a destructive-styled bar above the main content
- !APP-LC7 Workdir-inclusive views (`selection.newer === null`) are commentable; anchor resolution happens lazily per-click
