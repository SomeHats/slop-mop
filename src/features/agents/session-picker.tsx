import { Button } from "@/components/ui/button"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { PreviousSession } from "@/lib/types"

type SessionPickerProps = {
  sessions: PreviousSession[]
  isProcessing: boolean
  onNewSession: () => void
  onResumeSession: (sessionId: string) => void
}

export function SessionPicker({
  sessions,
  isProcessing,
  onNewSession,
  onResumeSession,
}: SessionPickerProps): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Resume a session</h3>
        <Button variant="secondary" size="xs" onClick={onNewSession} disabled={isProcessing}>
          New Session
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <ItemGroup>
          {sessions.map((session) => (
            <Item
              key={session.sessionId}
              asChild
              size="sm"
              className="cursor-pointer disabled:pointer-events-none disabled:opacity-50"
            >
              <button
                type="button"
                onClick={() => onResumeSession(session.sessionId)}
                disabled={isProcessing}
              >
                <ItemContent>
                  <ItemTitle>{session.title ?? session.sessionId}</ItemTitle>
                  {session.updatedAt ? (
                    <ItemDescription>{formatRelativeTime(session.updatedAt)}</ItemDescription>
                  ) : null}
                </ItemContent>
              </button>
            </Item>
          ))}
        </ItemGroup>
      </ScrollArea>
    </div>
  )
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins.toString()}m ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours.toString()}h ago`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays.toString()}d ago`
}
