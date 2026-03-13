import type { TimelineEntry } from "@/lib/types"

export type ExecutionPreview =
  | { kind: "tasks"; tasks: Array<{ id: string; title: string }> }
  | { kind: "stream"; text: string }

export function deriveExecutionPreview(timeline: TimelineEntry[]): ExecutionPreview | null {
  const tasks: Array<{ id: string; title: string }> = []

  // Scan backward, collecting in-progress/pending tool_calls until we hit a user_message or system_message
  for (let i = timeline.length - 1; i >= 0; i--) {
    const entry = timeline[i]
    if (!entry) break
    if (entry.kind === "user_message" || entry.kind === "system_message") break

    if (entry.kind === "tool_call" && entry.status === "in_progress") {
      tasks.unshift({ id: entry.id, title: entry.title })
    }
  }

  if (tasks.length > 0) {
    return { kind: "tasks", tasks }
  }

  // Fallback: grab trailing text from last agent_message or agent_thought
  for (let i = timeline.length - 1; i >= 0; i--) {
    const entry = timeline[i]
    if (!entry) break
    if (entry.kind === "user_message" || entry.kind === "system_message") break

    if (entry.kind === "agent_message" || entry.kind === "agent_thought") {
      const text = entry.content.trim()
      if (text.length === 0) continue
      const truncated = text.length > 60 ? `...${text.slice(-60)}` : text
      return { kind: "stream", text: truncated }
    }
  }

  return null
}
