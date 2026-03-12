import type { ToolCallContent } from "@agentclientprotocol/sdk"
import type { TimelineEntry } from "@/lib/types"

type ToolCallEntry = Extract<TimelineEntry, { kind: "tool_call" }>
type GroupableEntry = Extract<TimelineEntry, { kind: "agent_thought" | "tool_call" }>

export type ActivityGroupSegment = {
  kind: "activity_group"
  id: string
  entries: GroupableEntry[]
}

export type PassthroughSegment = {
  kind: "passthrough"
  entry: TimelineEntry
}

export type TimelineSegment = ActivityGroupSegment | PassthroughSegment

/** Tool kinds that render standalone rather than inside activity groups. */
const UNGROUPED_KINDS = new Set(["other", "execute"])

function isUngrouped(entry: TimelineEntry): boolean {
  return entry.kind === "tool_call" && UNGROUPED_KINDS.has(entry.toolKind ?? "")
}

/** Extract file path from the first diff content item of an edit tool call. */
function editPath(entry: ToolCallEntry): string | null {
  if (entry.toolKind !== "edit") return null
  for (const item of entry.content) {
    if (item.type === "diff") return item.path
  }
  return null
}

/**
 * Merge consecutive edit tool calls targeting the same file into a single entry.
 * Uses the first entry's oldText and last entry's newText to produce a combined diff.
 */
function collapseConsecutiveEdits(entries: GroupableEntry[]): GroupableEntry[] {
  const result: GroupableEntry[] = []

  for (const entry of entries) {
    const prev = result[result.length - 1]
    if (
      entry.kind === "tool_call" &&
      prev?.kind === "tool_call" &&
      editPath(prev) !== null &&
      editPath(prev) === editPath(entry)
    ) {
      // Merge: keep prev's oldText, take entry's newText
      const prevDiff = prev.content.find(
        (c): c is Extract<ToolCallContent, { type: "diff" }> => c.type === "diff",
      )
      const merged: ToolCallEntry = {
        ...entry,
        content: prevDiff
          ? entry.content.map((item) =>
              item.type === "diff" && item.path === prevDiff.path
                ? { ...item, oldText: prevDiff.oldText ?? null }
                : item,
            )
          : entry.content,
      }
      result[result.length - 1] = merged
      continue
    }
    result.push(entry)
  }

  return result
}

function flushGroup(segments: TimelineSegment[], group: ActivityGroupSegment): void {
  const entries = collapseConsecutiveEdits(group.entries)
  if (entries.length === 1 && entries[0]) {
    segments.push({ kind: "passthrough", entry: entries[0] })
  } else {
    segments.push({ ...group, entries })
  }
}

export function groupTimeline(timeline: TimelineEntry[]): TimelineSegment[] {
  const segments: TimelineSegment[] = []
  let currentGroup: ActivityGroupSegment | null = null

  for (const entry of timeline) {
    if (isUngrouped(entry) || entry.kind === "user_message" || entry.kind === "agent_message") {
      // Break any open group, then passthrough
      if (currentGroup) {
        flushGroup(segments, currentGroup)
        currentGroup = null
      }
      segments.push({ kind: "passthrough", entry })
    } else {
      // agent_thought or groupable tool_call
      if (!currentGroup) {
        currentGroup = { kind: "activity_group", id: `group-${entry.id}`, entries: [] }
      }
      currentGroup.entries.push(entry)
    }
  }

  if (currentGroup) {
    flushGroup(segments, currentGroup)
  }

  return segments
}

export type GroupSummary = {
  state: "active" | "completed"
  label: string
}

const TOOL_KIND_LABELS: Record<string, string> = {
  read: "read",
  edit: "edited",
  write: "written",
  execute: "command run",
  search: "search",
}

function pluralize(count: number, singular: string): string {
  if (singular === "search") return `${count.toString()} ${count === 1 ? "search" : "searches"}`
  if (singular === "command run")
    return `${count.toString()} ${count === 1 ? "command run" : "commands run"}`
  return `${count.toString()} file${count === 1 ? "" : "s"} ${singular}`
}

export function summarizeGroup(entries: GroupableEntry[]): GroupSummary {
  const hasActive = entries.some(
    (e) => e.kind === "tool_call" && (e.status === "in_progress" || e.status === "pending"),
  )

  if (hasActive) {
    const last = entries[entries.length - 1]
    if (!last) return { state: "active", label: "Working..." }

    if (last.kind === "agent_thought") {
      return { state: "active", label: "Thinking..." }
    }

    if (last.status === "in_progress" || last.status === "pending") {
      return { state: "active", label: last.title }
    }

    return { state: "active", label: "Thinking..." }
  }

  // Completed — summarize by tool kind counts
  const kindCounts = new Map<string, number>()
  let thoughtCount = 0

  for (const entry of entries) {
    if (entry.kind === "agent_thought") {
      thoughtCount++
      continue
    }
    const kind = entry.toolKind ?? "unknown"
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1)
  }

  const parts: string[] = []
  for (const [kind, count] of kindCounts) {
    const label = TOOL_KIND_LABELS[kind] ?? kind
    parts.push(pluralize(count, label))
  }

  if (parts.length === 0) {
    return {
      state: "completed",
      label: `${thoughtCount.toString()} thought${thoughtCount === 1 ? "" : "s"}`,
    }
  }

  return { state: "completed", label: parts.join(", ") }
}
