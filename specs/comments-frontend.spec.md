---
name: Comments UI (composer, panel, staging, submission)
description: The frontend half of the review-comment system — composer, list panel, staging logic, batch submission to the agent
---

# Comments UI

The UI half of the comment system. The Rust backend owns [storage and projection](comments.spec.md); this layer renders comments, manages the staging set, and renders the batch as a prompt for the agent.

## Display formatting

- !CFE-FM1 `rangeLabel(start, end)` formats a single line as `:N` and a range as `:A–B` with an en-dash (display side)
- !CFE-FM2 `displayLocation` shows projected coords once resolved (and the renamed path when the projection includes one); falls back to anchor coords while pending
- !CFE-FM3 Orphaned projections fall back to anchor coords (no projected line numbers to show)
- !CFE-FM4 Single-line projection displays as `:N` (no en-dash)
- !CFE-FM5 `isOrphaned` returns true only for `kind === "orphaned"` projections — pending and located both return false

## Submission formatting

- !CFE-SM1 `commentForSubmit` returns null when the workdir projection isn't `located` (orphaned, file deleted, or pending)
- !CFE-SM2 Uses workdir-projected `start`/`end` and the projected path on rename (else the original file_path)
- !CFE-SM3 Submission ignores the diff-view projection; only `sessionProjection` (workdir) drives whether and how a comment is sent
- !CFE-SM4 Submission line-range uses an ASCII hyphen (`A-B`) — going to the model, not the UI
- !CFE-SM5 `formatCommentsForSubmit` renders each item as a `### path:lines` heading followed by the body, separated by blank lines
- !CFE-SM6 Empty input → empty string (no leading blank line, no errant heading)

## Staging predicates

- !CFE-ST1 `isSendable` is true iff workdir projection resolved to `located` (orphaned, pending, undefined → false)
- !CFE-ST2 `shouldAutoStageNew` returns true when there are no existing sendable comments, or when every existing sendable comment is already staged — preserves "select all" intent for new comments
- !CFE-ST3 `reconcileStaged` drops staged ids whose comment was deleted or whose workdir projection resolved to non-sendable
- !CFE-ST4 `reconcileStaged` leaves pending (`null`) workdir projections in the staged set — they may still resolve to located
- !CFE-ST5 `reconcileStaged` returns the prior reference unchanged when no drops occurred (cheap re-render short-circuit)
- !CFE-ST6 `allSendableIds` returns ids of comments whose workdir projection resolved `located` — used as the "select all" target

## use-session-comments hook

- !CFE-HK1 Loads comments via `tauri.listComments(sessionId)` on mount and whenever `sessionId` changes
- !CFE-HK2 Resets the staged set on session change so staging is per-session
- !CFE-HK3 Empty `sessionId` clears the comment list (no fetch)
- !CFE-HK4 Diff-view projection re-runs whenever `selection.newer` or the comment list changes; targets `selection.newer ?? null`
- !CFE-HK5 Workdir projection runs independently on every comment-list change; always targets `null` (workdir + index)
- !CFE-HK6 Both projection effects use a request-sequence ref to drop stale responses
- !CFE-HK7 `add` prepends a new comment and auto-stages it when `shouldAutoStageNew` returns true
- !CFE-HK8 `remove` calls `tauri.deleteComment`, removes the comment, and unstages it
- !CFE-HK9 `toggleStaged` flips a single id's membership in the staged set
- !CFE-HK10 `setAllStaged(true)` stages every sendable comment; `setAllStaged(false)` clears the set
- !CFE-HK11 `prepareSubmit` snapshots the staged + sendable comments, sorted by `created_at` (oldest first) so the agent reads them in the order written
- !CFE-HK12 Stable callback identities (`add`, `remove`, `toggleStaged`, `setAllStaged`, `prepareSubmit`) — they read latest state via refs

## Comment composer

- !CFE-CP1 Auto-focuses the textarea on mount
- !CFE-CP2 Submit is blocked when the trimmed value is empty
- !CFE-CP3 Header label reads `Line N` for single-line, `Lines A–B` for ranges
- !CFE-CP4 `Esc` cancels (calls `onCancel`)
- !CFE-CP5 `Cmd/Ctrl + Enter` submits

## Comments panel

- !CFE-PN1 Renders nothing when there are no comments
- !CFE-PN2 Header shows total count and a "Send (N)" button with the staged-sendable count
- !CFE-PN3 Header checkbox is `checked` when all sendable comments are staged, `indeterminate` when some are, `false` when none — disabled when no sendable comments exist
- !CFE-PN4 Header checkbox toggle calls `onToggleAllStaged(true|false)`
- !CFE-PN5 Send button is disabled when no comments are staged or when the agent is busy
- !CFE-PN6 Each row's checkbox is disabled when its workdir projection isn't `located`; tooltip explains the reason
- !CFE-PN7 Reason text: `null` → "Checking projection…"; `file_deleted` → file message; `line_deleted` → line message
- !CFE-PN8 Diff-view-orphaned comments show an "orphaned" badge but are still listed (deleted only with the trash button)
- !CFE-PN9 Clicking the row body calls `onJump(commentId)` so the parent can scroll/select to the comment's location
- !CFE-PN10 Trash icon is hidden until row hover; clicking calls `onDelete(commentId)`
- !CFE-PN11 Panel uses CSS `contain: layout style` so checkbox flips don't invalidate the sibling diff panel's layout
