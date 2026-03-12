import { useEffect, useRef, useState } from "react"
import { batchDiffStats } from "@/lib/tauri"
import type { DiffStats, PromptSnapshot } from "@/lib/types"

export function useDiffStats(
  projectPath: string,
  snapshots: PromptSnapshot[],
): Map<string, DiffStats> {
  const [statsMap, setStatsMap] = useState<Map<string, DiffStats>>(new Map())
  const prevKeyRef = useRef("")

  useEffect(() => {
    if (snapshots.length === 0) {
      setStatsMap(new Map())
      return
    }

    // Only re-fetch when the snapshot list actually changes
    const key = snapshots.map((s) => `${s.id}:${s.commit_hash}`).join(",")
    if (key === prevKeyRef.current) return
    prevKeyRef.current = key

    let cancelled = false
    const hashes: [string, string][] = snapshots.map((s) => [s.id, s.commit_hash])

    batchDiffStats(projectPath, hashes).then(
      (results) => {
        if (cancelled) return
        const map = new Map<string, DiffStats>()
        for (const stat of results) {
          map.set(stat.snapshot_id, stat)
        }
        setStatsMap(map)
      },
      () => {
        // Non-critical — leave previous stats
      },
    )

    return () => {
      cancelled = true
    }
  }, [projectPath, snapshots])

  return statsMap
}
