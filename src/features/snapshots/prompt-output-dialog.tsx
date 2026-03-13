import { useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { PromptSnapshot, TimelineEntry } from "@/lib/types"
import { ActivityGroup } from "../agents/activity-group"
import { groupTimeline } from "../agents/group-timeline"
import { TimelineEntryRow } from "../agents/timeline-entry"

type PromptOutputDialogProps = {
  snapshot: PromptSnapshot | null
  timeline: TimelineEntry[]
  isProcessing: boolean
  open: boolean
  onClose: () => void
  autoCommitAnchorId: string | null
}

function sliceTimelineForSnapshot(timeline: TimelineEntry[], messageId: string): TimelineEntry[] {
  // Find the user_message with the matching message_id
  const startIndex = timeline.findIndex(
    (entry) => entry.kind === "user_message" && entry.id === messageId,
  )
  if (startIndex === -1) return []

  // Find the next user_message after the start
  const endIndex = timeline.findIndex((entry, i) => i > startIndex && entry.kind === "user_message")

  return endIndex === -1 ? timeline.slice(startIndex) : timeline.slice(startIndex, endIndex)
}

function sliceTimelineForAutoCommit(timeline: TimelineEntry[], anchorId: string): TimelineEntry[] {
  const startIndex = timeline.findIndex(
    (entry) => entry.kind === "system_message" && entry.id === anchorId,
  )
  if (startIndex === -1) return []

  const endIndex = timeline.findIndex((entry, i) => i > startIndex && entry.kind === "user_message")

  return endIndex === -1 ? timeline.slice(startIndex) : timeline.slice(startIndex, endIndex)
}

export function PromptOutputDialog({
  snapshot,
  timeline,
  isProcessing,
  open,
  onClose,
  autoCommitAnchorId,
}: PromptOutputDialogProps): React.JSX.Element {
  const isAutoCommitMode = autoCommitAnchorId != null

  const slicedTimeline = useMemo(() => {
    if (isAutoCommitMode) {
      return sliceTimelineForAutoCommit(timeline, autoCommitAnchorId)
    }
    if (!snapshot) return []
    return sliceTimelineForSnapshot(timeline, snapshot.message_id)
  }, [snapshot, timeline, isAutoCommitMode, autoCommitAnchorId])

  const segments = useMemo(() => groupTimeline(slicedTimeline), [slicedTimeline])

  const isActive = isProcessing && slicedTimeline.length > 0

  const title = isAutoCommitMode
    ? "Auto-commit"
    : snapshot
      ? truncate(snapshot.prompt_text, 80)
      : "Prompt Output"

  const description = isAutoCommitMode
    ? "Committing uncommitted changes"
    : snapshot
      ? `Commit ${snapshot.commit_hash.slice(0, 7)}`
      : ""

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description}
            {isActive ? " — running" : ""}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 overflow-hidden [&>[data-slot=scroll-area-viewport]>div]:!block">
          <div className="flex flex-col gap-3 p-4">
            {segments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No output recorded for this prompt.</p>
            ) : (
              segments.map((segment, i) =>
                segment.kind === "passthrough" ? (
                  <TimelineEntryRow key={segment.entry.id} entry={segment.entry} />
                ) : (
                  <ActivityGroup
                    key={segment.id}
                    entries={segment.entries}
                    isLast={isActive && i === segments.length - 1}
                  />
                ),
              )
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}...`
}
