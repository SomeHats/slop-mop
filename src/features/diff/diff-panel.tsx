import { Loader2 } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { FileDiff, Selection } from "@/lib/types"
import { SideBySideDiff } from "./side-by-side-diff"

type DiffPanelProps = {
  fileDiffs: FileDiff[]
  isLoading: boolean
  selection: Selection | null
}

export function DiffPanel({ fileDiffs, isLoading, selection }: DiffPanelProps): React.JSX.Element {
  if (!selection) {
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
        <p className="text-sm text-muted-foreground">No changes in this range</p>
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
