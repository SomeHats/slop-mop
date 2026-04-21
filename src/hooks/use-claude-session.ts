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

export type ClaudeSession = {
  snapshots: PromptSnapshot[]
  agentId: string | null
  isConnecting: boolean
  error: string | null
  /** Subscribe to PTY output bytes (base64-decoded). Returns an unsubscribe fn. */
  onOutput: (listener: (bytes: Uint8Array) => void) => () => void
  /** Send raw bytes (any ANSI escape / UTF-8 input) to the PTY. */
  writeInput: (bytes: Uint8Array) => void
  resize: (cols: number, rows: number) => void
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
  const [isConnecting, setIsConnecting] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const agentIdRef = useRef<string | null>(null)
  const outputListenersRef = useRef<Set<(b: Uint8Array) => void>>(new Set())

  // One-shot spawn + event wiring on mount.
  useEffect(() => {
    let cancelled = false
    const unlisteners: Array<() => void> = []

    void (async () => {
      try {
        // Load existing snapshots for the project.
        try {
          const existing = await listPromptSnapshots(projectId)
          if (!cancelled) setSnapshots(existing)
        } catch {
          // non-fatal
        }

        const result = await spawnClaude(projectPath, projectId)
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
  }, [projectPath, projectId])

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

  return { snapshots, agentId, isConnecting, error, onOutput, writeInput, resize }
}
