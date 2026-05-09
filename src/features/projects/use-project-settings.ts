import { useCallback, useEffect, useRef, useState } from "react"
import { getProjectSettings, updateProjectSettings } from "@/lib/tauri"
import type { BranchPrefixMode, ProjectSettings } from "@/lib/types"

export type UseProjectSettings = {
  settings: ProjectSettings
  branchPrefixMode: BranchPrefixMode
  ignoreWhitespace: boolean
  /** Update one or more settings. Optimistic; reverts on backend error. */
  update: (partial: Partial<ProjectSettings>) => void
}

// woke2 impl PFE-PS1, PFE-PS2, PFE-PS3, PFE-PS4
export function useProjectSettings(projectId: string): UseProjectSettings {
  const [settings, setSettings] = useState<ProjectSettings>({})
  // Snapshot for optimistic-revert.
  const lastSavedRef = useRef<ProjectSettings>({})

  useEffect(() => {
    let cancelled = false
    void getProjectSettings(projectId).then(
      (s) => {
        if (cancelled) return
        setSettings(s)
        lastSavedRef.current = s
      },
      (e) => console.error("[slop-mop] getProjectSettings failed", e),
    )
    return () => {
      cancelled = true
    }
  }, [projectId])

  const update = useCallback(
    (partial: Partial<ProjectSettings>): void => {
      const previous = lastSavedRef.current
      const next: ProjectSettings = { ...previous, ...partial }
      setSettings(next)
      lastSavedRef.current = next
      void updateProjectSettings(projectId, next).catch((e) => {
        console.error("[slop-mop] updateProjectSettings failed", e)
        setSettings(previous)
        lastSavedRef.current = previous
      })
    },
    [projectId],
  )

  return {
    settings,
    branchPrefixMode: settings.branchPrefixMode ?? "none",
    ignoreWhitespace: settings.ignoreWhitespace ?? false,
    update,
  }
}
