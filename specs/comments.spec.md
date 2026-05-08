---
name: Comment storage and line projection
description: Storing inline review comments anchored to (commit, file, range) and projecting them through subsequent commits as code shifts
---

# Comments and projection

Comments anchor to `(commit_hash, file_path, range_start, range_end)`. As Claude commits more code, lines move — every comment is **projected** through subsequent diffs to figure out where it currently lives. See [database](db.spec.md) for the schema and [diff calculation](diff.spec.md) for the diff producer.

## Storage

- !CMT-DB1 Comments live in SQLite with `(id, session_id, commit_hash, file_path, range_start, range_end, contents, created_at)`
- !CMT-DB2 `range_start >= 1` is enforced at the schema level (1-based line numbers; rejects 0)
- !CMT-DB3 `range_end` is either NULL (single-line) or strictly greater than `range_start` (rejects equal/smaller)
- !CMT-DB4 `created_at` defaults to `datetime('now')` so callers don't have to manage timestamps

## CRUD commands

- !CMT-CR1 `create_comment` validates the range against the same rules the schema enforces and returns the freshly-inserted row
- !CMT-CR2 `list_comments` returns rows for one `session_id` ordered by `created_at DESC`
- !CMT-CR3 `delete_comment` removes a single comment by id

## Projection (pure)

`project_range(change, start, end)` translates a 1-based line range from the anchor commit's coordinate system into the target's. It is pure (no I/O); the caller produces `FileChange` from a real diff.

- !CMT-PJ1 `Unchanged` is identity: range maps to itself
- !CMT-PJ2 `Deleted` orphans the range with reason `FileDeleted`
- !CMT-PJ3 `Renamed` carries the new path on the `Located` result so the frontend can follow the rename
- !CMT-PJ4 Range semantics: `end == None` is a single-line comment; otherwise `end > start`
- !CMT-PJ5 If any line in `[start, end]` was deleted by a hunk, the whole range orphans with `LineDeleted`
- !CMT-PJ6 Pure-insertion hunk (`old_lines == 0`): lines at or below `old_start` keep their position, lines after shift by `+new_lines`
- !CMT-PJ7 Top-of-file insertion (`old_start == 0`) shifts all lines down by the inserted count
- !CMT-PJ8 Pure-deletion hunk (`new_lines == 0`): lines after the deletion shift up
- !CMT-PJ9 For lines inside a hunk's old range, the new line is `new_start + (count of surviving old lines from old_start..=line) - 1`
- !CMT-PJ10 Multiple hunks accumulate offsets — only hunks fully before the line contribute
- !CMT-PJ11 Negative or zero results from offset arithmetic clamp to line 1

## Git → FileChange

`compute_file_change` runs a tree-vs-tree (or tree-vs-workdir) diff between an anchor commit and a target, finds the delta for the anchor file, and returns a `FileChange`.

- !CMT-FC1 Diff opts include untracked files (recursively) and zero context lines so hunk boundaries are tight
- !CMT-FC2 `find_similar` is enabled with renames + copies so renamed files are detected and tracked across path changes
- !CMT-FC3 `target_commit = None` diffs against workdir + index; `Some(hash)` diffs against that commit's tree
- !CMT-FC4 If the anchor file isn't in the diff at all, returns `Unchanged`
- !CMT-FC5 `Delta::Deleted` returns `FileChange::Deleted`
- !CMT-FC6 `Delta::Renamed` returns `FileChange::Renamed` with the new path; missing new path is an `InvalidPath` error
- !CMT-FC7 Hunks track per-line `deletions` (old-side line numbers removed) so projection can detect orphaning

## Workdir → HEAD anchoring

When the user opens a comment composer in a workdir-inclusive view, the comment must anchor against an immutable commit. `anchor_for_workdir` translates workdir line numbers back to HEAD positions.

- !CMT-AW1 `Identity` (file unchanged): workdir line == HEAD line
- !CMT-AW2 `EntirelyAdded` (untracked or staged-add): no HEAD counterpart — every line is uncommittable
- !CMT-AW3 Deleted file in workdir is treated as `EntirelyAdded` (cannot comment on a workdir line that doesn't exist)
- !CMT-AW4 For modified files, lines inside hunks use the recorded `new_to_old` mapping from context (` `) lines; added (`+`) lines map to `None`
- !CMT-AW5 Lines outside hunks shift by the cumulative `new_lines - old_lines` offset of preceding hunks
- !CMT-AW6 Lines after a pure deletion shift *up* (workdir line → larger HEAD line)
- !CMT-AW7 Any line in the requested range that maps to `None` returns `Uncommittable` for the whole range
- !CMT-AW8 `Anchored` carries the resolved HEAD hash and translated `(line_start, line_end)`
- !CMT-AW9 Input validation: `workdir_start >= 1`, and `workdir_end >= workdir_start` if provided

## project_comments command

- !CMT-PC1 Loads each comment by id, computes its `FileChange` against `target_commit` (or workdir), and projects its range
- !CMT-PC2 Returns one `ProjectedComment` per input id in input order, each carrying a `Located` or `Orphaned` result
