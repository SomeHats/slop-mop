import { Loader2 } from "lucide-react"
import { Markdown } from "@/components/markdown"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import type { FileDiff, PromptSnapshot } from "@/lib/types"
import { SideBySideDiff } from "./side-by-side-diff"

type DiffPanelProps = {
  fileDiffs: FileDiff[]
  isLoading: boolean
  selectedSnapshot: PromptSnapshot | null
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
  actions: {
    onApprove: () => void
    onReject: () => void
    onCancel: () => void
  }
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ScrollArea className="flex-1 overflow-hidden">
        <div className="p-4">
          <Markdown content={content} />
        </div>
      </ScrollArea>
      <Separator />
      <div className="flex gap-2 p-3">
        <Button size="sm" onClick={actions.onApprove}>
          Approve
        </Button>
        <Button size="sm" variant="secondary" onClick={actions.onReject}>
          Edit
        </Button>
        <Button size="sm" variant="outline" onClick={actions.onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function DiffPanel({
  fileDiffs,
  isLoading,
  selectedSnapshot,
  pendingPlanContent,
  onApprovePlan,
  onRejectPlan,
  onCancelPlan,
}: DiffPanelProps): React.JSX.Element {
  if (pendingPlanContent) {
    return (
      <PlanDisplay
        content={pendingPlanContent}
        actions={{
          onApprove: onApprovePlan,
          onReject: onRejectPlan,
          onCancel: onCancelPlan,
        }}
      />
    )
  }

  if (!selectedSnapshot) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Select a prompt to view diffs</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (fileDiffs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">No changes since this prompt</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full overflow-hidden [&>[data-slot=scroll-area-viewport]>div]:!block">
      <div className="flex flex-col gap-3 p-3">
        {fileDiffs.map((file) => (
          <SideBySideDiff key={file.path} file={file} />
        ))}
      </div>
    </ScrollArea>
  )
}
