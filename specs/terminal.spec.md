---
name: Terminal panel (xterm)
description: The xterm.js view wired to the Claude PTY through use-claude-session
---

# Terminal panel

The terminal embeds [xterm.js](https://xtermjs.org/) and pipes Claude's PTY output / user input to and from the [Rust backend](claude.spec.md) via `use-claude-session`.

## xterm setup

- !TRM-S1 Configures JetBrains Mono Variable as the primary font, falling back through ui-monospace
- !TRM-S2 Font size 13, 10,000-line scrollback, blinking cursor, `convertEol: false` (the PTY already emits `\r\n`)
- !TRM-S3 Loads the Shiki-derived `terminalTheme` so terminal colors match the in-app code highlight palette
- !TRM-S4 `allowProposedApi: true` so xterm addons can use experimental hooks

## Layout and sizing

- !TRM-L1 `FitAddon` resizes xterm to fill its container; `ResizeObserver` re-fits when the container changes size
- !TRM-L2 After every fit, calls `resize(cols, rows)` to mirror the new size to the PTY backend (only when both dims > 0)
- !TRM-L3 Initial fit is allowed to fail silently when the container is 0×0 mid-mount (will retry via the observer)

## I/O wiring

- !TRM-IO1 Subscribes to `onOutput` and writes incoming bytes to xterm
- !TRM-IO2 `onData` from xterm encodes the user's input as UTF-8 bytes and forwards via `writeInput` (which base64-wraps for IPC)

## Visibility transitions

- !TRM-V1 The terminal stays in layout (real dimensions) at all times, so visibility changes don't trigger a resize
- !TRM-V2 When becoming visible, calls `term.refresh(0, rows-1)` to wake xterm's renderer and focuses the terminal
- !TRM-V3 When hidden, blurs the terminal so keystrokes don't go to a hidden tab

## Cleanup

- !TRM-C1 Unmount disconnects the ResizeObserver, disposes the data subscription, unsubscribes from output, and disposes the terminal
