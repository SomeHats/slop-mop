import {
  type Agent,
  type AgentCapabilities,
  type Client,
  ClientSideConnection,
  type ContentBlock,
  PROTOCOL_VERSION,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type ToolCallContent,
} from "@agentclientprotocol/sdk"
import { useCallback, useRef, useState } from "react"
import { createAgentStream } from "../lib/agent-stream"
import { killAgent, spawnAgent } from "../lib/tauri"
import type { PreviousSession, TimelineEntry } from "../lib/types"

type AgentSessionState = {
  timeline: TimelineEntry[]
  isProcessing: boolean
  isConnected: boolean
  hasActiveSession: boolean
  previousSessions: PreviousSession[]
  error: string | null
}

type AgentSession = AgentSessionState & {
  connect: (projectPath: string) => Promise<void>
  newSession: () => Promise<void>
  resumeSession: (sessionId: string) => Promise<void>
  stopSession: () => Promise<void>
  sendPrompt: (text: string) => Promise<void>
}

let nextMessageId = 0
function generateMessageId(): string {
  nextMessageId += 1
  return `msg-${nextMessageId.toString()}`
}

function extractText(content: ContentBlock): string {
  if (content.type === "text") {
    return content.text
  }
  return ""
}

const INITIAL_STATE: AgentSessionState = {
  timeline: [],
  isProcessing: false,
  isConnected: false,
  hasActiveSession: false,
  previousSessions: [],
  error: null,
}

export function useAgentSession(): AgentSession {
  const [state, setState] = useState<AgentSessionState>(INITIAL_STATE)

  const connectionRef = useRef<ClientSideConnection | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const agentIdRef = useRef<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const projectPathRef = useRef<string | null>(null)
  const capabilitiesRef = useRef<AgentCapabilities | null>(null)

  const handleSessionUpdate = useCallback((params: SessionNotification): void => {
    const update = params.update

    switch (update.sessionUpdate) {
      case "agent_message_chunk": {
        const text = extractText(update.content)
        if (!text) break

        setState((prev) => {
          const lastEntry = prev.timeline[prev.timeline.length - 1]
          if (lastEntry?.kind === "agent_message") {
            return {
              ...prev,
              timeline: [
                ...prev.timeline.slice(0, -1),
                { ...lastEntry, content: lastEntry.content + text },
              ],
            }
          }
          return {
            ...prev,
            timeline: [
              ...prev.timeline,
              { kind: "agent_message" as const, id: generateMessageId(), content: text },
            ],
          }
        })
        break
      }
      case "agent_thought_chunk": {
        const text = extractText(update.content)
        if (!text) break

        setState((prev) => {
          const lastEntry = prev.timeline[prev.timeline.length - 1]
          if (lastEntry?.kind === "agent_thought") {
            return {
              ...prev,
              timeline: [
                ...prev.timeline.slice(0, -1),
                { ...lastEntry, content: lastEntry.content + text },
              ],
            }
          }
          return {
            ...prev,
            timeline: [
              ...prev.timeline,
              { kind: "agent_thought" as const, id: generateMessageId(), content: text },
            ],
          }
        })
        break
      }
      case "tool_call": {
        const toolEntry: TimelineEntry = {
          kind: "tool_call",
          id: update.toolCallId,
          title: update.title,
          status: update.status ?? "in_progress",
          content: (update.content ?? []) as ToolCallContent[],
          ...(update.kind != null ? { toolKind: update.kind } : {}),
          ...(update.rawInput !== undefined ? { rawInput: update.rawInput } : {}),
          ...(update.rawOutput !== undefined ? { rawOutput: update.rawOutput } : {}),
        }
        setState((prev) => ({
          ...prev,
          timeline: [...prev.timeline, toolEntry],
        }))
        break
      }
      case "tool_call_update": {
        setState((prev) => ({
          ...prev,
          timeline: prev.timeline.map((entry) => {
            if (entry.kind !== "tool_call" || entry.id !== update.toolCallId) {
              return entry
            }
            const updated: TimelineEntry = {
              ...entry,
              title: update.title ?? entry.title,
              status: update.status ?? entry.status,
              ...(update.content !== undefined
                ? { content: (update.content ?? []) as ToolCallContent[] }
                : {}),
              ...(update.kind != null
                ? { toolKind: update.kind }
                : entry.toolKind != null
                  ? { toolKind: entry.toolKind }
                  : {}),
              ...(update.rawInput !== undefined
                ? { rawInput: update.rawInput }
                : entry.rawInput !== undefined
                  ? { rawInput: entry.rawInput }
                  : {}),
              ...(update.rawOutput !== undefined
                ? { rawOutput: update.rawOutput }
                : entry.rawOutput !== undefined
                  ? { rawOutput: entry.rawOutput }
                  : {}),
            }
            return updated
          }),
        }))
        break
      }
      default:
        break
    }
  }, [])

  const createNewSession = useCallback(async (): Promise<void> => {
    const connection = connectionRef.current
    const cwd = projectPathRef.current
    if (!connection || !cwd) return

    const { sessionId } = await connection.newSession({
      cwd,
      mcpServers: [],
    })
    sessionIdRef.current = sessionId

    setState((prev) => ({
      ...prev,
      isProcessing: false,
      hasActiveSession: true,
      previousSessions: [],
    }))
  }, [])

  const connect = useCallback(
    async (projectPath: string): Promise<void> => {
      setState({ ...INITIAL_STATE, isProcessing: true })
      projectPathRef.current = projectPath

      try {
        const agentId = await spawnAgent(projectPath)
        agentIdRef.current = agentId

        const { stream, cleanup } = createAgentStream(agentId)
        cleanupRef.current = cleanup

        const connection = new ClientSideConnection(
          (_agent: Agent): Client => ({
            async sessionUpdate(params: SessionNotification): Promise<void> {
              handleSessionUpdate(params)
            },
            async requestPermission(
              params: RequestPermissionRequest,
            ): Promise<RequestPermissionResponse> {
              const allowOption = params.options.find((o) => o.kind === "allow_once")
              const firstOption = params.options[0]
              const option = allowOption ?? firstOption
              if (!option) {
                return { outcome: { outcome: "cancelled" } }
              }
              return {
                outcome: { outcome: "selected", optionId: option.optionId },
              }
            },
          }),
          stream,
        )
        connectionRef.current = connection

        const initResult = await connection.initialize({
          protocolVersion: PROTOCOL_VERSION,
          clientInfo: { name: "claude-creche", version: "0.0.1" },
        })

        const capabilities = initResult.agentCapabilities ?? null
        capabilitiesRef.current = capabilities

        // Try to list previous sessions if the agent supports it
        const canList = capabilities?.sessionCapabilities?.list != null
        let sessions: PreviousSession[] = []

        if (canList) {
          try {
            const result = await connection.listSessions({ cwd: projectPath })
            sessions = result.sessions.map((s) => ({
              sessionId: s.sessionId,
              title: s.title ?? null,
              updatedAt: s.updatedAt ?? null,
            }))
          } catch {
            // Agent may advertise list but fail — proceed without previous sessions
          }
        }

        setState((prev) => ({
          ...prev,
          isConnected: true,
          previousSessions: sessions,
        }))

        // If no previous sessions, auto-create a new one
        if (sessions.length === 0) {
          await createNewSession()
        } else {
          setState((prev) => ({ ...prev, isProcessing: false }))
        }
      } catch (e) {
        setState((prev) => ({
          ...prev,
          isProcessing: false,
          isConnected: false,
          error: String(e),
        }))
      }
    },
    [handleSessionUpdate, createNewSession],
  )

  const newSession = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, isProcessing: true, error: null }))
    try {
      await createNewSession()
    } catch (e) {
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        error: String(e),
      }))
    }
  }, [createNewSession])

  const resumeSession = useCallback(async (sessionId: string): Promise<void> => {
    const connection = connectionRef.current
    const cwd = projectPathRef.current
    if (!connection || !cwd) return

    setState((prev) => ({
      ...prev,
      timeline: [],
      isProcessing: true,
      error: null,
    }))

    try {
      await connection.loadSession({
        sessionId,
        cwd,
        mcpServers: [],
      })
      sessionIdRef.current = sessionId

      setState((prev) => ({
        ...prev,
        isProcessing: false,
        hasActiveSession: true,
        previousSessions: [],
      }))
    } catch (e) {
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        error: String(e),
      }))
    }
  }, [])

  const sendPrompt = useCallback(async (text: string): Promise<void> => {
    const connection = connectionRef.current
    const sessionId = sessionIdRef.current
    if (!connection || !sessionId) return

    const userEntry: TimelineEntry = {
      kind: "user_message",
      id: generateMessageId(),
      content: text,
    }
    setState((prev) => ({
      ...prev,
      timeline: [...prev.timeline, userEntry],
      isProcessing: true,
      error: null,
    }))

    try {
      await connection.prompt({
        sessionId,
        prompt: [{ type: "text", text }],
      })
    } catch (e) {
      setState((prev) => ({
        ...prev,
        error: String(e),
      }))
    } finally {
      setState((prev) => ({ ...prev, isProcessing: false }))
    }
  }, [])

  const stopSession = useCallback(async (): Promise<void> => {
    const agentId = agentIdRef.current
    cleanupRef.current?.()
    cleanupRef.current = null
    connectionRef.current = null
    sessionIdRef.current = null
    agentIdRef.current = null
    projectPathRef.current = null
    capabilitiesRef.current = null

    if (agentId) {
      try {
        await killAgent(agentId)
      } catch {
        // process may have already exited
      }
    }

    setState(INITIAL_STATE)
  }, [])

  return {
    ...state,
    connect,
    newSession,
    resumeSession,
    stopSession,
    sendPrompt,
  }
}
