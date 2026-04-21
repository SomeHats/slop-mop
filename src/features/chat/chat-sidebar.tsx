import { Terminal } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { DiffStats, PromptSnapshot } from "@/lib/types"
import { cn } from "@/lib/utils"

export const CURRENT_SESSION_ID = "__current_session__"

type ChatSidebarProps = {
  snapshots: PromptSnapshot[]
  diffStats: Map<string, DiffStats>
  selectedSnapshotId: string | null
  onSelect: (id: string) => void
}

function formatTime(iso: string): string {
  const date = new Date(iso.endsWith("Z") ? iso : `${iso}Z`)
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

export function ChatSidebar({
  snapshots,
  diffStats,
  selectedSnapshotId,
  onSelect,
}: ChatSidebarProps): React.JSX.Element {
  const currentSelected = selectedSnapshotId === CURRENT_SESSION_ID

  return (
    <div className="flex w-80 flex-col overflow-hidden border-r border-border bg-background">
      <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:!block">
        <div className="flex w-full flex-col">
          <button
            type="button"
            onClick={() => onSelect(CURRENT_SESSION_ID)}
            className={cn(
              "flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left transition-colors hover:bg-accent",
              currentSelected && "bg-accent",
            )}
          >
            <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Current Session</span>
          </button>

          {snapshots.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">No prompts yet.</p>
          ) : (
            snapshots
              .slice()
              .reverse()
              .map((snap) => {
                const isSelected = snap.id === selectedSnapshotId
                const stats = diffStats.get(snap.id)
                return (
                  <button
                    key={snap.id}
                    type="button"
                    onClick={() => onSelect(snap.id)}
                    className={cn(
                      "flex w-full flex-col gap-1 border-b border-border px-3 py-2 text-left transition-colors hover:bg-accent",
                      isSelected && "bg-accent",
                    )}
                  >
                    <span className="line-clamp-2 text-xs text-foreground">{snap.prompt_text}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                        {snap.commit_hash.slice(0, 7)}
                      </Badge>
                      {stats && (stats.additions > 0 || stats.deletions > 0) ? (
                        <span className="text-[10px]">
                          <span className="text-green-400">+{stats.additions}</span>{" "}
                          <span className="text-red-400">-{stats.deletions}</span>
                        </span>
                      ) : null}
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {formatTime(snap.created_at)}
                      </span>
                    </div>
                  </button>
                )
              })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
