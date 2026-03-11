import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { AgentPanel } from "./features/agents/agent-panel"
import { ProjectPicker } from "./features/projects/project-picker"
import type { Project } from "./lib/types"

export function App(): React.JSX.Element {
  const [currentProject, setCurrentProject] = useState<Project | null>(null)

  if (!currentProject) {
    return <ProjectPicker onProjectOpen={setCurrentProject} />
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold tracking-tight">{currentProject.name}</h1>
          <span className="text-xs text-muted-foreground">{currentProject.path}</span>
        </div>
        <Button variant="ghost" size="xs" onClick={() => setCurrentProject(null)}>
          Close
        </Button>
      </div>
      <Separator />
      <div className="flex-1 overflow-hidden">
        <AgentPanel projectPath={currentProject.path} />
      </div>
    </div>
  )
}
