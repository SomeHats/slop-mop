import type { ToolCallContent, ToolCallStatus, ToolKind } from "@agentclientprotocol/sdk"

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

export type PreviousSession = {
  sessionId: string
  title: string | null
  updatedAt: string | null
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

export type TimelineEntry =
  | { kind: "user_message"; id: string; content: string }
  | { kind: "system_message"; id: string; content: string }
  | { kind: "agent_message"; id: string; content: string }
  | { kind: "agent_thought"; id: string; content: string }
  | {
      kind: "tool_call"
      id: string
      title: string
      status: ToolCallStatus
      toolKind?: ToolKind
      content: ToolCallContent[]
      rawInput?: unknown
      rawOutput?: unknown
    }
