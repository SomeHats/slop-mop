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

export type PromptSnapshot = {
  id: string
  session_id: string
  project_id: string
  message_id: string
  prompt_text: string
  commit_hash: string
  created_at: string
}

export type DiffStats = {
  snapshot_id: string
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
