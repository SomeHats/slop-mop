import { useEffect, useRef, useState } from "react"
import { batchDiffStats } from "@/lib/tauri"
import type { DiffStats, SessionCommit } from "@/lib/types"

export function useDiffStats(
  projectPath: string,
  commits: SessionCommit[],
): Map<string, DiffStats> {
  const [statsMap, setStatsMap] = useState<Map<string, DiffStats>>(new Map())
  const prevKeyRef = useRef("")

  useEffect(() => {
    if (commits.length === 0) {
      setStatsMap(new Map())
      return
    }

    const key = commits.map((c) => c.commit_hash).join(",")
    if (key === prevKeyRef.current) return
    prevKeyRef.current = key

    let cancelled = false
    const hashes = commits.map((c) => c.commit_hash)

    batchDiffStats(projectPath, hashes).then(
      (results) => {
        if (cancelled) return
        const map = new Map<string, DiffStats>()
        for (const stat of results) {
          map.set(stat.commit_hash, stat)
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
  }, [projectPath, commits])

  return statsMap
}
