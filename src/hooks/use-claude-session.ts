import { listen } from "@tauri-apps/api/event"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  addSessionAlias,
  killClaude,
  listSessionCommits,
  resizeClaude,
  spawnClaude,
  writeClaudeStdin,
} from "@/lib/tauri"
import type { SessionCommit } from "@/lib/types"

export type SessionStartSource = "startup" | "resume" | "clear" | "compact" | (string & {})

/** Surfaced when Claude reports a new session id while one is already
 *  active — typically `/clear` or `/compact`. The user picks whether to
 *  treat it as a fresh slop-mop session or as a continuation of the
 *  existing one. */
export type PendingNewSession = {
  newSessionId: string
  source: SessionStartSource
}

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
  /** Branch prefix Rust would apply to *new* commits given current settings.
   *  Used by the sidebar to strip matching prefixes off displayed subjects.
   *  Captured once at session-start; settings/branch changes mid-session do
   *  not refresh it. */
  currentPrefix: string | null
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
  /** Re-run `listSessionCommits` to pick up a fresh `current_prefix` after
   *  settings change. No-op when no session is active. */
  refetchCommits: () => void
  /** Set when Claude issued a new session id mid-flow (e.g. `/clear`). The
   *  app should surface a dialog and call one of `acceptNewSession` /
   *  `aliasNewSession`. Null when no decision is pending. */
  pendingNewSession: PendingNewSession | null
  /** Treat the pending new claude id as a fresh slop-mop session: clear
   *  commits, switch primary, re-seed history. */
  acceptNewSession: () => void
  /** Keep the existing slop-mop session as the primary and record the
   *  pending claude id as an alias. Refetches commits afterwards. */
  aliasNewSession: () => void
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

// woke2 impl UCS-SP1, UCS-SP2, UCS-SP3, UCS-SP4, UCS-SP5
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
  const [currentPrefix, setCurrentPrefix] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingNewSession, setPendingNewSession] = useState<PendingNewSession | null>(null)

  const agentIdRef = useRef<string | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const outputListenersRef = useRef<Set<(b: Uint8Array) => void>>(new Set())
  const commitListenersRef = useRef<Set<(c: SessionCommit) => void>>(new Set())

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

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

        // woke2 impl UCS-EV1
        const outputUnlisten = await listen<{ agent_id: string; data: string }>(
          "claude-output",
          (evt) => {
            if (evt.payload.agent_id !== agentIdRef.current) return
            const bytes = decodeBase64(evt.payload.data)
            for (const fn of outputListenersRef.current) fn(bytes)
          },
        )
        unlisteners.push(outputUnlisten)

        // woke2 impl UCS-EV2
        const sessionUnlisten = await listen<{
          agent_id: string
          session_id: string
          source: SessionStartSource
        }>("session-started", (evt) => {
          if (evt.payload.agent_id !== agentIdRef.current) return
          console.log("[slop-mop] session-started", evt.payload)
          // Mid-flow new session id (e.g. /clear, /compact, /resume from
          // inside Claude): defer the decision to the user. Don't touch
          // sessionId / commits yet — the dialog handler will do that.
          // woke2 impl UCS-AL1
          if (
            sessionIdRef.current !== null &&
            evt.payload.session_id !== sessionIdRef.current
          ) {
            setPendingNewSession({
              newSessionId: evt.payload.session_id,
              source: evt.payload.source,
            })
            return
          }
          setSessionId(evt.payload.session_id)
          setSessionSource(evt.payload.source)
          // Seed history from git log for this session, and capture the
          // current branch prefix so the sidebar can strip it from displayed
          // subjects without re-deriving it client-side.
          void listSessionCommits(_projectId, projectPath, evt.payload.session_id).then(
            (loaded) => {
              if (!cancelled && agentIdRef.current === evt.payload.agent_id) {
                setCommits(loaded.commits)
                setCurrentPrefix(loaded.current_prefix)
              }
            },
            (e) => console.error("[slop-mop] listSessionCommits failed", e),
          )
        })
        unlisteners.push(sessionUnlisten)

        // woke2 impl UCS-EV3
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

        // woke2 impl UCS-EV4
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

        // woke2 impl UCS-EV5, UCS-CL2
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

  // woke2 impl UCS-IO1
  const onOutput = useCallback((listener: (bytes: Uint8Array) => void): (() => void) => {
    outputListenersRef.current.add(listener)
    return () => {
      outputListenersRef.current.delete(listener)
    }
  }, [])

  // woke2 impl UCS-CL1
  const onCommitLanded = useCallback((listener: (commit: SessionCommit) => void): (() => void) => {
    commitListenersRef.current.add(listener)
    return () => {
      commitListenersRef.current.delete(listener)
    }
  }, [])

  // woke2 impl UCS-RF1, UCS-RF2
  const refetchCommits = useCallback((): void => {
    const sid = sessionIdRef.current
    const aid = agentIdRef.current
    if (!sid || !aid) return
    void listSessionCommits(_projectId, projectPath, sid).then(
      (loaded) => {
        if (agentIdRef.current !== aid) return
        setCommits(loaded.commits)
        setCurrentPrefix(loaded.current_prefix)
      },
      (e) => console.error("[slop-mop] listSessionCommits refetch failed", e),
    )
  }, [_projectId, projectPath])

  // woke2 impl UCS-IO2
  const writeInput = useCallback((bytes: Uint8Array): void => {
    const id = agentIdRef.current
    if (!id) return
    void writeClaudeStdin(id, encodeBase64(bytes))
  }, [])

  // woke2 impl UCS-IO3
  const resize = useCallback((cols: number, rows: number): void => {
    const id = agentIdRef.current
    if (!id) return
    void resizeClaude(id, cols, rows)
  }, [])

  // woke2 impl UCS-AL2
  const acceptNewSession = useCallback((): void => {
    setPendingNewSession((pending) => {
      if (!pending) return null
      const aid = agentIdRef.current
      setSessionId(pending.newSessionId)
      setSessionSource(pending.source)
      setCommits([])
      setCurrentPrefix(null)
      void listSessionCommits(_projectId, projectPath, pending.newSessionId).then(
        (loaded) => {
          if (agentIdRef.current !== aid) return
          setCommits(loaded.commits)
          setCurrentPrefix(loaded.current_prefix)
        },
        (e) => console.error("[slop-mop] listSessionCommits (accept new) failed", e),
      )
      return null
    })
  }, [_projectId, projectPath])

  // woke2 impl UCS-AL3
  const aliasNewSession = useCallback((): void => {
    setPendingNewSession((pending) => {
      if (!pending) return null
      const primary = sessionIdRef.current
      const aid = agentIdRef.current
      if (!primary) return null
      void addSessionAlias(pending.newSessionId, primary)
        .then(() => listSessionCommits(_projectId, projectPath, primary))
        .then(
          (loaded) => {
            if (agentIdRef.current !== aid) return
            setCommits(loaded.commits)
            setCurrentPrefix(loaded.current_prefix)
          },
          (e) => console.error("[slop-mop] aliasNewSession failed", e),
        )
      return null
    })
  }, [_projectId, projectPath])

  // woke2 impl UCS-SP6
  const restart = useCallback((opts: { resume: boolean }): void => {
    setResumeMode(opts.resume)
    setSessionId(null)
    setSessionSource(null)
    setAgentId(null)
    setCommits([])
    setCommittingCount(0)
    setIsBusy(false)
    setCurrentPrefix(null)
    setIsConnecting(true)
    setPendingNewSession(null)
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
    currentPrefix,
    error,
    onOutput,
    writeInput,
    resize,
    restart,
    onCommitLanded,
    refetchCommits,
    pendingNewSession,
    acceptNewSession,
    aliasNewSession,
  }
}
