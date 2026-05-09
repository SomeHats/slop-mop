---
name: Chat sidebar (commit list)
description: The left rail listing the Current Session row and one row per prompt commit, with click/drag selection and a connected node graph
---

# Chat sidebar

The sidebar lists the user's prompt commits — one row per commit, plus a sticky "Current Session" row at the top representing the workdir. Selection drives the [diff viewer](diff-viewer.spec.md). Commits arrive via [auto-commit events](claude.spec.md) and [session commit log](commits.spec.md).

## Rows

- !CHT-R1 The first row is always "Current Session" (workdir, key=`null`); subsequent rows are commits in newest-first order
- !CHT-R2 Empty state shows "No prompts yet." when there are no commits
- !CHT-R3 Each commit row shows: subject (line-clamped to 2 lines), 7-char short hash badge, `+N -N` stats when available, and HH:MM time
- !CHT-R4 The full commit message is exposed as the row's `title` so hover reveals body and trailers
- !CHT-R5 "Current Session" row sticks to the top of the scroll area and shows a `committing…` spinner when a commit is in flight

## Prefix stripping

- !CHT-PF1 When `currentPrefix` is non-null, displayed subjects strip a matching `${prefix}: ` head
- !CHT-PF2 Subjects whose prefix doesn't match the current prefix are shown as-stored — the rule is "strip only the *current* prefix" (different from before reflects a setting change)

## Rail (visual graph)

- !CHT-RL1 Each row owns a 24px-wide rail column; node circle is centered
- !CHT-RL2 Top half-line and bottom half-line are drawn separately so the segment between two adjacent rows lights up only when *both* endpoints are inside the selection
- !CHT-RL3 Selected nodes are filled purple; unselected nodes are outlined; hover on an unselected node lights its border purple
- !CHT-RL4 No-selection state lights only the Current Session node (back-to-terminal mode)
- !CHT-RL5 First row has no top half-line; last row has no bottom half-line

## Selection interactions

- !CHT-SL1 Single-click on a commit selects from that commit through the present (`{older, newer: null}`)
- !CHT-SL2 Single-click on Current Session clears the selection (`null`) — back to terminal
- !CHT-SL3 Double-click on any row selects just that single point (`{older: key, newer: key}`)
- !CHT-SL4 Drag from one row to another selects the inclusive range; older = the row further down (older in time), newer = the closer-to-top row
- !CHT-SL5 Drag threshold is 4px in either axis — smaller movements stay clicks
- !CHT-SL6 A click suppression flag prevents the post-drag click from immediately overwriting the drag selection
- !CHT-SL7 Mouse-down resets the suppression flag at the start of every gesture (otherwise a stale flag from a cross-row drag would swallow the next real click)
- !CHT-SL8 A global `mouseup` listener resets drag refs even when the mouseup lands outside the sidebar

## Time formatting

- !CHT-TM1 Times render as zero-padded `HH:MM` from `timestamp_unix`

## Session boundary divider

When the user runs `/clear` (or `/compact`, `/resume` to a known session) mid-flow, subsequent commits carry a different claude trailer id even though they belong to the same slop-mop primary. The sidebar marks each such transition between adjacent commit rows.

- !CHT-DV1 Renders a divider between any two adjacent commit rows whose `session_id` trailer values differ (newer above, older below)
- !CHT-DV2 Divider visual: a thin row whose `border-t` is on the content area only (not the rail column, matching how existing commit rows draw their separator), a continuous rail vertical line drawn through the rail column (no node), and the `/clear` label in muted-foreground inline to the right of the rail. The next commit row's existing `border-t` closes the bottom of the divider
- !CHT-DV3 Divider is inert: not part of the rail row index, no mouse handlers, doesn't break selection ranges or drag (a drag from the row above to the row below proceeds as if the divider weren't there)
