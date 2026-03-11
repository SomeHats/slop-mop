import { open } from "@tauri-apps/plugin-dialog"
import { X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
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
            <ItemGroup>
              {recentProjects.map((project) => (
                <Item key={project.id} asChild size="sm" className="cursor-pointer">
                  <button type="button" onClick={() => void handleSelectRecent(project)}>
                    <ItemContent>
                      <ItemTitle>{project.name}</ItemTitle>
                      <ItemDescription>{project.path}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleRemove(project.id)
                        }}
                        className="opacity-0 group-hover/item:opacity-100"
                        title="Remove from recent"
                      >
                        <X />
                      </Button>
                    </ItemActions>
                  </button>
                </Item>
              ))}
            </ItemGroup>
          </div>
        ) : null}
      </div>
    </div>
  )
}
