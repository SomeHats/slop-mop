---
name: Frontend Claude session hook
description: useClaudeSession — single React hook that owns the agent lifecycle and translates backend events into UI state
---

# useClaudeSession

The hook that subscribes to every backend event from [auto-commit hooks](claude.spec.md) and turns them into React state. Owned by `app.tsx`; the [terminal](terminal.spec.md), [chat sidebar](chat-sidebar.spec.md), and [diff viewer](diff-viewer.spec.md) consume it.

## Spawn / lifecycle

- !UCS-SP1 Spawns Claude on mount via `tauri.spawnClaude(projectPath, projectId, resumeMode)`; passes `resumeMode = true` initially so the user lands in the `--resume` picker
- !UCS-SP2 Tracks `agentId`/`sessionId` in refs alongside state so listeners can compare against the latest values without re-attaching
- !UCS-SP3 Drops events whose `agent_id` doesn't match the current agent (filters out late events from a previous spawn)
- !UCS-SP4 On unmount or when `spawnSeq` changes, kills the prior agent and detaches all listeners
- !UCS-SP5 If the spawn promise resolves after the effect was cancelled, the new agent is killed immediately (no leaked process)
- !UCS-SP6 `restart({ resume })` resets all session state and bumps `spawnSeq` to trigger a fresh spawn

## Event listeners

- !UCS-EV1 `claude-output` decodes base64 and fans out to every registered output listener via `onOutput`
- !UCS-EV2 `session-started` stores the session id and source, then seeds commit history via `tauri.listSessionCommits` (also captures `current_prefix`)
- !UCS-EV3 `commit-started` increments `committingCount`; `commit-finished` decrements it (clamped to 0)
- !UCS-EV4 `agent-busy` sets `isBusy=true`; `agent-idle` sets it back to false
- !UCS-EV5 `prompt-committed` prepends the new commit to `commits` and notifies every commit-landed listener

## Output / input wiring

- !UCS-IO1 `onOutput(listener)` adds to a Set; the returned unsubscribe removes it (no Map lookup or array filter)
- !UCS-IO2 `writeInput(bytes)` base64-encodes and forwards to `writeClaudeStdin` (no-ops when no agent)
- !UCS-IO3 `resize(cols, rows)` forwards to `resizeClaude` (no-ops when no agent)

## Commit landed subscription

- !UCS-CL1 `onCommitLanded(listener)` follows the same Set + unsubscribe pattern as output listeners
- !UCS-CL2 Only realtime commits (the `prompt-committed` event) trigger commit-landed listeners; the historical seed from `listSessionCommits` does not

## Refetch

- !UCS-RF1 `refetchCommits` re-runs `listSessionCommits` to pick up a fresh `current_prefix` after settings change; no-op when no session is active
- !UCS-RF2 Drops the response if the agent changed mid-flight

## New-session decision (mid-flow alias-or-new)

When Claude reports a new session id while one is already active (`/clear`, `/compact`, etc.), the hook defers the decision to the user instead of silently switching. See [new-session dialog](new-session-dialog.spec.md) for the UI half.

- !UCS-AL1 If `session-started` fires with `session_id !== sessionIdRef.current` and the current id is non-null, sets `pendingNewSession` to `{ newSessionId, source }` and does *not* touch `sessionId` / `commits`
- !UCS-AL2 `acceptNewSession()` switches the primary to the pending Claude id, clears commits, and re-seeds via `listSessionCommits`
- !UCS-AL3 `aliasNewSession()` records the pending id under the current primary via `tauri.addSessionAlias`, then refetches commits using the (unchanged) primary so commits already authored under the new id surface in the sidebar
