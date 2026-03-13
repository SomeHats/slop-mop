import { Eye, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { AutoCommitPhase, DiffStats, PromptSnapshot } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AutoCommitEntry } from "./auto-commit-entry"

type PromptSidebarProps = {
  snapshots: PromptSnapshot[]
  diffStats: Map<string, DiffStats>
  selectedSnapshotId: string | null
  onSelectSnapshot: (id: string) => void
  onViewOutput: (id: string) => void
  isProcessing: boolean
  autoCommitPhase: AutoCommitPhase | null
  onViewAutoCommit: () => void
}

function formatTime(iso: string): string {
  const date = new Date(iso.endsWith("Z") ? iso : `${iso}Z`)
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

export function PromptSidebar({
  snapshots,
  diffStats,
  selectedSnapshotId,
  onSelectSnapshot,
  onViewOutput,
  isProcessing,
  autoCommitPhase,
  onViewAutoCommit,
}: PromptSidebarProps): React.JSX.Element {
  return (
    <div className="flex w-72 flex-col border-r border-border bg-background">
      <div className="px-3 py-2">
        <h2 className="text-xs font-medium text-muted-foreground">Prompts</h2>
      </div>
      {snapshots.length === 0 ? (
        <p className="px-3 text-xs text-muted-foreground">No prompts yet.</p>
      ) : (
        <ScrollArea className="flex-1">
          <div className="flex flex-col">
            {snapshots.map((snapshot, index) => {
              const isSelected = snapshot.id === selectedSnapshotId
              const isLast = index === snapshots.length - 1
              const stats = diffStats.get(snapshot.id)

              return (
                <button
                  key={snapshot.id}
                  type="button"
                  className={cn(
                    "group flex flex-col gap-1 border-b border-border px-3 py-2 text-left transition-colors hover:bg-accent",
                    isSelected && "bg-accent",
                  )}
                  onClick={() => onSelectSnapshot(snapshot.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                      {snapshot.prompt_text}
                    </span>
                    {isLast && isProcessing ? (
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          onViewOutput(snapshot.id)
                        }}
                      >
                        <Eye className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                      {snapshot.commit_hash.slice(0, 7)}
                    </Badge>
                    {stats && (stats.additions > 0 || stats.deletions > 0) ? (
                      <span className="text-[10px]">
                        <span className="text-green-400">+{stats.additions}</span>{" "}
                        <span className="text-red-400">-{stats.deletions}</span>
                      </span>
                    ) : null}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {formatTime(snapshot.created_at)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      )}
      {autoCommitPhase ? (
        <AutoCommitEntry phase={autoCommitPhase} onViewOutput={onViewAutoCommit} />
      ) : null}
    </div>
  )
}
