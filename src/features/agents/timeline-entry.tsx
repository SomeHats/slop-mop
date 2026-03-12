import type { ToolCallContent } from "@agentclientprotocol/sdk"
import { structuredPatch } from "diff"
import { ChevronRight } from "lucide-react"
import { useEffect, useState } from "react"
import { Markdown } from "@/components/markdown"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { highlightTokens, type ThemedToken, tokenStyle } from "@/lib/shiki"
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
      <span className="mb-1 block text-xs font-medium text-foreground/60">You</span>
      <Markdown content={content} />
    </div>
  )
}

function AgentMessageEntry({ content }: { content: string }): React.JSX.Element {
  return (
    <div className="text-foreground/90">
      <Markdown content={content} />
    </div>
  )
}

function ThoughtEntry({ content }: { content: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const preview = content.length > 80 ? `${content.slice(0, 80)}...` : content

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 text-xs text-foreground/50 hover:text-foreground">
        <ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
        <span className="truncate italic">{open ? "Thinking" : preview}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-5 pt-1">
        <div className="text-xs text-foreground/50 italic">
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
          "flex w-full items-center gap-2 border border-border px-3 py-1.5 text-xs text-foreground/60",
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
    <div className="flex flex-col gap-2 text-xs text-foreground/70">
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
      return <DiffView path={item.path} oldText={item.oldText ?? ""} newText={item.newText} />
    case "terminal":
      return <span>Terminal: {item.terminalId}</span>
    default:
      return <span>Unknown content</span>
  }
}

const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  rs: "rust",
  py: "python",
  css: "css",
  html: "html",
  json: "json",
  md: "markdown",
  toml: "toml",
  yaml: "yaml",
  yml: "yaml",
  sh: "bash",
  bash: "bash",
  sql: "sql",
  go: "go",
}

function DiffView({
  path,
  oldText,
  newText,
}: {
  path: string
  oldText: string
  newText: string
}): React.JSX.Element {
  const patch = structuredPatch(path, path, oldText, newText, "", "", { context: 3 })
  const ext = path.split(".").pop()?.toLowerCase()
  const lang = ext ? EXT_TO_LANGUAGE[ext] : undefined

  const [tokens, setTokens] = useState<{ old: ThemedToken[][]; new: ThemedToken[][] } | null>(null)

  useEffect(() => {
    if (!lang) return
    let cancelled = false
    Promise.all([highlightTokens(oldText, lang), highlightTokens(newText, lang)]).then(
      ([oldResult, newResult]) => {
        if (cancelled || !oldResult || !newResult) return
        setTokens({ old: oldResult, new: newResult })
      },
    )
    return () => {
      cancelled = true
    }
  }, [oldText, newText, lang])

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-foreground">{path}</span>
      <pre className="overflow-x-auto bg-muted text-xs">
        {patch.hunks.map((hunk, hunkIndex) => {
          let oldLineNum = hunk.oldStart - 1
          let newLineNum = hunk.newStart - 1

          return (
            <div key={`hunk-${hunkIndex.toString()}`}>
              <div className="select-none px-2 py-0.5 text-foreground/30">
                @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
              </div>
              {hunk.lines.map((line, lineIndex) => {
                const prefix = line[0] ?? " "
                let lineTokens: ThemedToken[] | undefined

                if (prefix === "-") {
                  lineTokens = tokens?.old[oldLineNum]
                  oldLineNum++
                } else if (prefix === "+") {
                  lineTokens = tokens?.new[newLineNum]
                  newLineNum++
                } else {
                  lineTokens = tokens?.new[newLineNum] ?? tokens?.old[oldLineNum]
                  oldLineNum++
                  newLineNum++
                }

                return (
                  <div
                    key={`line-${lineIndex.toString()}`}
                    className={cn(
                      "px-2",
                      prefix === "+" && "bg-green-950/40",
                      prefix === "-" && "bg-red-950/40",
                    )}
                  >
                    <span
                      className={cn(
                        "select-none pr-2",
                        prefix === "+"
                          ? "text-green-400"
                          : prefix === "-"
                            ? "text-red-400"
                            : "text-foreground/20",
                      )}
                    >
                      {prefix}
                    </span>
                    {lineTokens ? (
                      lineTokens.map((token, ti) => (
                        <span key={ti.toString()} style={tokenStyle(token)}>
                          {token.content}
                        </span>
                      ))
                    ) : (
                      <span>{line.slice(1)}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </pre>
    </div>
  )
}
