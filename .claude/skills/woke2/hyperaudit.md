---
description: Exhaustive itemized branch audit — writes a full report to hyperaudit-report.md.
disable-model-invocation: true
---

# /woke2-hyperaudit

An exhaustive branch-level audit that writes a full markdown report to `hyperaudit-report.md` in the repo root. Unlike `/woke2-audit` (which summarizes for chat), `/woke2-hyperaudit` documents every item checked at every step so the report serves as a reviewable artifact.

### Procedure

Follow the same 15 evaluation steps as `/woke2-audit` (defined in [audit](audit.md)), but with these differences:

1. **Output format**: Write the entire report to `hyperaudit-report.md` in the repo root (overwrite if it exists). Do NOT add this file to git. After writing, tell the user the file path.

2. **Exhaustive itemization**: For every step, list every item checked and what was found. Do not skip "nothing found" — explicitly state it so the reader knows the step was performed, not forgotten.

3. **Structure**: Use the following markdown structure:

```markdown
# Hyperaudit Report

> Branch: `<branch-name>`
> Date: <date>
> Merge base: `<commit>`

## 1. Mechanical checks

<woke2:check output verbatim in a code block>

## 2. Diff scope

<summary of files changed, lines added/removed>

## 3. New behaviors

For each new behavior:

### !ID — <one-line description>

- **Spec**: `<file>:<line>`
- **Impl pragmas found**: `<file>:<line>` — <function/block name>
- **Test pragmas found**: `<file>:<line>` or "none"
- **Spec ↔ code match**: <yes/no + explanation>
- **Pragma granularity**: <ok / too coarse — explanation>
- **Uncaptured nuance**: <none / description>
- **Implementation quality**: <ok / concern — explanation>

If no new behaviors: "No new behaviors defined on this branch."

## 4. Modified behaviors

Same sub-structure as §3, but for modified behaviors. Show the before/after of the spec text.

If none: "No behaviors modified on this branch."

## 5. Removed behaviors

For each removed behavior:

### !ID — <one-line description>

- **Spec removed from**: `<file>:<line>`
- **Pragma deletions found**: <list of files/lines where pragmas were removed>
- **Residual references**: <none / list of stale references still in codebase>
- **Nuance lost**: <none / description of uncaptured behavior>

If none: "No behaviors removed on this branch."

## 6. UNTESTABLE.md changes

For each added/modified entry:

### !ID — <justification summary>

- **Genuinely untestable?**: <yes — reason / NO — should be tested because ...>
- **Justification quality**: <adequate / missing — needs to explain why, not just what>
- **Contradictory test pragma?**: <none found / FOUND at `<file>:<line>` — remove from UNTESTABLE>

If no changes: "No UNTESTABLE.md changes on this branch."

## 7. Code changes

For each meaningful diff hunk (group by file):

### `<file>` — <brief description of change>

- **Associated behaviors**: !ID1, !ID2, ...
- **Behavior drift**: <none / description of uncaptured change>
- **Cross-references checked**: <list of other pragma sites for these IDs, and whether they're still accurate>
- **Pragma granularity**: <ok / concern>
- **Risk assessment**: <safe / concern — explanation>
- **Deleted comments**: <none / list of removed rationale comments that should be preserved>

## 8. Backlog: completed items

For each backlog file:

| File        | Status        | Reason                   |
| ----------- | ------------- | ------------------------ |
| `P1_Foo.md` | not completed | <why>                    |
| `P2_Bar.md` | **completed** | <why — suggest deletion> |

Flag dependents of completed items.

## 9. Backlog: follow-up work

| Suggested item | Priority | Rationale | Depends on |
| -------------- | -------- | --------- | ---------- |
| ...            | P2       | ...       | ...        |

If none: "No follow-up items suggested."

## 10. Backlog: stale context

For each backlog file:

| File        | Stale?  | What changed  |
| ----------- | ------- | ------------- |
| `P1_Foo.md` | no      | —             |
| `P2_Bar.md` | **yes** | <description> |

## 11. Backlog: dependencies

For each backlog file with `## Depends on`:

| File        | Dependency  | Status                     |
| ----------- | ----------- | -------------------------- |
| `P2_Bar.md` | `P1_Foo.md` | valid / **stale** — reason |

Missing dependencies:

| File | Should depend on | Reason |
| ---- | ---------------- | ------ |
| ...  | ...              | ...    |

If all dependencies are valid and none missing: "All backlog dependencies are current."

## 12. TODO/FIXME/HACK sweep

For each found:

| File:Line       | Type | Text             | Action              |
| --------------- | ---- | ---------------- | ------------------- |
| `src/foo.rs:42` | TODO | "handle timeout" | create backlog item |

If none: "No new TODO/FIXME/HACK comments in diff."

## 13. Backlog priority sanity

| File        | Current | Suggested | Reason                               |
| ----------- | ------- | --------- | ------------------------------------ |
| `P3_Foo.md` | P3      | **P2**    | infrastructure landed on this branch |

If all priorities look correct: "All backlog priorities appear appropriate."

## 14. Spec file size

| File                | Lines | Verdict                         |
| ------------------- | ----- | ------------------------------- |
| `specs/foo.spec.md` | 118   | ok                              |
| `specs/bar.spec.md` | 350   | **consider splitting** — reason |

## 15. Circumspection

- **Test coverage**: <assessment>
- **Edge cases**: <any gaps?>
- **Error handling**: <any gaps?>
- **Rushed changes**: <any signs?>
```

4. **Tone**: Same as `/woke2-audit` — neutral, professional. But verbose. Every cell in every table must be filled. Empty tables with a "none" note are fine.

5. **No chat summary**: After writing the file, tell the user the path and a one-sentence summary of the overall verdict. Do not repeat the report contents in chat.
