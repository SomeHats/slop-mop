import { listen } from "@tauri-apps/api/event"
import { useCallback, useEffect, useRef, useState } from "react"
import { getRepoDiff } from "@/lib/tauri"
import type { FileDiff } from "@/lib/types"

type UseRepoDiffResult = {
  fileDiffs: FileDiff[]
  isLoading: boolean
}

const DEBOUNCE_MS = 200

export function useRepoDiff(projectPath: string, commitHash: string | null): UseRepoDiffResult {
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const prevHashRef = useRef<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchDiff = useCallback(
    (hash: string, signal: { cancelled: boolean }): void => {
      getRepoDiff(projectPath, hash).then(
        (diffs) => {
          if (signal.cancelled) return
          setFileDiffs(diffs)
          setIsLoading(false)
        },
        () => {
          if (signal.cancelled) return
          setFileDiffs([])
          setIsLoading(false)
        },
      )
    },
    [projectPath],
  )

  // Initial fetch when commit hash changes
  useEffect(() => {
    if (!commitHash) {
      setFileDiffs([])
      setIsLoading(false)
      prevHashRef.current = null
      return
    }

    if (commitHash === prevHashRef.current) return
    prevHashRef.current = commitHash

    const signal = { cancelled: false }
    setIsLoading(true)
    fetchDiff(commitHash, signal)

    return () => {
      signal.cancelled = true
    }
  }, [commitHash, fetchDiff])

  // Listen for fs-change events and debounce re-fetches
  useEffect(() => {
    const signal = { cancelled: false }

    const unlisten = listen("fs-change", () => {
      const hash = prevHashRef.current
      if (!hash) return

      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      debounceRef.current = setTimeout(() => {
        fetchDiff(hash, signal)
      }, DEBOUNCE_MS)
    })

    return () => {
      signal.cancelled = true
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      void unlisten.then((fn) => fn())
    }
  }, [fetchDiff])

  return { fileDiffs, isLoading }
}
