import { listen } from "@tauri-apps/api/event"
import { useCallback, useEffect, useState } from "react"
import { Separator } from "@/components/ui/separator"
import { SessionPicker } from "./features/agents/session-picker"
import { ChatSidebar } from "./features/chat/chat-sidebar"
import { DiffPanel } from "./features/diff/diff-panel"
import { ExecutePermissionDialog } from "./features/permissions/execute-permission-dialog"
import { PermissionDialog } from "./features/permissions/permission-dialog"
import { PermissionsEditor } from "./features/permissions/permissions-editor"
import { ProjectPicker } from "./features/projects/project-picker"
import { useAgentSession } from "./hooks/use-agent-session"
import { useDiffStats } from "./hooks/use-diff-stats"
import { useFullscreen } from "./hooks/use-fullscreen"
import { useRepoDiff } from "./hooks/use-repo-diff"
import { startWatching } from "./lib/tauri"

const project = window.__PROJECT

export function App(): React.JSX.Element {
  const fullscreen = useFullscreen()
  const session = useAgentSession()

  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null)
  const [permissionsEditorOpen, setPermissionsEditorOpen] = useState(false)

  const {
    snapshots,
    hasActiveSession,
    isConnected,
    isProcessing,
    previousSessions,
    error,
    autoCommitPhase,
  } = session

  // Connect to the agent and start FS watcher on mount
  useEffect(() => {
    if (!project) return
    void session.connect(project.path, project.id)
    void startWatching(project.path)
  }, [session.connect])

  // Listen for menu "Permissions…" event
  useEffect(() => {
    const unlisten = listen("open-permissions-editor", () => {
      setPermissionsEditorOpen(true)
    })
    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [])

  // Auto-select latest snapshot when list grows
  useEffect(() => {
    if (snapshots.length === 0) return
    const latest = snapshots[snapshots.length - 1]
    if (latest) {
      setSelectedSnapshotId(latest.id)
    }
  }, [snapshots])

  const diffStats = useDiffStats(project?.path ?? "", snapshots)

  const selectedSnapshot = snapshots.find((s) => s.id === selectedSnapshotId) ?? null

  const { fileDiffs, isLoading: isDiffLoading } = useRepoDiff(
    project?.path ?? "",
    selectedSnapshot?.commit_hash ?? null,
  )

  const handleSendPrompt = useCallback(
    (text: string, modeId?: string) => {
      void session.sendPrompt(text, modeId)
    },
    [session.sendPrompt],
  )

  if (!project) {
    return <ProjectPicker />
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div
        data-tauri-drag-region
        className={`flex items-center px-4 py-2 ${fullscreen ? "" : "pl-[78px]"}`}
      >
        <h1 className="text-sm font-bold tracking-tight" title={project.path}>
          {project.name}
        </h1>
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

      <div className="flex flex-1 overflow-hidden">
        {hasActiveSession ? (
          <>
            <ChatSidebar
              timeline={session.timeline}
              snapshots={snapshots}
              diffStats={diffStats}
              selectedSnapshotId={selectedSnapshotId}
              onSelectSnapshot={setSelectedSnapshotId}
              isProcessing={isProcessing}
              autoCommitPhase={autoCommitPhase}
              availableModes={session.availableModes}
              currentModeId={session.currentModeId}
              onSendPrompt={handleSendPrompt}
            />
            <div className="flex-1 overflow-hidden">
              <DiffPanel
                fileDiffs={fileDiffs}
                isLoading={isDiffLoading}
                selectedSnapshot={selectedSnapshot}
                pendingPlanContent={session.pendingPlanContent}
                onApprovePlan={session.approvePlan}
                onRejectPlan={session.rejectPlan}
                onCancelPlan={session.cancelPlan}
              />
            </div>
          </>
        ) : isConnected ? (
          <SessionPicker
            sessions={previousSessions}
            isProcessing={isProcessing}
            onNewSession={() => void session.newSession()}
            onResumeSession={(id) => void session.resumeSession(id)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {isProcessing ? "Connecting..." : "Waiting for connection..."}
            </p>
          </div>
        )}
      </div>

      <PermissionDialog
        pending={session.pendingPermission}
        projectId={project.id}
        onAllowOnce={session.allowOncePermission}
        onDenyOnce={session.denyOncePermission}
        onCreateRules={session.createPermissionRules}
      />
      <ExecutePermissionDialog
        pending={session.pendingExecutePermission}
        projectId={project.id}
        onAllowOnce={session.allowOnceExecutePermission}
        onDenyOnce={session.denyOnceExecutePermission}
        onCreateRules={session.createExecutePermissionRules}
      />
      <PermissionsEditor
        open={permissionsEditorOpen}
        onOpenChange={setPermissionsEditorOpen}
        projectId={project.id}
      />
    </div>
  )
}
