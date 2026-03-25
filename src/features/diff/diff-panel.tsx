import { Loader2 } from "lucide-react"
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { Markdown } from "@/components/markdown"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import type { FileDiff, PromptSnapshot, SessionMode, TimelineEntry } from "@/lib/types"
import { ExecutionPreview } from "../agents/execution-preview"
import { SideBySideDiff } from "./side-by-side-diff"

type DiffPanelProps = {
  fileDiffs: FileDiff[]
  isLoading: boolean
  selectedSnapshot: PromptSnapshot | null
  onSendPrompt: (text: string, modeId?: string) => void
  isProcessing: boolean
  timeline: TimelineEntry[]
  availableModes: SessionMode[]
  currentModeId: string | null
  pendingPlanContent: string | null
  onApprovePlan: () => void
  onRejectPlan: () => void
  onCancelPlan: () => void
}

function PlanDisplay({
  content,
  actions,
}: {
  content: string
  actions?: {
    onApprove: () => void
    onEdit: () => void
    onCancel: () => void
  }
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 border-t border-border bg-muted/30 p-3">
      <ScrollArea className="max-h-80">
        <Markdown content={content} />
      </ScrollArea>
      {actions ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={actions.onApprove}>
            Approve
          </Button>
          <Button size="sm" variant="secondary" onClick={actions.onEdit}>
            Edit
          </Button>
          <Button size="sm" variant="outline" onClick={actions.onCancel}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export function DiffPanel({
  fileDiffs,
  isLoading,
  selectedSnapshot,
  onSendPrompt,
  isProcessing,
  timeline,
  availableModes,
  currentModeId,
  pendingPlanContent,
  onApprovePlan,
  onRejectPlan,
  onCancelPlan,
}: DiffPanelProps): React.JSX.Element {
  const [input, setInput] = useState("")
  const [selectedModeId, setSelectedModeId] = useState(currentModeId ?? "")
  const [editingPlanContent, setEditingPlanContent] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync local selection when the agent changes the mode (e.g. autonomously)
  useEffect(() => {
    setSelectedModeId(currentModeId ?? "")
  }, [currentModeId])

  const hasModes = availableModes.length > 1

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
    setEditingPlanContent(null)
    resizeTextarea()
    // Only pass modeId if it differs from the current server-side mode
    const modeId =
      selectedModeId !== "" && selectedModeId !== currentModeId ? selectedModeId : undefined
    onSendPrompt(text, modeId)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleEdit = (): void => {
    if (pendingPlanContent) {
      setEditingPlanContent(pendingPlanContent)
    }
    onRejectPlan()
    textareaRef.current?.focus()
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
          <div className="flex flex-col gap-3 p-3">
            {fileDiffs.map((file) => (
              <SideBySideDiff key={file.path} file={file} />
            ))}
          </div>
        </ScrollArea>
      )}

      <Separator />
      {pendingPlanContent ? (
        <PlanDisplay
          content={pendingPlanContent}
          actions={{
            onApprove: onApprovePlan,
            onEdit: handleEdit,
            onCancel: onCancelPlan,
          }}
        />
      ) : editingPlanContent ? (
        <PlanDisplay content={editingPlanContent} />
      ) : (
        <ExecutionPreview timeline={timeline} isProcessing={isProcessing} />
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 p-3">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          disabled={isProcessing}
          rows={1}
          className="field-sizing-content max-h-40 min-h-9 w-full resize-none border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="flex items-center justify-between">
          {hasModes ? (
            <Select
              value={selectedModeId}
              onValueChange={setSelectedModeId}
              disabled={isProcessing}
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableModes.map((mode) => (
                  <SelectItem key={mode.id} value={mode.id}>
                    {mode.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={isProcessing || !input.trim()}>
            Send
          </Button>
        </div>
      </form>
    </div>
  )
}
