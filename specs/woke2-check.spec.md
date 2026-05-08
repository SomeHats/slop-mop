---
name: woke2 checker
description: tools/woke2-check.js validation rules — duplicate ids, orphan pragmas, broken links, backlog cycles, coverage report
---

# woke2 checker

`npm run woke2:check` runs `tools/woke2-check.js`. The shared parsing primitives live in [woke2 LSP](woke2-lsp.spec.md). The checker is a CLI: hard-fail on integrity violations (exit 1), informational on missing tests.

## File listing

- !W2C-FL1 Lists files via `git ls-files --cached --others --exclude-standard -z` so .gitignored paths are never scanned
- !W2C-FL2 Spec files are detected by `.spec.md` suffix; source files are filtered by extension (rs, ts, tsx, js, jsx, mjs, cjs, py, sh, bash, zsh)

## Validation rules (hard fails)

- !W2C-V1 Duplicate behavior IDs across all spec files report each colliding location and exit 1
- !W2C-V2 Orphan pragma references (an `// woke2 impl|test ID` whose ID isn't defined in any spec) report file:line and exit 1
- !W2C-V3 Malformed IDs in pragmas (don't match `^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$`) are reported as orphans with `(malformed ID)` annotation
- !W2C-V4 Heading-level behavior IDs are reported and fail (headings must not carry `!ID`)
- !W2C-V5 Broken cross-spec links — Markdown links of the form `label`-then-paren-`other.spec.md`-paren whose target file doesn't exist relative to the linking spec — are reported with file:line and target
- !W2C-V6 Backlog dependency cycles are detected via DFS; the cycle path is reported
- !W2C-V7 Backlog dependencies referencing files that don't exist in `backlog/` are reported with the source file and target
- !W2C-V8 Behaviors defined in specs but lacking *any* `// woke2 impl <ID>` pragma in source are reported as unimplemented and fail

## Coverage report (informational, never fails)

- !W2C-CV1 After all hard-fail checks pass, prints a count of behaviors and pragma references plus a `tested/testable` percentage
- !W2C-CV2 Behaviors listed in `UNTESTABLE.md` are subtracted from the testable set and counted as excluded
- !W2C-CV3 Lists every behavior with no `// woke2 test <ID>` pragma (excluding UNTESTABLE entries) so the agent can target missing tests
- !W2C-CV4 Marking a parent behavior as tested does not cover its children; each ID needs its own test pragma

## UNTESTABLE.md

- !W2C-UT1 Loaded from `<root>/UNTESTABLE.md`; missing file is treated as no exclusions
- !W2C-UT2 Parser uses the same `- !ID` list-item shape as spec files
- !W2C-UT3 Fenced code blocks are skipped

## Backlog parsing

- !W2C-BL1 Backlog files are `backlog/*.md`
- !W2C-BL2 `## Depends on` sections list dependencies as `- <filename>.md` (optionally followed by ` — <reason>`)
- !W2C-BL3 Subsection headings (`## …`) end the depends section
- !W2C-BL4 Fenced code blocks inside backlog files are skipped during depends-section parsing

## Cross-spec link parsing

- !W2C-LK1 Matches markdown links of shape `label`-then-paren-`path.spec.md`-paren with optional anchor (`#section`)
- !W2C-LK2 Resolves the target relative to the linking spec's directory (or the repo root for top-level specs)
- !W2C-LK3 Fenced code blocks are skipped
