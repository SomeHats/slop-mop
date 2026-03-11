import type { ToolCallContent, ToolCallStatus, ToolKind } from "@agentclientprotocol/sdk"

export type Project = {
  id: string
  name: string
  path: string
  opened_at: string
}

export type PreviousSession = {
  sessionId: string
  title: string | null
  updatedAt: string | null
}

export type TimelineEntry =
  | { kind: "user_message"; id: string; content: string }
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
