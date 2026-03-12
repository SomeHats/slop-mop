import { ChevronRight } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useScrollIntoView } from "@/hooks/use-scroll-into-view"
import { cn } from "@/lib/utils"
import type { ActivityGroupSegment } from "./group-timeline"
import { summarizeGroup } from "./group-timeline"
import { TimelineEntryRow } from "./timeline-entry"

type ActivityGroupProps = {
  entries: ActivityGroupSegment["entries"]
  isLast: boolean
}

export function ActivityGroup({ entries, isLast }: ActivityGroupProps): React.JSX.Element {
  const [open, setOpen] = useState(isLast)
  const userToggled = useRef(false)

  // Auto-expand/collapse based on isLast, unless user manually toggled
  useEffect(() => {
    if (!userToggled.current) {
      setOpen(isLast)
    }
  }, [isLast])

  const { ref: rootRef, scrollAfterExpand } = useScrollIntoView()

  const handleOpenChange = (next: boolean): void => {
    userToggled.current = true
    setOpen(next)
    if (next) scrollAfterExpand()
  }

  const { state, label } = summarizeGroup(entries)

  const failureCount = entries.filter((e) => e.kind === "tool_call" && e.status === "failed").length

  return (
    <Collapsible ref={rootRef} open={open} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 border border-border px-3 py-1.5 text-xs text-foreground/60 hover:text-foreground">
        <ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
        <span className="flex-1 truncate text-left">{label}</span>
        {state === "active" ? (
          <Badge variant="default">working</Badge>
        ) : failureCount > 0 ? (
          <Badge variant="destructive">{failureCount.toString()} failed</Badge>
        ) : (
          <Badge variant="outline">{entries.length.toString()}</Badge>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 border-x border-b border-border p-3">
        {entries.map((entry) => (
          <TimelineEntryRow key={entry.id} entry={entry} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
