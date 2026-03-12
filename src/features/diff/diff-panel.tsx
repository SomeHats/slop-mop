import { Loader2 } from "lucide-react"
import { type FormEvent, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import type { FileDiff, PromptSnapshot } from "@/lib/types"
import { cn } from "@/lib/utils"

type DiffPanelProps = {
  fileDiffs: FileDiff[]
  isLoading: boolean
  selectedSnapshot: PromptSnapshot | null
  onSendPrompt: (text: string) => void
  isProcessing: boolean
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  added: "default",
  deleted: "destructive",
  modified: "secondary",
  renamed: "outline",
}

export function DiffPanel({
  fileDiffs,
  isLoading,
  selectedSnapshot,
  onSendPrompt,
  isProcessing,
}: DiffPanelProps): React.JSX.Element {
  const [input, setInput] = useState("")

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isProcessing) return
    setInput("")
    onSendPrompt(text)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {!selectedSnapshot ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Select a prompt to view diffs</p>
        </div>
      ) : isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : fileDiffs.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">No changes since this prompt</p>
        </div>
      ) : (
        <ScrollArea className="flex-1 overflow-hidden [&>[data-slot=scroll-area-viewport]>div]:!block">
          <div className="flex flex-col gap-4 p-4">
            {fileDiffs.map((file) => (
              <FileDiffView key={file.path} file={file} />
            ))}
          </div>
        </ScrollArea>
      )}

      <Separator />
      <form onSubmit={handleSubmit} className="flex gap-2 p-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Send a message..."
          disabled={isProcessing}
        />
        <Button type="submit" disabled={isProcessing || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  )
}

function FileDiffView({ file }: { file: FileDiff }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-xs font-medium text-foreground">{file.path}</span>
        <Badge variant={STATUS_VARIANTS[file.status] ?? "secondary"} className="text-[10px]">
          {file.status}
        </Badge>
        <span className="text-[10px]">
          <span className="text-green-400">+{file.additions}</span>{" "}
          <span className="text-red-400">-{file.deletions}</span>
        </span>
      </div>
      {file.old_path ? (
        <span className="text-[10px] text-muted-foreground">from {file.old_path}</span>
      ) : null}
      <pre className="overflow-x-auto bg-muted text-xs">
        {file.hunks.map((hunk, hunkIndex) => (
          <div key={`hunk-${hunkIndex.toString()}`}>
            <div className="select-none px-2 py-0.5 text-foreground/30">
              @@ -{hunk.old_start},{hunk.old_lines} +{hunk.new_start},{hunk.new_lines} @@
            </div>
            {hunk.lines.map((line, lineIndex) => (
              <div
                key={`line-${lineIndex.toString()}`}
                className={cn(
                  "px-2",
                  line.origin === "+" && "bg-green-950/40",
                  line.origin === "-" && "bg-red-950/40",
                )}
              >
                <span
                  className={cn(
                    "select-none pr-2",
                    line.origin === "+"
                      ? "text-green-400"
                      : line.origin === "-"
                        ? "text-red-400"
                        : "text-foreground/20",
                  )}
                >
                  {line.origin}
                </span>
                <span>{line.content}</span>
              </div>
            ))}
          </div>
        ))}
      </pre>
    </div>
  )
}
