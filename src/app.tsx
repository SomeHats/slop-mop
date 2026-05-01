import { useEffect, useState } from "react"
import { Separator } from "@/components/ui/separator"
import { ChatSidebar } from "./features/chat/chat-sidebar"
import { DiffPanel } from "./features/diff/diff-panel"
import { ProjectPicker } from "./features/projects/project-picker"
import { TerminalPanel } from "./features/terminal/terminal-panel"
import { useClaudeSession } from "./hooks/use-claude-session"
import { useDiffStats } from "./hooks/use-diff-stats"
import { useFullscreen } from "./hooks/use-fullscreen"
import { useRepoDiff } from "./hooks/use-repo-diff"
import { startWatching } from "./lib/tauri"

const project = window.__PROJECT

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
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    void startWatching(projectPath)
  }, [projectPath])

  const diffStats = useDiffStats(projectPath, session.snapshots)
  const selectedSnapshot =
    selectedId === null ? null : (session.snapshots.find((s) => s.id === selectedId) ?? null)
  const { fileDiffs, isLoading: isDiffLoading } = useRepoDiff(
    projectPath,
    selectedSnapshot?.commit_hash ?? null,
  )

  const showTerminal = selectedId === null

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div
        data-tauri-drag-region
        className={`flex items-center px-4 py-2 ${fullscreen ? "" : "pl-[78px]"}`}
      >
        <h1 className="text-sm font-bold tracking-tight" title={projectPath}>
          {name}
        </h1>
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
          snapshots={session.snapshots}
          diffStats={diffStats}
          selectedSnapshotId={selectedId}
          onSelect={setSelectedId}
        />
        <div className="relative flex-1 overflow-hidden">
          {/* Terminal stays mounted in layout (real dimensions) so xterm's
              internal buffer isn't clobbered by 0x0 resize events when we
              navigate away. When covered, `inert` removes it from the focus +
              pointer-event tree. */}
          <div className="absolute inset-0" inert={!showTerminal} aria-hidden={!showTerminal}>
            <TerminalPanel
              key={session.agentId ?? "pending"}
              session={session}
              visible={showTerminal}
            />
          </div>
          {!showTerminal && (
            <div className="absolute inset-0 bg-background">
              <DiffPanel
                fileDiffs={fileDiffs}
                isLoading={isDiffLoading}
                selectedSnapshot={selectedSnapshot}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
