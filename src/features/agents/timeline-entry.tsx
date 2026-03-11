import type { ToolCallContent } from "@agentclientprotocol/sdk"
import { ChevronRight } from "lucide-react"
import { useState } from "react"
import { Markdown } from "@/components/markdown"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { TimelineEntry } from "@/lib/types"
import { cn } from "@/lib/utils"

export function TimelineEntryRow({ entry }: { entry: TimelineEntry }): React.JSX.Element {
  switch (entry.kind) {
    case "user_message":
      return <UserMessageEntry content={entry.content} />
    case "agent_message":
      return <AgentMessageEntry content={entry.content} />
    case "agent_thought":
      return <ThoughtEntry content={entry.content} />
    case "tool_call":
      return <ToolCallEntry entry={entry} />
  }
}

function UserMessageEntry({ content }: { content: string }): React.JSX.Element {
  return (
    <div className="bg-muted px-3 py-2 text-foreground">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">You</span>
      <Markdown content={content} />
    </div>
  )
}

function AgentMessageEntry({ content }: { content: string }): React.JSX.Element {
  return (
    <div className="text-foreground/80">
      <Markdown content={content} />
    </div>
  )
}

function ThoughtEntry({ content }: { content: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const preview = content.length > 80 ? `${content.slice(0, 80)}...` : content

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
        <ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
        <span className="truncate italic">{open ? "Thinking" : preview}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-5 pt-1">
        <div className="text-xs text-muted-foreground italic">
          <Markdown content={content} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

const statusVariants: Record<string, "secondary" | "default" | "destructive" | "outline"> = {
  pending: "secondary",
  in_progress: "default",
  completed: "outline",
  failed: "destructive",
}

function ToolCallEntry({
  entry,
}: {
  entry: Extract<TimelineEntry, { kind: "tool_call" }>
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const hasContent = entry.content.length > 0

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        disabled={!hasContent}
        className={cn(
          "flex w-full items-center gap-2 border border-border px-3 py-1.5 text-xs text-muted-foreground",
          hasContent && "hover:text-foreground",
        )}
      >
        {hasContent ? (
          <ChevronRight
            className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")}
          />
        ) : (
          <span className="size-3 shrink-0" />
        )}
        <span className="flex-1 truncate text-left">{entry.title}</span>
        <Badge variant={statusVariants[entry.status] ?? "secondary"}>{entry.status}</Badge>
      </CollapsibleTrigger>
      {hasContent ? (
        <CollapsibleContent className="border-x border-b border-border px-3 py-2">
          <ToolCallContentView content={entry.content} />
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  )
}

function ToolCallContentView({ content }: { content: ToolCallContent[] }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 text-xs text-muted-foreground">
      {content.map((item, index) => (
        <ToolCallContentItem key={`${item.type}-${index.toString()}`} item={item} />
      ))}
    </div>
  )
}

function ToolCallContentItem({ item }: { item: ToolCallContent }): React.JSX.Element {
  switch (item.type) {
    case "content": {
      const block = item.content
      if (block.type === "text") {
        return <Markdown content={block.text} />
      }
      return <span>Non-text content</span>
    }
    case "diff":
      return (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{item.path}</span>
          {item.oldText != null ? (
            <pre className="overflow-x-auto bg-muted p-2 text-xs">{item.oldText}</pre>
          ) : null}
        </div>
      )
    case "terminal":
      return <span>Terminal: {item.terminalId}</span>
    default:
      return <span>Unknown content</span>
  }
}
