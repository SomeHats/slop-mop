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
import { listRecentProjects, openProjectWindow, removeProject } from "../../lib/tauri"
import type { Project } from "../../lib/types"

export function ProjectPicker(): React.JSX.Element {
  const [recentProjects, setRecentProjects] = useState<Project[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // woke2 impl PFE-PK1, PFE-PK4
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

  // woke2 impl PFE-PK2, PFE-PK3
  const handleOpen = async (): Promise<void> => {
    setError(null)
    const selected = await open({ directory: true, multiple: false })
    if (!selected) return

    setLoading(true)
    try {
      await openProjectWindow(selected)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  // woke2 impl PFE-PK6
  const handleRemove = async (id: string): Promise<void> => {
    try {
      await removeProject(id)
      await loadRecent()
    } catch (e) {
      setError(String(e))
    }
  }

  // woke2 impl PFE-PK6
  const handleSelectRecent = async (project: Project): Promise<void> => {
    setError(null)
    setLoading(true)
    try {
      await openProjectWindow(project.path)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  // woke2 impl PFE-PK5, PFE-PK7
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div data-tauri-drag-region className="h-12 shrink-0" />
      <div className="flex flex-1 items-center justify-center">
        <div className="flex w-full max-w-md flex-col gap-6 p-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight">Slop Mop</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Open a git repository to get started.
            </p>
          </div>

          <Button className="w-full" size="lg" onClick={() => void handleOpen()} disabled={loading}>
            {loading ? "Opening..." : "Open Project"}
          </Button>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {recentProjects.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recent
              </h2>
              <ItemGroup>
                {recentProjects.slice(0, 3).map((project) => (
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
                          <X data-icon="inline-start" />
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
    </div>
  )
}
