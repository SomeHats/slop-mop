import { listen } from "@tauri-apps/api/event"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  killClaude,
  listPromptSnapshots,
  resizeClaude,
  spawnClaude,
  writeClaudeStdin,
} from "@/lib/tauri"
import type { PromptSnapshot } from "@/lib/types"

export type SessionStartSource = "startup" | "resume" | "clear" | "compact" | (string & {})

export type ClaudeSession = {
  snapshots: PromptSnapshot[]
  agentId: string | null
  /** Claude session id, captured when the SessionStart hook first fires. */
  sessionId: string | null
  /** Source reported by the most recent SessionStart hook. */
  sessionSource: SessionStartSource | null
  /** True while we're showing the `--resume` picker (no session has started yet). */
  resumeMode: boolean
  isConnecting: boolean
  error: string | null
  /** Subscribe to PTY output bytes (base64-decoded). Returns an unsubscribe fn. */
  onOutput: (listener: (bytes: Uint8Array) => void) => () => void
  /** Send raw bytes (any ANSI escape / UTF-8 input) to the PTY. */
  writeInput: (bytes: Uint8Array) => void
  resize: (cols: number, rows: number) => void
  /** Kill the current process and respawn. `resume:false` skips the picker. */
  restart: (opts: { resume: boolean }) => void
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

export function useClaudeSession(projectPath: string, projectId: string): ClaudeSession {
  const [snapshots, setSnapshots] = useState<PromptSnapshot[]>([])
  const [agentId, setAgentId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionSource, setSessionSource] = useState<SessionStartSource | null>(null)
  const [resumeMode, setResumeMode] = useState(true)
  const [spawnSeq, setSpawnSeq] = useState(0)
  const [isConnecting, setIsConnecting] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const agentIdRef = useRef<string | null>(null)
  const outputListenersRef = useRef<Set<(b: Uint8Array) => void>>(new Set())

  useEffect(() => {
    let cancelled = false
    const unlisteners: Array<() => void> = []

    void (async () => {
      try {
        // Load existing snapshots once (only on first spawn — restarts don't need to refetch).
        if (spawnSeq === 0) {
          try {
            const existing = await listPromptSnapshots(projectId)
            if (!cancelled) setSnapshots(existing)
          } catch {
            // non-fatal
          }
        }

        const result = await spawnClaude(projectPath, projectId, resumeMode)
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

        const snapshotUnlisten = await listen<{ snapshot: PromptSnapshot }>(
          "snapshot-added",
          (evt) => {
            console.log("[creche] snapshot-added", evt.payload.snapshot)
            setSnapshots((prev) => [...prev, evt.payload.snapshot])
          },
        )
        unlisteners.push(snapshotUnlisten)

        const sessionUnlisten = await listen<{
          agent_id: string
          session_id: string
          source: SessionStartSource
        }>("session-started", (evt) => {
          if (evt.payload.agent_id !== agentIdRef.current) return
          console.log("[creche] session-started", evt.payload)
          setSessionId(evt.payload.session_id)
          setSessionSource(evt.payload.source)
        })
        unlisteners.push(sessionUnlisten)

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
  }, [projectPath, projectId, spawnSeq, resumeMode])

  const onOutput = useCallback((listener: (bytes: Uint8Array) => void): (() => void) => {
    outputListenersRef.current.add(listener)
    return () => {
      outputListenersRef.current.delete(listener)
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
    setIsConnecting(true)
    setSpawnSeq((s) => s + 1)
  }, [])

  return {
    snapshots,
    agentId,
    sessionId,
    sessionSource,
    resumeMode,
    isConnecting,
    error,
    onOutput,
    writeInput,
    resize,
    restart,
  }
}
