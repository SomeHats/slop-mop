import { listen } from "@tauri-apps/api/event"
import { useCallback, useEffect, useRef, useState } from "react"
import { getRangeDiff } from "@/lib/tauri"
import type { FileDiff, Selection } from "@/lib/types"

type UseRangeDiffResult = {
  fileDiffs: FileDiff[]
  isLoading: boolean
}

const DEBOUNCE_MS = 200

function selectionKey(sel: Selection | null): string {
  if (!sel) return ""
  return `${sel.older ?? "_"}|${sel.newer ?? "_"}`
}

// woke2 impl RD-1, RD-2, RD-3, RD-4, RD-5
export function useRangeDiff(projectPath: string, selection: Selection | null): UseRangeDiffResult {
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const prevKeyRef = useRef("")
  const selectionRef = useRef<Selection | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchDiff = useCallback(
    (sel: Selection, signal: { cancelled: boolean }): void => {
      getRangeDiff(projectPath, sel.older, sel.newer).then(
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

  useEffect(() => {
    selectionRef.current = selection

    if (!selection) {
      setFileDiffs([])
      setIsLoading(false)
      prevKeyRef.current = ""
      return
    }

    const key = selectionKey(selection)
    if (key === prevKeyRef.current) return
    prevKeyRef.current = key

    const signal = { cancelled: false }
    setIsLoading(true)
    fetchDiff(selection, signal)

    return () => {
      signal.cancelled = true
    }
  }, [selection, fetchDiff])

  // Live-refresh when the working tree changes — but only if the selection's
  // `newer` end is the workdir (otherwise the diff is between fixed commits
  // and editor changes don't affect it).
  useEffect(() => {
    const signal = { cancelled: false }

    const unlisten = listen("fs-change", () => {
      const sel = selectionRef.current
      if (!sel || sel.newer !== null) return

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => fetchDiff(sel, signal), DEBOUNCE_MS)
    })

    return () => {
      signal.cancelled = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
      void unlisten.then((fn) => fn())
    }
  }, [fetchDiff])

  return { fileDiffs, isLoading }
}
