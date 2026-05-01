import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { DiffStats, SessionCommit } from "@/lib/types"
import { cn } from "@/lib/utils"
import { CurrentSessionEntry } from "./current-session-entry"

type ChatSidebarProps = {
  commits: SessionCommit[]
  diffStats: Map<string, DiffStats>
  selectedCommitHash: string | null
  onSelect: (hash: string | null) => void
  committing: boolean
}

function formatTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  const hours = d.getHours().toString().padStart(2, "0")
  const minutes = d.getMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

export function ChatSidebar({
  commits,
  diffStats,
  selectedCommitHash,
  onSelect,
  committing,
}: ChatSidebarProps): React.JSX.Element {
  return (
    <div className="flex w-80 flex-col overflow-hidden border-r border-border bg-background">
      <CurrentSessionEntry
        selected={selectedCommitHash === null}
        onSelect={() => onSelect(null)}
        committing={committing}
      />
      <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:!block">
        <div className="flex w-full flex-col">
          {commits.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">No prompts yet.</p>
          ) : (
            commits.map((commit) => {
              const isSelected = commit.commit_hash === selectedCommitHash
              const stats = diffStats.get(commit.commit_hash)
              return (
                <button
                  key={commit.commit_hash}
                  type="button"
                  onClick={() => onSelect(commit.commit_hash)}
                  className={cn(
                    "flex w-full flex-col gap-1 border-b border-border px-3 py-2 text-left transition-colors hover:bg-accent",
                    isSelected && "bg-accent",
                  )}
                >
                  <span className="line-clamp-2 text-xs text-foreground">{commit.prompt}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                      {commit.commit_hash.slice(0, 7)}
                    </Badge>
                    {stats && (stats.additions > 0 || stats.deletions > 0) ? (
                      <span className="text-[10px]">
                        <span className="text-green-400">+{stats.additions}</span>{" "}
                        <span className="text-red-400">-{stats.deletions}</span>
                      </span>
                    ) : null}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {formatTime(commit.timestamp_unix)}
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
