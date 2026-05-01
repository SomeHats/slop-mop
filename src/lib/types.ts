export type Project = {
  id: string
  name: string
  path: string
  opened_at: string
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
