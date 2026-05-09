---
name: Misc React hooks
description: useDiffStats, useRangeDiff, useFullscreen, useScrollIntoView
---

# Misc hooks

## useDiffStats

Caches `+/-` totals per commit so the [chat sidebar](chat-sidebar.spec.md) doesn't refetch on every render.

- !DS-1 Re-fetches only when the *set* of commit hashes changes (joined-string key cache)
- !DS-2 Empty `commits` clears the map immediately (no fetch)
- !DS-3 Cancellation flag drops late results from a stale invocation
- !DS-4 Failures leave the previous map in place (non-critical: stats are eye-candy)

## useRangeDiff

Drives the [diff viewer](diff-viewer.spec.md) — fetches `getRangeDiff` and refreshes on FS changes when the diff is workdir-inclusive.

- !RD-1 Selection changes refetch only when the `(older|newer)` key changes (avoids re-firing on identity-only re-renders)
- !RD-2 No selection → empty file list, not-loading
- !RD-3 Cancellation flag drops late results
- !RD-4 Subscribes to `fs-change` and refetches *only* when the selection's `newer` end is `null` (workdir) — fixed-commit ranges aren't affected by editor changes
- !RD-5 FS-change refetches are debounced 200ms so a save burst doesn't trigger a flurry of fetches
- !RD-6 `ignoreWhitespace` is part of the cache key and is forwarded to `getRangeDiff`; toggling it triggers a refetch and FS-change refetches use the latest value

## useFullscreen

Reflects the OS window's fullscreen state into React. Used by [app shell](app-shell.spec.md) to adjust traffic-light padding.

- !FS-1 Reads initial fullscreen state on mount
- !FS-2 Subscribes to `onResized` and re-checks fullscreen state on every resize event

## useScrollIntoView

Returns a ref + a `scrollAfterExpand` callback for collapsibles — scrolls the element into view *after* the expansion animation completes.

- !SV-1 Uses double `requestAnimationFrame` to wait for Radix to lay out its expanded content before measuring
- !SV-2 Measures via `closest("[data-slot=scroll-area-viewport]")` — depends on the parent ScrollArea structure
- !SV-3 If the element fits in the viewport (with 12px padding), scrolls minimally to bring it fully into view
- !SV-4 If the element doesn't fit, pins its top to the viewport top (with 12px padding)
