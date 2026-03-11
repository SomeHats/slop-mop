import { open } from "@tauri-apps/plugin-dialog"
import { X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { listRecentProjects, openProject, removeProject } from "../../lib/tauri"
import type { Project } from "../../lib/types"

type ProjectPickerProps = {
  onProjectOpen: (project: Project) => void
}

export function ProjectPicker({ onProjectOpen }: ProjectPickerProps): React.JSX.Element {
  const [recentProjects, setRecentProjects] = useState<Project[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadRecent = useCallback(async () => {
    try {
      const projects = await listRecentProjects()
      setRecentProjects(projects)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  useEffect(() => {
    void loadRecent()
  }, [loadRecent])

  const handleOpen = async (): Promise<void> => {
    setError(null)
    const selected = await open({ directory: true, multiple: false })
    if (!selected) return

    setLoading(true)
    try {
      const project = await openProject(selected)
      onProjectOpen(project)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (id: string): Promise<void> => {
    try {
      await removeProject(id)
      await loadRecent()
    } catch (e) {
      setError(String(e))
    }
  }

  const handleSelectRecent = async (project: Project): Promise<void> => {
    setError(null)
    setLoading(true)
    try {
      const updated = await openProject(project.path)
      onProjectOpen(updated)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="w-full max-w-md space-y-6 p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Claude Crèche</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Open a git repository to get started.
          </p>
        </div>

        <Button className="w-full" size="lg" onClick={() => void handleOpen()} disabled={loading}>
          {loading ? "Opening..." : "Open Project"}
        </Button>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {recentProjects.length > 0 ? (
          <div className="space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent
            </h2>
            <ul className="space-y-1">
              {recentProjects.map((project) => (
                <li key={project.id} className="group flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSelectRecent(project)}
                    className="flex-1 rounded-none border border-transparent px-3 py-2 text-left transition-all outline-none select-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 active:translate-y-px dark:hover:bg-muted/50"
                  >
                    <span className="block truncate text-sm font-medium text-foreground">
                      {project.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {project.path}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => void handleRemove(project.id)}
                    className="opacity-0 group-hover:opacity-100"
                    title="Remove from recent"
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}
