import { type FormEvent, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useAgentSession } from "../../hooks/use-agent-session"
import type { PreviousSession } from "../../lib/types"
import { ActivityGroup } from "./activity-group"
import { groupTimeline } from "./group-timeline"
import { TimelineEntryRow } from "./timeline-entry"

type AgentPanelProps = {
  projectPath: string
}

export function AgentPanel({ projectPath }: AgentPanelProps): React.JSX.Element {
  const {
    timeline,
    isProcessing,
    isConnected,
    hasActiveSession,
    previousSessions,
    error,
    connect,
    newSession,
    resumeSession,
    stopSession,
    sendPrompt,
  } = useAgentSession()

  const [input, setInput] = useState("")
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const viewportRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    void connect(projectPath)
  }, [connect, projectPath])

  // Capture the viewport element and attach scroll listener.
  // hasActiveSession is an intentional trigger — the ScrollArea mounts/unmounts with it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      "[data-slot=scroll-area-viewport]",
    )
    viewportRef.current = viewport ?? null
    if (!viewport) return
    const onScroll = (): void => {
      const { scrollTop, scrollHeight, clientHeight } = viewport
      isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 30
    }
    viewport.addEventListener("scroll", onScroll, { passive: true })
    return () => viewport.removeEventListener("scroll", onScroll)
  }, [hasActiveSession])

  // Auto-scroll to bottom when content changes, if already at bottom.
  // Uses useEffect (runs after paint) so the viewport is guaranteed to be laid out.
  const timelineVersion = timeline.length > 0 ? timeline[timeline.length - 1] : null
  useEffect(() => {
    if (!isAtBottomRef.current || !timelineVersion) return
    const viewport =
      viewportRef.current ??
      scrollAreaRef.current?.querySelector<HTMLElement>("[data-slot=scroll-area-viewport]") ??
      null
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [timelineVersion])

  const segments = useMemo(() => groupTimeline(timeline), [timeline])

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isProcessing) return
    setInput("")
    void sendPrompt(text)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2">
        <h2 className="text-sm font-medium text-foreground">Agent</h2>
        <Button variant="ghost" size="xs" onClick={() => void stopSession()}>
          Stop
        </Button>
      </div>
      <Separator />

      {error ? (
        <>
          <div className="px-4 py-2">
            <p className="text-xs text-destructive">{error}</p>
          </div>
          <Separator />
        </>
      ) : null}

      {isConnected && !hasActiveSession ? (
        <SessionPicker
          sessions={previousSessions}
          isProcessing={isProcessing}
          onNewSession={() => void newSession()}
          onResumeSession={(id) => void resumeSession(id)}
        />
      ) : (
        <>
          <ScrollArea
            ref={scrollAreaRef}
            className="flex-1 overflow-hidden [&>[data-slot=scroll-area-viewport]>div]:!block"
          >
            <div className="flex flex-col gap-3 p-4">
              {segments.map((segment, i) =>
                segment.kind === "passthrough" ? (
                  <TimelineEntryRow key={segment.entry.id} entry={segment.entry} />
                ) : (
                  <ActivityGroup
                    key={segment.id}
                    entries={segment.entries}
                    isLast={i === segments.length - 1}
                  />
                ),
              )}
              {isProcessing && timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">Connecting...</p>
              ) : null}
            </div>
          </ScrollArea>

          <Separator />
          <form onSubmit={handleSubmit} className="flex gap-2 p-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Send a message..."
              disabled={isProcessing}
            />
            <Button type="submit" disabled={isProcessing || !input.trim()}>
              Send
            </Button>
          </form>
        </>
      )}
    </div>
  )
}

type SessionPickerProps = {
  sessions: PreviousSession[]
  isProcessing: boolean
  onNewSession: () => void
  onResumeSession: (sessionId: string) => void
}

function SessionPicker({
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
