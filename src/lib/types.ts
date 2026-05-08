export type Project = {
  id: string
  name: string
  path: string
  opened_at: string
}

export type BranchPrefixMode = "none" | "full" | "feature"

export type ProjectSettings = {
  branchPrefixMode?: BranchPrefixMode
}

declare global {
  interface Window {
    __PROJECT?: Project
  }
}

export type SessionCommit = {
  commit_hash: string
  session_id: string
  /** First line of the commit message (the prompt). */
  prompt: string
  /** Commit time, unix seconds (UTC). */
  timestamp_unix: number
}

/**
 * An inclusive selection over the timeline, with each end being either a
 * commit hash or `null` (the working tree / "Current Session" pseudo-node).
 *
 * Conventions:
 *   - `older` and `newer` describe positions on the rail (older = lower in
 *     the timeline). When both are commits, `older` is the older commit.
 *   - `newer === null` means the selection extends through the working tree.
 *   - Both `null` means workdir-only (diff HEAD vs working tree).
 *   - The diff for a selection is `parent(older) → newer-or-workdir`. When
 *     `older === null` the diff is `HEAD → workdir`.
 */
export type Selection = {
  older: string | null
  newer: string | null
}

export type DiffStats = {
  commit_hash: string
  additions: number
  deletions: number
}

export type HunkLine = {
  origin: string
  content: string
  old_line_no: number | null
  new_line_no: number | null
}

export type DiffHunk = {
  old_start: number
  old_lines: number
  new_start: number
  new_lines: number
  lines: HunkLine[]
}

export type FileDiff = {
  path: string
  status: string
  old_path: string | null
  hunks: DiffHunk[]
  additions: number
  deletions: number
}

export type Comment = {
  id: string
  session_id: string
  commit_hash: string
  file_path: string
  range_start: number
  /** NULL for single-line comments. When set, strictly greater than `range_start`. */
  range_end: number | null
  contents: string
  created_at: string
}

export type OrphanReason = "line_deleted" | "file_deleted"

/**
 * Result of projecting a comment's anchor through an intervening diff.
 * - `located` — the range still has a position in the target view; `path` is
 *   set when the file was renamed.
 * - `orphaned` — the range no longer has a coherent position.
 */
export type ProjectionResult =
  | { kind: "located"; path: string | null; start: number; end: number | null }
  | { kind: "orphaned"; reason: OrphanReason }

export type ProjectedComment = {
  comment_id: string
  result: ProjectionResult
}

/**
 * Result of resolving a workdir line range to an immutable HEAD anchor for a
 * new comment. `Uncommittable` means at least one line in the range was added
 * in workdir and therefore has no HEAD counterpart to anchor against.
 */
export type AnchorForWorkdir =
  | { kind: "anchored"; commit_hash: string; line_start: number; line_end: number | null }
  | { kind: "uncommittable" }
