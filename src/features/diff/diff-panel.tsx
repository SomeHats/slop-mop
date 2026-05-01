import { Loader2 } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { FileDiff, Selection, SessionCommit } from "@/lib/types"
import { SideBySideDiff } from "./side-by-side-diff"

type DiffPanelProps = {
  fileDiffs: FileDiff[]
  isLoading: boolean
  selection: Selection | null
  commits: SessionCommit[]
}

export function DiffPanel({
  fileDiffs,
  isLoading,
  selection,
  commits,
}: DiffPanelProps): React.JSX.Element {
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

  // Single-commit view: older === newer && both non-null. Show its message above the diff.
  const singleCommit =
    selection.older !== null && selection.older === selection.newer
      ? (commits.find((c) => c.commit_hash === selection.older) ?? null)
      : null

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
        {singleCommit && (
          <div className="border border-border bg-muted/30 px-3 py-2">
            <p className="whitespace-pre-wrap text-xs text-foreground">{singleCommit.prompt}</p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              {singleCommit.commit_hash.slice(0, 7)}
            </p>
          </div>
        )}
        {fileDiffs.map((file) => (
          <SideBySideDiff key={file.path} file={file} />
        ))}
      </div>
    </ScrollArea>
  )
}
