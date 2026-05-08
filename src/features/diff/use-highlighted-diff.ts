import { useEffect, useMemo, useState } from "react"
import { langFromPath } from "@/lib/lang"
import { highlightTokens, type ThemedToken } from "@/lib/shiki"
import type { FileDiff } from "@/lib/types"
import {
  collapseRows,
  computeRows,
  type LineData,
  type RegionExpansion,
  type SideBySideRow,
  type StickyContextLine,
} from "./compute-diff-rows"

export type HighlightedLineData = LineData & {
  tokens: ThemedToken[] | null
}

export type HighlightedStickyLine = StickyContextLine & {
  tokens: ThemedToken[] | null
}

export type HighlightedRow =
  | { kind: "paired"; left: HighlightedLineData | null; right: HighlightedLineData | null }
  | {
      kind: "collapsed"
      count: number
      regionIndex: number
      stickyLines: HighlightedStickyLine[]
    }

const EMPTY_LINE_SET: ReadonlySet<number> = new Set()

/**
 * Reconstruct the old- and new-side full-file line lists from the unfiltered
 * row list. Highlighter input must include hidden context lines so token
 * resolution doesn't break inside collapsed regions.
 */
// woke2 impl DV-HL1
export function reconstructOldNewLines(rows: SideBySideRow[]): {
  oldLines: { lineNo: number; content: string }[]
  newLines: { lineNo: number; content: string }[]
} {
  const oldLines: { lineNo: number; content: string }[] = []
  const newLines: { lineNo: number; content: string }[] = []
  for (const row of rows) {
    if (row.kind !== "paired") continue
    if (row.left) oldLines.push({ lineNo: row.left.lineNo, content: row.left.content })
    if (row.right) newLines.push({ lineNo: row.right.lineNo, content: row.right.content })
  }
  return { oldLines, newLines }
}

// woke2 impl DV-HL1, DV-HL2, DV-HL3, DV-HL4
export function useHighlightedDiff(
  fileDiff: FileDiff,
  expansions: Map<number, RegionExpansion>,
  mustShowRightLines: ReadonlySet<number> = EMPTY_LINE_SET,
): { rows: HighlightedRow[]; isHighlighting: boolean } {
  const allRows = useMemo(() => computeRows(fileDiff.hunks), [fileDiff.hunks])
  const visibleRows = useMemo(
    () => collapseRows(allRows, expansions, mustShowRightLines),
    [allRows, expansions, mustShowRightLines],
  )

  // Reconstruct old and new full text from all rows (not just visible) so the
  // highlighter sees full surrounding context — collapsed regions still
  // contribute lines to the input.
  const { oldLines, newLines } = useMemo(() => reconstructOldNewLines(allRows), [allRows])

  const lang = useMemo(() => langFromPath(fileDiff.path), [fileDiff.path])

  const [oldTokens, setOldTokens] = useState<Map<number, ThemedToken[]> | null>(null)
  const [newTokens, setNewTokens] = useState<Map<number, ThemedToken[]> | null>(null)
  const [isHighlighting, setIsHighlighting] = useState(false)

  useEffect(() => {
    if (!lang) {
      setOldTokens(null)
      setNewTokens(null)
      return
    }

    let cancelled = false
    setIsHighlighting(true)

    const oldText = oldLines.map((l) => l.content).join("\n")
    const newText = newLines.map((l) => l.content).join("\n")

    Promise.all([highlightTokens(oldText, lang), highlightTokens(newText, lang)]).then(
      ([oldResult, newResult]) => {
        if (cancelled) return

        if (oldResult) {
          const map = new Map<number, ThemedToken[]>()
          for (let i = 0; i < oldLines.length; i++) {
            const line = oldLines[i]
            const tokens = oldResult[i]
            if (line && tokens) map.set(line.lineNo, tokens)
          }
          setOldTokens(map)
        }

        if (newResult) {
          const map = new Map<number, ThemedToken[]>()
          for (let i = 0; i < newLines.length; i++) {
            const line = newLines[i]
            const tokens = newResult[i]
            if (line && tokens) map.set(line.lineNo, tokens)
          }
          setNewTokens(map)
        }

        setIsHighlighting(false)
      },
    )

    return () => {
      cancelled = true
    }
  }, [lang, oldLines, newLines])

  // Map tokens back to visible rows
  const highlightedRows: HighlightedRow[] = useMemo(() => {
    return visibleRows.map((row): HighlightedRow => {
      if (row.kind === "collapsed") {
        return {
          ...row,
          stickyLines: row.stickyLines.map((sl) => ({
            ...sl,
            tokens: oldTokens?.get(sl.lineNo) ?? newTokens?.get(sl.lineNo) ?? null,
          })),
        }
      }

      return {
        kind: "paired",
        left: row.left
          ? {
              ...row.left,
              tokens: oldTokens?.get(row.left.lineNo) ?? null,
            }
          : null,
        right: row.right
          ? {
              ...row.right,
              tokens: newTokens?.get(row.right.lineNo) ?? null,
            }
          : null,
      }
    })
  }, [visibleRows, oldTokens, newTokens])

  return { rows: highlightedRows, isHighlighting }
}
