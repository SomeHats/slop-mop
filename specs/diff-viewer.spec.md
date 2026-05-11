---
name: Frontend diff viewer
description: Side-by-side diff renderer with collapsing, syntax highlighting, inline comments, and click+drag to comment
---

# Diff viewer

Renders the structured diff produced by [diff calculation](diff.spec.md) in a side-by-side layout. Inline comments come from the [comments UI](comments-frontend.spec.md).

## Row computation

`computeRows(hunks)` flattens hunk lines into side-by-side `SideBySideRow`s.

- !DV-RC1 Context lines (origin ` `) emit a paired row with both sides set
- !DV-RC2 Deletions (`-`) and additions (`+`) get collected into adjacent runs and zipped into paired rows
- !DV-RC3 When delete and add runs differ in length, the shorter side fills with `null` (pure-deletion or pure-addition rows)
- !DV-RC4 Original line numbers come from `old_line_no`/`new_line_no` on the hunk lines, defaulting to 0 when absent

## Sticky context (collapsed-region scope detection)

`computeStickyLines` finds the "enclosing scope openers" inside a hidden context range using indentation.

- !DV-SC1 Indent counts spaces as 1 and tabs as 4
- !DV-SC2 Walks rows in the hidden range, maintaining a stack of `{ indent, content, lineNo }` entries; pops entries with indent ≥ current line's indent (their scope closed within the hidden area)
- !DV-SC3 Skips blank lines (their indent isn't meaningful)
- !DV-SC4 Filters out stack entries whose indent ≥ the indent of the first non-blank visible line *after* the hidden region (those have already closed at the boundary)
- !DV-SC5 If there's no visible row after the hidden region (region runs to EOF), returns no sticky lines — they'd be context for nothing

## Smart bottom (collapsed-region trailing context)

`computeSmartBottom` decides how many bottom-context lines to show: walks backward looking for an indentation decrease (closing brace, dedent) and ends visible context after the last such boundary.

- !DV-SB1 Returns `maxLines` when no indent boundary is found in the candidate window
- !DV-SB2 Otherwise returns at least 1 visible bottom line; trims further when indent boundaries appear

## Collapsing

`collapseRows(rows, expansions)` collapses long runs of context.

- !DV-CL1 Identifies maximal runs of consecutive paired-context rows
- !DV-CL2 Runs of size ≤ `2 * CONTEXT_LINES + 1` (`= 7` with default 3) are emitted as-is
- !DV-CL3 Top base context = 0 when run is at start of file; otherwise `CONTEXT_LINES` (3)
- !DV-CL4 Bottom base context = 0 when run is at end of file; otherwise `computeSmartBottom(...)`
- !DV-CL5 Each region's `expansions[regionIndex]` adds `top` and `bottom` reveal counts on top of the base
- !DV-CL6 When the total visible covers the whole run, it's fully revealed (no collapse marker emitted)
- !DV-CL7 Otherwise emits the top context, a `collapsed` row carrying the hidden count + sticky lines, then the bottom context
- !DV-CL8 Chevron clicks call `handleExpandTop`/`handleExpandBottom` which add `EXPAND_STEP` (20) to the relevant counter
- !DV-CL9 `mustShowRightLines` (right-side line numbers, e.g. comment anchors) are excluded from context-run detection so they're never folded into a collapsed region; the row itself still renders inline as a paired-context row
- !DV-CL10 `SideBySideDiff` derives `mustShowRightLines` from `inlineComments.anchorLine`, so committed comments split surrounding context runs into shorter ones with their own collapse bars

## Syntax highlighting

`useHighlightedDiff` produces highlighted rows by Shiki-tokenizing the full old/new file text and merging tokens onto each visible line.

- !DV-HL1 Reconstructs old and new file text from *all* rows (not just visible) so highlighter sees full surrounding context
- !DV-HL2 Language is resolved from the file path; unknown extensions skip highlighting
- !DV-HL3 A cancellation flag drops highlighter results from a stale invocation when inputs change before the promise resolves
- !DV-HL4 Tokens are mapped per-line back to the visible rows; sticky lines pick up tokens from either old or new map (whichever matches by line number)

## Diff layout (slot machinery)

`computeDiffLayout` walks the row list once and produces in-flow slots + absolute overlays. Pure: no React, no DOM.

- !DV-LY1 Each visible row contributes a `row` slot of `rowHeightPx`
- !DV-LY2 Collapsed rows contribute a `collapsed` slot whose height is `(1 + stickyLines.length) * rowHeightPx` and a matching `CollapsedBar` overlay entry
- !DV-LY3 Comments anchored to a row's right-side line number contribute a `commentSpacer` slot using the measured `commentHeights` (missing → 0); a `CommentOverlay` records the slot's `topPx` for absolute positioning
- !DV-LY4 `commentAnchorLine(end, start)` chooses the bottom of a multi-line range as the anchor (or start for single-line) so cards sit below the last commented line

## Diff panel

- !DV-PN1 No selection → "Select a prompt to view diffs" placeholder
- !DV-PN2 Loading → centered spinner
- !DV-PN3 Selection has zero file diffs → "No changes in this range"
- !DV-PN4 Single-commit selection (`older === newer`, both non-null) shows the commit's prompt + 7-char hash above the diff
- !DV-PN5 Per-file refs are tracked in a Map; refs for files no longer in the diff get pruned on `fileDiffs` change
- !DV-PN6 `scrollToLine(filePath, lineNo)` is exposed via imperative handle so the parent (panel/comment-jump) can scroll right-side line numbers into view
- !DV-PN7 Inline comments are grouped by file path (using the projection's renamed path when present) and only `located` projections inline; orphans stay in the sidebar
- !DV-PN8 Files with no inline comments share a stable empty array reference so `<SideBySideDiff>` memoization doesn't bust each render

## Click+drag to comment

- !DV-CC1 Right-side context and addition lines accept `mousedown` + `mouseenter` to build a pending range
- !DV-CC2 Mouseup at window level finalizes the range and runs `resolveAnchor` to translate it to an immutable `(commit_hash, line_start, line_end)`
- !DV-CC3 While `resolveAnchor` is in flight, the visual highlight stays on via `validatingRange`
- !DV-CC4 If `resolveAnchor` returns `ok: false` (range crosses uncommitted additions in workdir), shows an alert and abandons the composer
- !DV-CC5 Resolved anchors open the `CommentComposer` slotted into the same overlay/spacer machinery as committed comments (sentinel id `__composer__`)
- !DV-CC6 Cards register their DOM element through a shared `ResizeObserver`; height changes feed back into `commentHeights` state and re-run the layout pass
- !DV-CC7 `commentHeights` is pruned on every render to drop entries for comments that left the inline list (or for the closed composer) — bounded growth

## Inline comment card

- !DV-IC1 Shows the comment body with whitespace preserved (`whitespace-pre-wrap`, `break-words`)
- !DV-IC2 Trash icon is hidden until row hover (group-hover); clicking calls `onDelete`
- !DV-IC3 Pencil icon (sibling of trash, also hover-revealed) toggles the card into an edit mode with a textarea seeded from the current contents
- !DV-IC4 Edit-mode textarea auto-focuses on entry
- !DV-IC5 Save is blocked when the trimmed draft is empty; an unchanged draft exits edit mode without calling `onUpdate`
- !DV-IC6 `Esc` cancels (restores the original contents and exits edit mode); `Cmd/Ctrl + Enter` saves
- !DV-IC7 Successful save calls `onUpdate(trimmedContents)` and exits edit mode

## Image diff

For image files (raster only), the row machinery is replaced with an image-aware visual diff component. Backed by [`get_file_bytes`](diff.spec.md). The file header (path + status badge) still renders.

- !DV-IMG-1 A file is treated as an image when its extension is one of `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif`, `.bmp`, `.ico` (case-insensitive)
- !DV-IMG-2 For image files the image-diff component replaces the row layout for that file; the file path + status badge header still renders
- !DV-IMG-3 Before slot fetches `parent(older)` (or `HEAD` when `older` is null); after slot fetches `newer` (or workdir when `newer` is null); on rename the before slot uses `old_path`
- !DV-IMG-4 Each side is fetched independently via `get_file_bytes`; a spinner renders until both sides resolve; per-side label renders for `missing`, load error, or `too_large` (showing size); the other slot still renders
- !DV-IMG-5 A cancellation flag drops stale fetch results when the file path or selection changes
- !DV-IMG-6 Three rendering modes: `2-up`, `fade`, `wipe`. Default `2-up`. Mode is per-file React state, not persisted
- !DV-IMG-7 Mode toggle is a 3-button segmented control centered in the file header
- !DV-IMG-8 Added (no before) and deleted (no after) image diffs render only in `2-up`; the `fade` and `wipe` toggle buttons are hidden
- !DV-IMG-9 Both sides share one scale factor: chosen so the larger image fits the available width and a 600 px height cap; images are never upscaled; the smaller image renders proportionally smaller
- !DV-IMG-10 `2-up`: before and after laid out left/right, each within its half of the panel width, scaled per DV-IMG-9
- !DV-IMG-11 `fade`: both images overlaid in a shared bounding box (sized per DV-IMG-9); a horizontal slider below the image controls blend (0 = full before, 1 = full after); default 0.5
- !DV-IMG-12 `wipe`: both images overlaid in a shared bounding box (sized per DV-IMG-9); a vertical divider with a center grab handle reveals before on the left, after on the right; dragging anywhere on the image moves the divider; default at 50%
- !DV-IMG-13 Click+drag-to-comment is disabled on image diffs

## Comment-only file diffs

`useCommentOnlyFileDiffs` synthesises FileDiff entries for files that hold non-orphaned comments but didn't change in the active diff range, so commented files always appear in the viewer.

- !DV-CO1 Iterates `comments` and includes only those whose diff-view projection is `located`; orphans never trigger synthesis
- !DV-CO2 Skips paths that already appear in the real `fileDiffs` (rename-aware: uses the projected path when present)
- !DV-CO3 Re-runs only when the missing path set or `selection.newer` target changes (stable string key) — unrelated state churn doesn't refetch
- !DV-CO4 Each missing path is fetched in parallel via `getFileLines(projectPath, path, selection.newer ?? null)`; failures and missing files are silently dropped
- !DV-CO5 Synthesised FileDiff has `status: "unchanged"`, no rename/old_path, `additions = deletions = 0`, and a single hunk where every line is origin ` ` with `old_line_no === new_line_no`
