---
description: Interview-driven feature design — survey, interview, spec, implement, reconcile.
---

Run the `/wake` workflow defined in `.claude/skills/woke2/wake.md`.

Read that file in full before doing anything else, then execute its phases (Survey → Interview → Spec → Implement → Reconcile) against the following starting prompt:

$ARGUMENTS

If `$ARGUMENTS` is empty, ask the user what they want to build before proceeding.

The full skill context (`.claude/skills/woke2/SKILL.md`) is also load-bearing — read it for the spec/pragma conventions you'll need during phases 3–5.
