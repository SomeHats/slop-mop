import { Separator } from "@/components/ui/separator"
import { AgentPanel } from "./features/agents/agent-panel"
import { ProjectPicker } from "./features/projects/project-picker"
import { useFullscreen } from "./hooks/use-fullscreen"

const project = window.__PROJECT

export function App(): React.JSX.Element {
  const fullscreen = useFullscreen()

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
      <div className="flex-1 overflow-hidden">
        <AgentPanel projectPath={project.path} />
      </div>
    </div>
  )
}
