import { listen } from "@tauri-apps/api/event"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  killClaude,
  listSessionCommits,
  resizeClaude,
  spawnClaude,
  writeClaudeStdin,
} from "@/lib/tauri"
import type { SessionCommit } from "@/lib/types"

export type SessionStartSource = "startup" | "resume" | "clear" | "compact" | (string & {})

export type ClaudeSession = {
  commits: SessionCommit[]
  agentId: string | null
  /** Claude session id, captured when the SessionStart hook first fires. */
  sessionId: string | null
  /** Source reported by the most recent SessionStart hook. */
  sessionSource: SessionStartSource | null
  /** True while we're showing the `--resume` picker (no session has started yet). */
  resumeMode: boolean
  isConnecting: boolean
  /** True while one or more git commits are in flight (checkpoint or post-prompt). */
  isCommitting: boolean
  /** True between UserPromptSubmit and Stop — i.e. while the agent is mid-turn. */
  isBusy: boolean
  error: string | null
  /** Subscribe to PTY output bytes (base64-decoded). Returns an unsubscribe fn. */
  onOutput: (listener: (bytes: Uint8Array) => void) => () => void
  /** Send raw bytes (any ANSI escape / UTF-8 input) to the PTY. */
  writeInput: (bytes: Uint8Array) => void
  resize: (cols: number, rows: number) => void
  /** Kill the current process and respawn. `resume:false` skips the picker. */
  restart: (opts: { resume: boolean }) => void
  /** Subscribe to commits as they land via the Stop hook (not the initial seed). */
  onCommitLanded: (listener: (commit: SessionCommit) => void) => () => void
}

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0)
  }
  return btoa(binary)
}

export function useClaudeSession(projectPath: string, _projectId: string): ClaudeSession {
  const [commits, setCommits] = useState<SessionCommit[]>([])
  const [agentId, setAgentId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionSource, setSessionSource] = useState<SessionStartSource | null>(null)
  const [resumeMode, setResumeMode] = useState(true)
  const [spawnSeq, setSpawnSeq] = useState(0)
  const [isConnecting, setIsConnecting] = useState(true)
  const [committingCount, setCommittingCount] = useState(0)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const agentIdRef = useRef<string | null>(null)
  const outputListenersRef = useRef<Set<(b: Uint8Array) => void>>(new Set())
  const commitListenersRef = useRef<Set<(c: SessionCommit) => void>>(new Set())

  useEffect(() => {
    let cancelled = false
    const unlisteners: Array<() => void> = []

    void (async () => {
      try {
        console.log("[slop-mop] spawning claude", { spawnSeq, resumeMode })
        const result = await spawnClaude(projectPath, _projectId, resumeMode)
        if (cancelled) {
          void killClaude(result.agent_id)
          return
        }
        agentIdRef.current = result.agent_id
        setAgentId(result.agent_id)

        const outputUnlisten = await listen<{ agent_id: string; data: string }>(
          "claude-output",
          (evt) => {
            if (evt.payload.agent_id !== agentIdRef.current) return
            const bytes = decodeBase64(evt.payload.data)
            for (const fn of outputListenersRef.current) fn(bytes)
          },
        )
        unlisteners.push(outputUnlisten)

        const sessionUnlisten = await listen<{
          agent_id: string
          session_id: string
          source: SessionStartSource
        }>("session-started", (evt) => {
          if (evt.payload.agent_id !== agentIdRef.current) return
          console.log("[slop-mop] session-started", evt.payload)
          setSessionId(evt.payload.session_id)
          setSessionSource(evt.payload.source)
          // Seed history from git log for this session.
          void listSessionCommits(projectPath, evt.payload.session_id).then(
            (loaded) => {
              if (!cancelled && agentIdRef.current === evt.payload.agent_id) {
                setCommits(loaded)
              }
            },
            (e) => console.error("[slop-mop] listSessionCommits failed", e),
          )
        })
        unlisteners.push(sessionUnlisten)

        const startedUnlisten = await listen<{ agent_id: string }>("commit-started", (evt) => {
          if (evt.payload.agent_id !== agentIdRef.current) return
          setCommittingCount((n) => n + 1)
        })
        unlisteners.push(startedUnlisten)

        const finishedUnlisten = await listen<{ agent_id: string }>("commit-finished", (evt) => {
          if (evt.payload.agent_id !== agentIdRef.current) return
          setCommittingCount((n) => Math.max(0, n - 1))
        })
        unlisteners.push(finishedUnlisten)

        const busyUnlisten = await listen<{ agent_id: string }>("agent-busy", (evt) => {
          if (evt.payload.agent_id !== agentIdRef.current) return
          setIsBusy(true)
        })
        unlisteners.push(busyUnlisten)

        const idleUnlisten = await listen<{ agent_id: string }>("agent-idle", (evt) => {
          if (evt.payload.agent_id !== agentIdRef.current) return
          setIsBusy(false)
        })
        unlisteners.push(idleUnlisten)

        const committedUnlisten = await listen<{
          agent_id: string
          session_id: string
          commit_hash: string
          prompt: string
          message: string
          timestamp_unix: number
        }>("prompt-committed", (evt) => {
          if (evt.payload.agent_id !== agentIdRef.current) return
          console.log("[slop-mop] prompt-committed", evt.payload)
          const commit: SessionCommit = {
            commit_hash: evt.payload.commit_hash,
            session_id: evt.payload.session_id,
            prompt: evt.payload.prompt,
            message: evt.payload.message,
            timestamp_unix: evt.payload.timestamp_unix,
          }
          // git2 walks newest-first from HEAD, so prepend.
          setCommits((prev) => [commit, ...prev])
          for (const fn of commitListenersRef.current) fn(commit)
        })
        unlisteners.push(committedUnlisten)

        setIsConnecting(false)
      } catch (e) {
        if (!cancelled) {
          setError(String(e))
          setIsConnecting(false)
        }
      }
    })()

    return () => {
      cancelled = true
      for (const fn of unlisteners) fn()
      const id = agentIdRef.current
      if (id) {
        void killClaude(id)
        agentIdRef.current = null
      }
    }
  }, [projectPath, _projectId, spawnSeq, resumeMode])

  const onOutput = useCallback((listener: (bytes: Uint8Array) => void): (() => void) => {
    outputListenersRef.current.add(listener)
    return () => {
      outputListenersRef.current.delete(listener)
    }
  }, [])

  const onCommitLanded = useCallback((listener: (commit: SessionCommit) => void): (() => void) => {
    commitListenersRef.current.add(listener)
    return () => {
      commitListenersRef.current.delete(listener)
    }
  }, [])

  const writeInput = useCallback((bytes: Uint8Array): void => {
    const id = agentIdRef.current
    if (!id) return
    void writeClaudeStdin(id, encodeBase64(bytes))
  }, [])

  const resize = useCallback((cols: number, rows: number): void => {
    const id = agentIdRef.current
    if (!id) return
    void resizeClaude(id, cols, rows)
  }, [])

  const restart = useCallback((opts: { resume: boolean }): void => {
    setResumeMode(opts.resume)
    setSessionId(null)
    setSessionSource(null)
    setAgentId(null)
    setCommits([])
    setCommittingCount(0)
    setIsBusy(false)
    setIsConnecting(true)
    setSpawnSeq((s) => s + 1)
  }, [])

  return {
    commits,
    agentId,
    sessionId,
    sessionSource,
    resumeMode,
    isConnecting,
    isCommitting: committingCount > 0,
    isBusy,
    error,
    onOutput,
    writeInput,
    resize,
    restart,
    onCommitLanded,
  }
}
