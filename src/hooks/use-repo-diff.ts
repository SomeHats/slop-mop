import { useEffect, useRef, useState } from "react"
import { getRepoDiff } from "@/lib/tauri"
import type { FileDiff } from "@/lib/types"

type UseRepoDiffResult = {
  fileDiffs: FileDiff[]
  isLoading: boolean
}

export function useRepoDiff(projectPath: string, commitHash: string | null): UseRepoDiffResult {
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const prevHashRef = useRef<string | null>(null)

  useEffect(() => {
    if (!commitHash) {
      setFileDiffs([])
      setIsLoading(false)
      return
    }

    if (commitHash === prevHashRef.current) return
    prevHashRef.current = commitHash

    let cancelled = false
    setIsLoading(true)

    getRepoDiff(projectPath, commitHash).then(
      (diffs) => {
        if (cancelled) return
        setFileDiffs(diffs)
        setIsLoading(false)
      },
      () => {
        if (cancelled) return
        setFileDiffs([])
        setIsLoading(false)
      },
    )

    return () => {
      cancelled = true
    }
  }, [projectPath, commitHash])

  return { fileDiffs, isLoading }
}
