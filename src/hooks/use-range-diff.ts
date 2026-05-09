import { listen } from "@tauri-apps/api/event"
import { useCallback, useEffect, useRef, useState } from "react"
import { getRangeDiff } from "@/lib/tauri"
import type { FileDiff, Selection } from "@/lib/types"

type UseRangeDiffResult = {
  fileDiffs: FileDiff[]
  isLoading: boolean
}

const DEBOUNCE_MS = 200

function selectionKey(sel: Selection | null, ignoreWhitespace: boolean): string {
  if (!sel) return ""
  return `${sel.older ?? "_"}|${sel.newer ?? "_"}|${ignoreWhitespace ? "1" : "0"}`
}

// woke2 impl RD-1, RD-2, RD-3, RD-4, RD-5, RD-6
export function useRangeDiff(
  projectPath: string,
  selection: Selection | null,
  ignoreWhitespace: boolean,
): UseRangeDiffResult {
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const prevKeyRef = useRef("")
  const selectionRef = useRef<Selection | null>(null)
  const ignoreWhitespaceRef = useRef(ignoreWhitespace)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchDiff = useCallback(
    (sel: Selection, ignoreWs: boolean, signal: { cancelled: boolean }): void => {
      getRangeDiff(projectPath, sel.older, sel.newer, ignoreWs).then(
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
    ignoreWhitespaceRef.current = ignoreWhitespace

    if (!selection) {
      setFileDiffs([])
      setIsLoading(false)
      prevKeyRef.current = ""
      return
    }

    const key = selectionKey(selection, ignoreWhitespace)
    if (key === prevKeyRef.current) return
    prevKeyRef.current = key

    const signal = { cancelled: false }
    setIsLoading(true)
    fetchDiff(selection, ignoreWhitespace, signal)

    return () => {
      signal.cancelled = true
    }
  }, [selection, ignoreWhitespace, fetchDiff])

  // Live-refresh when the working tree changes — but only if the selection's
  // `newer` end is the workdir (otherwise the diff is between fixed commits
  // and editor changes don't affect it).
  useEffect(() => {
    const signal = { cancelled: false }

    const unlisten = listen("fs-change", () => {
      const sel = selectionRef.current
      if (!sel || sel.newer !== null) return

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(
        () => fetchDiff(sel, ignoreWhitespaceRef.current, signal),
        DEBOUNCE_MS,
      )
    })

    return () => {
      signal.cancelled = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
      void unlisten.then((fn) => fn())
    }
  }, [fetchDiff])

  return { fileDiffs, isLoading }
}
