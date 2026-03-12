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
