import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ChatSidebar } from "./features/chat/chat-sidebar"
import { CommentsPanel } from "./features/comments/comments-panel"
import { formatCommentsForSubmit } from "./features/comments/submit-comments"
import { useSessionComments } from "./features/comments/use-session-comments"
import { DiffPanel, type DiffPanelHandle } from "./features/diff/diff-panel"
import type { ResolvedAnchor } from "./features/diff/side-by-side-diff"
import { ProjectPicker } from "./features/projects/project-picker"
import { ProjectSettingsButton } from "./features/projects/project-settings-button"
import { useProjectSettings } from "./features/projects/use-project-settings"
import { TerminalPanel } from "./features/terminal/terminal-panel"
import { useClaudeSession } from "./hooks/use-claude-session"
import { useCommentOnlyFileDiffs } from "./hooks/use-comment-only-file-diffs"
import { useDiffStats } from "./hooks/use-diff-stats"
import { useFullscreen } from "./hooks/use-fullscreen"
import { useRangeDiff } from "./hooks/use-range-diff"
import { anchorForWorkdir, createComment, startWatching } from "./lib/tauri"
import type { Selection } from "./lib/types"

const project = window.__PROJECT

// woke2 impl APP-RT1, APP-RT2
export function App(): React.JSX.Element {
  const fullscreen = useFullscreen()

  if (!project) {
    return <ProjectPicker />
  }

  return (
    <ProjectApp
      projectPath={project.path}
      projectId={project.id}
      name={project.name}
      fullscreen={fullscreen}
    />
  )
}

type ProjectAppProps = {
  projectPath: string
  projectId: string
  name: string
  fullscreen: boolean
}

function ProjectApp({
  projectPath,
  projectId,
  name,
  fullscreen,
}: ProjectAppProps): React.JSX.Element {
  const session = useClaudeSession(projectPath, projectId)
  const [selection, setSelection] = useState<Selection | null>(null)
  const projectSettings = useProjectSettings(projectId)

  // woke2 impl APP-SB1
  useEffect(() => {
    void startWatching(projectPath)
  }, [projectPath])

  // Refetch the commit list (and the `current_prefix` it carries) whenever
  // the user changes the branch-prefix mode. The mode value isn't read in
  // the effect body — Rust re-reads the latest setting from the DB inside
  // refetchCommits — but we list it as a dep so the effect fires on change.
  // woke2 impl APP-SB2
  // biome-ignore lint/correctness/useExhaustiveDependencies: mode used as a trigger
  useEffect(() => {
    if (session.sessionId === null) return
    session.refetchCommits()
  }, [projectSettings.branchPrefixMode, session.sessionId, session.refetchCommits])

  // When the Stop hook lands a new commit, jump straight into its diff so the
  // user sees what just changed instead of staring at a now-stale terminal.
  // woke2 impl APP-SB3
  useEffect(() => {
    return session.onCommitLanded((commit) => {
      setSelection({ older: commit.commit_hash, newer: commit.commit_hash })
    })
  }, [session.onCommitLanded])

  const diffStats = useDiffStats(projectPath, session.commits)
  const { fileDiffs: realFileDiffs, isLoading: isDiffLoading } = useRangeDiff(
    projectPath,
    selection,
  )

  const sessionComments = useSessionComments(projectPath, session.sessionId, selection)

  // Files that have non-orphaned comments but didn't change in the active diff
  // get synthesised "unchanged" entries so the user can still see (and click)
  // those comments.
  // woke2 impl APP-CO1
  const commentOnlyFileDiffs = useCommentOnlyFileDiffs(
    projectPath,
    selection,
    sessionComments.comments,
    realFileDiffs,
  )
  const fileDiffs = useMemo(
    () => [...realFileDiffs, ...commentOnlyFileDiffs],
    [realFileDiffs, commentOnlyFileDiffs],
  )
  const diffPanelRef = useRef<DiffPanelHandle | null>(null)

  // Resolve a clicked workdir range to a real (commit_hash, line_start, line_end)
  // anchor. In commit mode this is just the selection's `newer` hash + the
  // right-side line numbers. In workdir mode we round-trip to the backend to
  // translate workdir lines to HEAD lines, rejecting lines that exist only
  // uncommitted (no immutable anchor).
  // woke2 impl APP-CM1, APP-CM2
  const handleResolveAnchor = useCallback(
    async (filePath: string, start: number, end: number | null): Promise<ResolvedAnchor> => {
      if (selection?.newer) {
        return { ok: true, commit_hash: selection.newer, start, end }
      }
      const result = await anchorForWorkdir(projectPath, filePath, start, end)
      if (result.kind === "anchored") {
        return {
          ok: true,
          commit_hash: result.commit_hash,
          start: result.line_start,
          end: result.line_end,
        }
      }
      return { ok: false }
    },
    [projectPath, selection],
  )

  const handleDeleteComment = useCallback(
    (id: string): void => {
      void sessionComments.remove(id)
    },
    [sessionComments.remove],
  )

  const handleUpdateComment = useCallback(
    (id: string, contents: string): Promise<void> => sessionComments.update(id, contents),
    [sessionComments.update],
  )

  // woke2 impl APP-SS1, APP-SS2, APP-SS3, APP-SS4, APP-SS5, APP-SS6
  const handleSubmitStaged = useCallback((): void => {
    if (session.isBusy) return // belt-and-braces; the button is also disabled
    const { ids, items } = sessionComments.prepareSubmit()
    if (items.length === 0) return
    const text = formatCommentsForSubmit(items)
    // Ctrl-S (0x13) tells Claude Code to stash whatever the user has half-typed
    // in its input box, leaving the input empty for our payload.
    session.writeInput(new Uint8Array([0x13]))
    // Then the formatted comments. We send the body and the submitting Enter
    // as *separate* PTY writes with a delay between them: when text and \r
    // land in one read() Claude treats it as a paste and the \r becomes part
    // of the input buffer instead of a submit keypress.
    const encoder = new TextEncoder()
    session.writeInput(encoder.encode(text))
    setTimeout(() => session.writeInput(encoder.encode("\r")), 50)
    // Drop sent comments. `remove` also clears them from the staged set.
    for (const id of ids) void sessionComments.remove(id)
    // Pop back to the terminal so the user sees the agent take the comments.
    setSelection(null)
  }, [session.isBusy, session.writeInput, sessionComments.prepareSubmit, sessionComments.remove])

  // woke2 impl APP-CM3, APP-CM4
  const handleSubmitComment = useCallback(
    async (
      filePath: string,
      anchorCommit: string,
      lineStart: number,
      lineEnd: number | null,
      contents: string,
    ): Promise<void> => {
      if (!session.sessionId) return
      const created = await createComment({
        sessionId: session.sessionId,
        commitHash: anchorCommit,
        filePath,
        rangeStart: lineStart,
        rangeEnd: lineEnd,
        contents,
      })
      sessionComments.add(created)
    },
    [session.sessionId, sessionComments.add],
  )

  // woke2 impl APP-JC1, APP-JC2
  const handleJumpToComment = useCallback(
    (commentId: string): void => {
      const item = sessionComments.comments.find((c) => c.comment.id === commentId)
      if (!item) return
      const proj = item.projection
      if (proj?.kind === "located") {
        const filePath = proj.path ?? item.comment.file_path
        const ok = diffPanelRef.current?.scrollToLine(filePath, proj.start) ?? false
        if (ok) return
      }
      // Fallback: navigate selection to the anchor commit so the user can see
      // the comment in its original location.
      setSelection({ older: item.comment.commit_hash, newer: item.comment.commit_hash })
    },
    [sessionComments.comments],
  )

  const showTerminal = selection === null
  // Workdir-inclusive views (selection.newer === null) are commentable too —
  // anchor resolution happens lazily per-click via handleResolveAnchor, which
  // rejects lines that exist only uncommitted.
  // woke2 impl APP-LC7
  const commentingEnabled = !showTerminal && selection !== null
  // The `claude --resume` picker doesn't offer a "start new session" option, so we
  // overlay our own button while the user hasn't picked a session yet. Once the
  // SessionStart hook fires (either pick from picker, or our restart-without-resume),
  // sessionId is non-null and the button hides.
  const showNewSessionButton =
    showTerminal && session.resumeMode && session.sessionId === null && !session.isConnecting

  // woke2 impl APP-LC1, APP-LC2, APP-LC3, APP-LC4, APP-LC5, APP-LC6
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div
        data-tauri-drag-region
        className={`flex items-center px-4 py-2 ${fullscreen ? "" : "pl-[78px]"}`}
      >
        <h1 className="text-sm font-bold tracking-tight" title={projectPath}>
          {name}
        </h1>
        <div className="-my-1.5 -mr-2 ml-auto" data-tauri-no-drag-region="">
          <ProjectSettingsButton
            projectPath={projectPath}
            branchPrefixMode={projectSettings.branchPrefixMode}
            onUpdate={projectSettings.update}
          />
        </div>
      </div>
      <Separator />

      {session.error ? (
        <>
          <div className="px-4 py-2">
            <p className="text-xs text-destructive">{session.error}</p>
          </div>
          <Separator />
        </>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        <ChatSidebar
          commits={session.commits}
          diffStats={diffStats}
          selection={selection}
          onSelect={setSelection}
          committing={session.isCommitting}
          currentPrefix={session.currentPrefix}
          bottomPanel={
            <CommentsPanel
              comments={sessionComments.comments}
              staged={sessionComments.staged}
              isAgentBusy={session.isBusy}
              onToggleStaged={sessionComments.toggleStaged}
              onToggleAllStaged={sessionComments.setAllStaged}
              onSubmit={handleSubmitStaged}
              onJump={handleJumpToComment}
              onDelete={handleDeleteComment}
            />
          }
        />
        <div className="relative flex-1 overflow-hidden">
          {/* Terminal stays mounted in layout (real dimensions) so xterm's
              internal buffer isn't clobbered by 0x0 resize events when we
              navigate away. When covered, `inert` removes it from the focus +
              pointer-event tree. */}
          <div
            className="absolute inset-0 flex flex-col"
            inert={!showTerminal}
            aria-hidden={!showTerminal}
          >
            {showNewSessionButton && (
              <div className="flex flex-col items-center gap-2 border-b border-border bg-background px-4 py-4">
                <Button size="sm" onClick={() => session.restart({ resume: false })}>
                  New session
                </Button>
                <p className="text-xs text-muted-foreground">Or, resume an existing session:</p>
              </div>
            )}
            <div className="min-h-0 flex-1">
              <TerminalPanel
                key={session.agentId ?? "pending"}
                session={session}
                visible={showTerminal}
              />
            </div>
          </div>
          {!showTerminal && (
            <div className="absolute inset-0 bg-background">
              <DiffPanel
                fileDiffs={fileDiffs}
                isLoading={isDiffLoading}
                selection={selection}
                commits={session.commits}
                commentingEnabled={commentingEnabled}
                comments={sessionComments.comments}
                onDeleteComment={handleDeleteComment}
                onUpdateComment={handleUpdateComment}
                resolveAnchor={handleResolveAnchor}
                onSubmitComment={handleSubmitComment}
                handleRef={diffPanelRef}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
