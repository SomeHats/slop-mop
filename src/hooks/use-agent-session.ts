import {
  type Agent,
  type AgentCapabilities,
  type Client,
  ClientSideConnection,
  type ContentBlock,
  PROTOCOL_VERSION,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionMode,
  type SessionNotification,
  type ToolCallContent,
} from "@agentclientprotocol/sdk"
import { useCallback, useRef, useState } from "react"
import { usePermissionHandler } from "../features/permissions/use-permission-handler"
import { createAgentStream } from "../lib/agent-stream"
import {
  isWorktreeDirty,
  killAgent,
  listPromptSnapshots,
  recordPromptSnapshot,
  spawnAgent,
} from "../lib/tauri"
import type {
  AutoCommitPhase,
  PendingPermission,
  PreviousSession,
  PromptSnapshot,
  TimelineEntry,
} from "../lib/types"

type AgentSessionState = {
  timeline: TimelineEntry[]
  snapshots: PromptSnapshot[]
  isProcessing: boolean
  isConnected: boolean
  hasActiveSession: boolean
  previousSessions: PreviousSession[]
  error: string | null
  autoCommitPhase: AutoCommitPhase | null
  availableModes: SessionMode[]
  currentModeId: string | null
  pendingPlanContent: string | null
}

export type AgentSession = AgentSessionState & {
  connect: (projectPath: string, projectId: string) => Promise<void>
  newSession: () => Promise<void>
  resumeSession: (sessionId: string) => Promise<void>
  stopSession: () => Promise<void>
  sendPrompt: (text: string, modeId?: string) => Promise<void>
  approvePlan: () => void
  rejectPlan: () => void
  cancelPlan: () => void
  pendingPermission: PendingPermission | null
  allowOncePermission: () => void
  denyOncePermission: () => void
  createPermissionRules: (rules: import("../lib/types").NewRule[]) => void
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
  snapshots: [],
  isProcessing: false,
  isConnected: false,
  hasActiveSession: false,
  previousSessions: [],
  error: null,
  autoCommitPhase: null,
  availableModes: [],
  currentModeId: null,
  pendingPlanContent: null,
}

export function useAgentSession(): AgentSession {
  const [state, setState] = useState<AgentSessionState>(INITIAL_STATE)
  const permissionHandler = usePermissionHandler()

  const connectionRef = useRef<ClientSideConnection | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const agentIdRef = useRef<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const projectPathRef = useRef<string | null>(null)
  const projectIdRef = useRef<string | null>(null)
  const capabilitiesRef = useRef<AgentCapabilities | null>(null)
  const planPermissionResolverRef = useRef<((response: RequestPermissionResponse) => void) | null>(
    null,
  )

  const handleSessionUpdate = useCallback((params: SessionNotification): void => {
    const update = params.update

    switch (update.sessionUpdate) {
      case "user_message_chunk": {
        const text = extractText(update.content)
        if (!text) break

        // Skip internal Claude Code messages (slash commands, command output)
        if (/^<[a-z-]+>/.test(text.trimStart())) break

        const messageId =
          "messageId" in update && typeof update.messageId === "string" ? update.messageId : null

        setState((prev) => {
          const lastEntry = prev.timeline[prev.timeline.length - 1]
          if (
            lastEntry?.kind === "user_message" &&
            messageId !== null &&
            lastEntry.id === messageId
          ) {
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
              {
                kind: "user_message" as const,
                id: messageId ?? generateMessageId(),
                content: text,
              },
            ],
          }
        })
        break
      }
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
      case "current_mode_update": {
        setState((prev) => ({
          ...prev,
          currentModeId: update.currentModeId,
        }))
        break
      }
      default:
        console.warn("[agent-session] unrecognised sessionUpdate type:", update)
        break
    }
  }, [])

  const handlePermissionRequest = useCallback(
    (params: RequestPermissionRequest): Promise<RequestPermissionResponse> => {
      // Detect plan approval: agent wants to switch out of plan mode
      if (params.toolCall.kind === "switch_mode") {
        const rawInput = params.toolCall.rawInput as { plan?: unknown } | undefined
        const planText =
          rawInput != null && typeof rawInput.plan === "string" ? rawInput.plan : null

        if (planText) {
          return new Promise<RequestPermissionResponse>((resolve) => {
            planPermissionResolverRef.current = resolve
            setState((prev) => ({ ...prev, pendingPlanContent: planText }))
          })
        }
      }

      // File access permissions: delegate read/edit with locations to permission handler
      const kind = params.toolCall.kind
      if (
        (kind === "read" || kind === "edit") &&
        params.toolCall.locations != null &&
        params.toolCall.locations.length > 0
      ) {
        const projectId = projectIdRef.current
        const workspacePath = projectPathRef.current
        if (projectId && workspacePath) {
          return permissionHandler.handlePermissionRequest(params, projectId, workspacePath)
        }
      }

      // Auto-approve all other permission requests
      console.warn("[agent-session] auto-approving permission request:", params)
      const allowOption = params.options.find((o) => o.kind === "allow_once")
      const firstOption = params.options[0]
      const option = allowOption ?? firstOption
      if (!option) {
        console.warn("[agent-session] no options available for permission request, cancelling")
        return Promise.resolve({ outcome: { outcome: "cancelled" } })
      }
      return Promise.resolve({
        outcome: { outcome: "selected", optionId: option.optionId },
      })
    },
    [permissionHandler.handlePermissionRequest],
  )

  const createNewSession = useCallback(async (): Promise<void> => {
    const connection = connectionRef.current
    const cwd = projectPathRef.current
    if (!connection || !cwd) return

    const response = await connection.newSession({
      cwd,
      mcpServers: [],
    })
    sessionIdRef.current = response.sessionId

    setState((prev) => ({
      ...prev,
      isProcessing: false,
      hasActiveSession: true,
      previousSessions: [],
      availableModes: response.modes?.availableModes ?? [],
      currentModeId: response.modes?.currentModeId ?? null,
      pendingPlanContent: null,
    }))
  }, [])

  const connect = useCallback(
    async (projectPath: string, projectId: string): Promise<void> => {
      setState({ ...INITIAL_STATE, isProcessing: true })
      projectPathRef.current = projectPath
      projectIdRef.current = projectId

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
            requestPermission: handlePermissionRequest,
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
    [handleSessionUpdate, handlePermissionRequest, createNewSession],
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
      snapshots: [],
      isProcessing: true,
      error: null,
    }))

    try {
      const response = await connection.loadSession({
        sessionId,
        cwd,
        mcpServers: [],
      })
      sessionIdRef.current = sessionId

      let snapshots: PromptSnapshot[] = []
      try {
        snapshots = await listPromptSnapshots(sessionId)
      } catch {
        // Non-critical — proceed without snapshots
      }

      setState((prev) => ({
        ...prev,
        // Keep timeline entries streamed by loadSession via handleSessionUpdate
        snapshots,
        isProcessing: false,
        hasActiveSession: true,
        previousSessions: [],
        availableModes: response.modes?.availableModes ?? [],
        currentModeId: response.modes?.currentModeId ?? null,
        pendingPlanContent: null,
      }))
    } catch (e) {
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        error: String(e),
      }))
    }
  }, [])

  const sendPrompt = useCallback(async (text: string, modeId?: string): Promise<void> => {
    const connection = connectionRef.current
    const sessionId = sessionIdRef.current
    const projectId = projectIdRef.current
    const projectPath = projectPathRef.current
    if (!connection || !sessionId) return

    setState((prev) => ({ ...prev, isProcessing: true, error: null, pendingPlanContent: null }))

    try {
      // Ensure worktree is clean so the snapshot commit hash is accurate
      if (projectPath) {
        const dirty = await isWorktreeDirty(projectPath)
        if (dirty) {
          const anchorId = `auto-commit-${Date.now().toString()}`

          // Show the auto-commit prompt in the timeline as a system message
          const commitEntry: TimelineEntry = {
            kind: "system_message",
            id: anchorId,
            content: "Uncommitted changes detected — asking agent to commit before proceeding.",
          }
          setState((prev) => ({
            ...prev,
            timeline: [...prev.timeline, commitEntry],
            autoCommitPhase: { status: "running", timelineAnchorId: anchorId },
          }))

          // Ask the agent to commit, then verify
          await connection.prompt({
            sessionId,
            prompt: [{ type: "text", text: "commit" }],
          })

          const stillDirty = await isWorktreeDirty(projectPath)
          if (stillDirty) {
            setState((prev) => ({
              ...prev,
              isProcessing: false,
              autoCommitPhase: {
                status: "failed",
                timelineAnchorId: anchorId,
                error: "Worktree still has uncommitted changes after auto-commit.",
              },
            }))
            return
          }

          setState((prev) => ({ ...prev, autoCommitPhase: null }))
        } else {
          // Non-dirty branch: clear any previous failed auto-commit phase
          setState((prev) => (prev.autoCommitPhase ? { ...prev, autoCommitPhase: null } : prev))
        }
      }

      const messageId = crypto.randomUUID()

      const userEntry: TimelineEntry = {
        kind: "user_message",
        id: messageId,
        content: text,
      }
      setState((prev) => ({
        ...prev,
        timeline: [...prev.timeline, userEntry],
      }))

      // Record snapshot now that we know the worktree is clean
      if (projectId && projectPath) {
        recordPromptSnapshot(sessionId, projectId, messageId, text, projectPath).then(
          (snapshot) => {
            setState((prev) => ({ ...prev, snapshots: [...prev.snapshots, snapshot] }))
          },
          () => {
            // Snapshot failure is non-critical
          },
        )
      }

      // Switch mode if requested and different from current
      if (modeId != null) {
        await connection.setSessionMode({ sessionId, modeId })
        setState((prev) => ({ ...prev, currentModeId: modeId }))
      }

      await connection.prompt({
        sessionId,
        messageId,
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
    projectIdRef.current = null
    capabilitiesRef.current = null
    planPermissionResolverRef.current = null

    if (agentId) {
      try {
        await killAgent(agentId)
      } catch {
        // process may have already exited
      }
    }

    setState(INITIAL_STATE)
  }, [])

  const approvePlan = useCallback((): void => {
    const resolve = planPermissionResolverRef.current
    if (!resolve) return
    planPermissionResolverRef.current = null
    resolve({ outcome: { outcome: "selected", optionId: "default" } })
    setState((prev) => ({ ...prev, pendingPlanContent: null }))
  }, [])

  const rejectPlan = useCallback((): void => {
    const resolve = planPermissionResolverRef.current
    if (!resolve) return
    planPermissionResolverRef.current = null
    resolve({ outcome: { outcome: "selected", optionId: "plan" } })
    setState((prev) => ({ ...prev, pendingPlanContent: null }))
  }, [])

  const cancelPlan = useCallback((): void => {
    const resolve = planPermissionResolverRef.current
    if (!resolve) return
    planPermissionResolverRef.current = null
    resolve({ outcome: { outcome: "cancelled" } })
    setState((prev) => ({ ...prev, pendingPlanContent: null }))
  }, [])

  return {
    ...state,
    connect,
    newSession,
    resumeSession,
    stopSession,
    sendPrompt,
    approvePlan,
    rejectPlan,
    cancelPlan,
    pendingPermission: permissionHandler.pendingPermission,
    allowOncePermission: permissionHandler.allowOnce,
    denyOncePermission: permissionHandler.denyOnce,
    createPermissionRules: permissionHandler.createRulesAndContinue,
  }
}
