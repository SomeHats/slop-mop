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
- !DIF-R7 `ignore_whitespace = true` enables git2 `DiffOptions::ignore_whitespace` so whitespace-only line changes don't appear as differences (whitespace-only file changes drop out of the result entirely); default `false` matches plain `git diff`

## Line collation

- !DIF-L1 Trailing `\n` and `\r` are stripped from each line content (renderer handles line breaks)
- !DIF-L2 Only origins `+`, `-`, and ` ` (context) populate hunk lines; other origin chars (header lines etc.) are skipped
- !DIF-L3 Per-file `additions`/`deletions` are counted from `+` and `-` origins as the diff is walked
- !DIF-L4 Unrecognised `Delta` variants log a warning and map to `"unknown"` status

## File-content reads

`get_file_lines(file_path, target_commit)` returns the lines of a file at a given target so the frontend can synthesise FileDiff entries for files that hold non-orphaned comments but didn't change in the active diff.

- !DIF-FL1 `target_commit = Some(hash)` reads the blob from that commit's tree
- !DIF-FL2 `target_commit = None` reads from the workdir (filesystem path under `project_path`)
- !DIF-FL3 Returns `Ok(None)` when the file doesn't exist at the target (missing blob entry, missing workdir file, or non-utf8 content) — never raises
- !DIF-FL4 Errors with `NotAGitRepo` when `project_path` isn't inside a git repo

## Binary file-content reads

`get_file_bytes(file_path, target_commit)` returns raw bytes for binary content (used by the image diff viewer). Same target semantics as `get_file_lines`.

- !DIF-FB1 Returns a tagged `FileBytesResult`: `{ kind: "ok", data, mime }` (base64-encoded bytes plus extension-derived mime type) for blobs ≤ 5 MB, `{ kind: "too_large", size }` for larger blobs (size in bytes), `{ kind: "missing" }` when the file doesn't exist at the target. Reads commit blob when `target_commit = Some`, workdir file when `None`. Errors only on `NotAGitRepo`.

## Diff target resolution

`resolve_before_target(older_hash)` resolves the "before" commit hash for an image-diff selection, matching the base-tree rules used by `get_range_diff`.

- !DIF-RT1 Returns `parent(older_hash)` when `older_hash` is `Some`, or the HEAD commit hash when `None`. Returns `Ok(None)` when there is no parent (root commit) or no HEAD (empty repo). Errors only on `NotAGitRepo`.
