import { useCallback, useEffect, useState } from "react"
import { Separator } from "@/components/ui/separator"
import { SessionPicker } from "./features/agents/session-picker"
import { DiffPanel } from "./features/diff/diff-panel"
import { ProjectPicker } from "./features/projects/project-picker"
import { PromptOutputDialog } from "./features/snapshots/prompt-output-dialog"
import { PromptSidebar } from "./features/snapshots/prompt-sidebar"
import { useAgentSession } from "./hooks/use-agent-session"
import { useDiffStats } from "./hooks/use-diff-stats"
import { useFullscreen } from "./hooks/use-fullscreen"
import { useRepoDiff } from "./hooks/use-repo-diff"

const project = window.__PROJECT

export function App(): React.JSX.Element {
  const fullscreen = useFullscreen()
  const session = useAgentSession()

  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null)
  const [viewingOutputSnapshotId, setViewingOutputSnapshotId] = useState<string | null>(null)

  const { snapshots, hasActiveSession, isConnected, isProcessing, previousSessions, error } =
    session

  // Connect to the agent on mount
  useEffect(() => {
    if (!project) return
    void session.connect(project.path, project.id)
  }, [session.connect])

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
  const viewingOutputSnapshot = snapshots.find((s) => s.id === viewingOutputSnapshotId) ?? null

  const { fileDiffs, isLoading: isDiffLoading } = useRepoDiff(
    project?.path ?? "",
    selectedSnapshot?.commit_hash ?? null,
  )

  const handleSendPrompt = useCallback(
    (text: string) => {
      void session.sendPrompt(text)
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
            <PromptSidebar
              snapshots={snapshots}
              diffStats={diffStats}
              selectedSnapshotId={selectedSnapshotId}
              onSelectSnapshot={setSelectedSnapshotId}
              onViewOutput={setViewingOutputSnapshotId}
              isProcessing={isProcessing}
            />
            <div className="flex-1 overflow-hidden">
              <DiffPanel
                fileDiffs={fileDiffs}
                isLoading={isDiffLoading}
                selectedSnapshot={selectedSnapshot}
                onSendPrompt={handleSendPrompt}
                isProcessing={isProcessing}
              />
            </div>
            <PromptOutputDialog
              snapshot={viewingOutputSnapshot}
              timeline={session.timeline}
              isProcessing={isProcessing}
              open={viewingOutputSnapshotId !== null}
              onClose={() => setViewingOutputSnapshotId(null)}
            />
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
    </div>
  )
}
