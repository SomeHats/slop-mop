import { Loader2 } from "lucide-react"
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useRef,
  useState,
} from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import type { FileDiff, PromptSnapshot, TimelineEntry } from "@/lib/types"
import { ExecutionPreview } from "../agents/execution-preview"
import { SideBySideDiff } from "./side-by-side-diff"

type DiffPanelProps = {
  fileDiffs: FileDiff[]
  isLoading: boolean
  selectedSnapshot: PromptSnapshot | null
  onSendPrompt: (text: string) => void
  isProcessing: boolean
  timeline: TimelineEntry[]
}

export function DiffPanel({
  fileDiffs,
  isLoading,
  selectedSnapshot,
  onSendPrompt,
  isProcessing,
  timeline,
}: DiffPanelProps): React.JSX.Element {
  const [input, setInput] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const resizeTextarea = useCallback((): void => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160).toString()}px`
  }, [])

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>): void => {
      setInput(e.target.value)
      resizeTextarea()
    },
    [resizeTextarea],
  )

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isProcessing) return
    setInput("")
    resizeTextarea()
    onSendPrompt(text)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
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
              <SideBySideDiff key={file.path} file={file} />
            ))}
          </div>
        </ScrollArea>
      )}

      <Separator />
      <ExecutionPreview timeline={timeline} isProcessing={isProcessing} />
      <form onSubmit={handleSubmit} className="flex items-end gap-2 p-3">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          disabled={isProcessing}
          rows={1}
          className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Button type="submit" disabled={isProcessing || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  )
}
