---
name: Backend diff calculation
description: Per-commit diff stats and range-diff hunks served to the frontend diff renderer
---

# Diff calculation

The Rust backend produces structured diffs that the frontend renders. See [comments projection](comments.spec.md) for a related but distinct diff path used to project comment ranges.

## Diff stats

`batch_diff_stats` is used by the chat sidebar to show `+/-` badges on each commit row.

- !DIF-S1 Diffs each commit against its first parent; root commits diff against an empty tree so additions count
- !DIF-S2 Includes untracked files in the diff (`include_untracked = true`)
- !DIF-S3 Uses 100,000 context lines so unchanged regions appear in full
- !DIF-S4 Returns one `DiffStats` (`commit_hash`, `additions`, `deletions`) per requested commit
- !DIF-S5 Errors with `NotAGitRepo` when `project_path` isn't inside a git repo

## Range diff

`get_range_diff(older_hash, newer_hash)` powers the side-by-side diff view.

- !DIF-R1 Both `None` diffs HEAD vs working tree (workdir-only — live changes)
- !DIF-R2 `older_hash = Some, newer_hash = None` diffs the older commit's parent vs workdir
- !DIF-R3 Both `Some` diffs `older.parent` vs `newer` (inclusive range)
- !DIF-R4 Includes untracked files recursively
- !DIF-R5 100,000 context lines so the entire file is returned (frontend computes its own collapsing)
- !DIF-R6 Returns `FileDiff[]` with status (`added`/`deleted`/`modified`/`renamed`/`copied`/`typechange`/`unknown`), old path on rename, hunks with `(old_start, old_lines, new_start, new_lines)`, and `HunkLine[]` carrying origin (`+`/`-`/` `), content, and old/new line numbers

## Line collation

- !DIF-L1 Trailing `\n` and `\r` are stripped from each line content (renderer handles line breaks)
- !DIF-L2 Only origins `+`, `-`, and ` ` (context) populate hunk lines; other origin chars (header lines etc.) are skipped
- !DIF-L3 Per-file `additions`/`deletions` are counted from `+` and `-` origins as the diff is walked
- !DIF-L4 Unrecognised `Delta` variants log a warning and map to `"unknown"` status
