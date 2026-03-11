import { type FormEvent, useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useAgentSession } from "../../hooks/use-agent-session"
import type { PreviousSession } from "../../lib/types"

type AgentPanelProps = {
  projectPath: string
}

export function AgentPanel({ projectPath }: AgentPanelProps): React.JSX.Element {
  const {
    messages,
    toolCalls,
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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const showHeader = isConnected || isProcessing

  const lastMessageId = messages[messages.length - 1]?.id
  const lastToolCallId = toolCalls[toolCalls.length - 1]?.id
  useEffect(() => {
    if (lastMessageId || lastToolCallId) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [lastMessageId, lastToolCallId])

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isProcessing) return
    setInput("")
    void sendPrompt(text)
  }

  const handleConnect = (): void => {
    void connect(projectPath)
  }

  const handleStop = (): void => {
    void stopSession()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-2">
        <h2 className="text-sm font-medium text-foreground">Agent</h2>
        {showHeader ? (
          <Button variant="ghost" size="xs" onClick={handleStop}>
            Stop
          </Button>
        ) : null}
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

      {!showHeader ? (
        <div className="flex flex-1 items-center justify-center">
          <Button onClick={handleConnect}>Start Session</Button>
        </div>
      ) : isConnected && !hasActiveSession ? (
        <SessionPicker
          sessions={previousSessions}
          isProcessing={isProcessing}
          onNewSession={() => void newSession()}
          onResumeSession={(id) => void resumeSession(id)}
        />
      ) : (
        <>
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-3 p-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "text-sm",
                    msg.role === "user"
                      ? "bg-muted px-3 py-2 text-foreground"
                      : "text-foreground/80 whitespace-pre-wrap",
                  )}
                >
                  {msg.role === "user" ? (
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">
                      You
                    </span>
                  ) : null}
                  {msg.content}
                </div>
              ))}
              {toolCalls.map((tc) => (
                <div
                  key={tc.id}
                  className="flex items-center gap-2 border border-border px-3 py-1.5 text-xs text-muted-foreground"
                >
                  <span className="truncate">{tc.title}</span>
                  <StatusBadge status={tc.status} />
                </div>
              ))}
              {isProcessing && messages.length === 0 && toolCalls.length === 0 ? (
                <p className="text-sm text-muted-foreground">Connecting...</p>
              ) : null}
              <div ref={messagesEndRef} />
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

const statusVariants: Record<string, "secondary" | "default" | "destructive" | "outline"> = {
  pending: "secondary",
  in_progress: "default",
  completed: "outline",
  failed: "destructive",
}

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const variant = statusVariants[status] ?? "secondary"
  return <Badge variant={variant}>{status}</Badge>
}
