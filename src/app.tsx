import { Separator } from "@/components/ui/separator"
import { AgentPanel } from "./features/agents/agent-panel"
import { ProjectPicker } from "./features/projects/project-picker"
import { SnapshotSidebar } from "./features/snapshots/snapshot-sidebar"
import { useAgentSession } from "./hooks/use-agent-session"
import { useFullscreen } from "./hooks/use-fullscreen"

const project = window.__PROJECT

export function App(): React.JSX.Element {
  const fullscreen = useFullscreen()
  const session = useAgentSession()

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
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <AgentPanel project={project} session={session} />
        </div>
        {session.hasActiveSession ? <SnapshotSidebar snapshots={session.snapshots} /> : null}
      </div>
    </div>
  )
}
