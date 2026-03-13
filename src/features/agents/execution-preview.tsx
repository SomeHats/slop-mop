import { Loader2 } from "lucide-react"
import { useMemo } from "react"
import type { TimelineEntry } from "@/lib/types"
import { deriveExecutionPreview } from "./derive-execution-preview"

type ExecutionPreviewProps = {
  timeline: TimelineEntry[]
  isProcessing: boolean
}

export function ExecutionPreview({
  timeline,
  isProcessing,
}: ExecutionPreviewProps): React.JSX.Element | null {
  const preview = useMemo(() => deriveExecutionPreview(timeline), [timeline])

  if (!isProcessing) return null

  if (!preview) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Loader2 className="size-3 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Working...</span>
      </div>
    )
  }

  if (preview.kind === "tasks") {
    return (
      <div className="flex flex-col gap-1 px-3 py-1.5">
        {preview.tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-2">
            <Loader2 className="size-3 animate-spin text-muted-foreground" />
            <span className="truncate text-xs text-muted-foreground">{task.title}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <Loader2 className="size-3 animate-spin text-muted-foreground" />
      <span className="truncate text-xs italic text-muted-foreground">{preview.text}</span>
    </div>
  )
}
