import { Badge } from "@/components/ui/badge"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { PromptSnapshot } from "../../lib/types"

type SnapshotSidebarProps = {
  snapshots: PromptSnapshot[]
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}...`
}

function formatTime(iso: string): string {
  // SQLite datetime('now') produces UTC without a Z suffix — ensure it's parsed as UTC
  const date = new Date(iso.endsWith("Z") ? iso : `${iso}Z`)
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

export function SnapshotSidebar({ snapshots }: SnapshotSidebarProps): React.JSX.Element {
  return (
    <div className="flex w-64 flex-col border-l border-border bg-background">
      <div className="px-3 py-2">
        <h2 className="text-xs font-medium text-muted-foreground">Prompt History</h2>
      </div>
      {snapshots.length === 0 ? (
        <p className="px-3 text-xs text-muted-foreground">No prompts yet.</p>
      ) : (
        <ScrollArea className="flex-1">
          <ItemGroup>
            {snapshots.map((snapshot) => (
              <Item key={snapshot.id} size="sm">
                <ItemContent>
                  <ItemTitle className="flex items-center gap-2">
                    <span className="flex-1 truncate text-xs">
                      {truncate(snapshot.prompt_text, 60)}
                    </span>
                    <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                      {snapshot.commit_hash.slice(0, 7)}
                    </Badge>
                  </ItemTitle>
                  <ItemDescription className="text-[10px]">
                    {formatTime(snapshot.created_at)}
                  </ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        </ScrollArea>
      )}
    </div>
  )
}
