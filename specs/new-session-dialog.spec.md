---
name: New-session decision dialog
description: Modal asking the user whether a freshly-issued Claude session id is a continuation (alias) or a new task
---

# New-session decision dialog

When Claude issues a fresh session id mid-flow (`/clear`, `/compact`, etc.) the [session hook](session-hook.spec.md) raises `pendingNewSession`. This dialog presents the two options and routes the user's pick back to the hook. See [session aliasing](commits.spec.md) for the storage half.

- !SES-DG1 Renders open whenever `pending !== null`; closed otherwise
- !SES-DG2 Non-dismissible — Esc, outside-click, and the default `X` close affordance are all suppressed so the user has to make a choice
- !SES-DG3 Surfaces a human-readable hint about *what* triggered the new session (mapped from `pending.source` — `clear`, `compact`, `resume`, otherwise a generic fallback) and presents two side-by-side equal-width actions matching the header's horizontal padding: "Clear" → `onAccept` (drops history, starts a fresh primary) and "Keep history" → `onAlias` (records the new id under the current primary)
- !SES-DG4 "Keep history" receives initial keyboard focus when the dialog opens, so the destructive "Clear" action is never the Enter-key default. This matches the existing visual emphasis (Keep history uses the primary variant) and biases the accidental keypress toward preserving review state.
