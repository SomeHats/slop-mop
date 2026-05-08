---
name: Filesystem watcher
description: Per-window debounced FS watcher that emits fs-change so the diff view can refresh
---

# Filesystem watcher

`start_watching` runs a debounced recursive `notify` watcher over the project root. The frontend listens for `fs-change` to refresh the live diff.

- !WCH-S1 `start_watching` stops any prior watcher for the same window before starting a new one (no leaks on reload)
- !WCH-S2 Watches the project root recursively
- !WCH-S3 Debounces with a 300ms window (`new_debouncer`) so a rapid burst of changes coalesces into one event
- !WCH-S4 Filters out events whose path includes a `.git` segment — git's own writes don't represent user-visible changes
- !WCH-S5 Emits a `fs-change` event globally when at least one non-`.git` change is in the debounced batch
- !WCH-S6 `stop_watching` and window-destroy both drop the debouncer for the window
- !WCH-S7 `WatcherManager::stop_for_window` is the single teardown path used by both the explicit command and the destroy handler
