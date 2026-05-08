import type { DiffHunk } from "@/lib/types"

export type LineData = {
  lineNo: number
  content: string
  type: "context" | "addition" | "deletion"
}

export type StickyContextLine = {
  content: string
  lineNo: number
  /** Offset from the start of the hidden region (0-based) */
  offsetFromTop: number
}

export type SideBySideRow =
  | { kind: "paired"; left: LineData | null; right: LineData | null }
  | { kind: "collapsed"; count: number; regionIndex: number; stickyLines: StickyContextLine[] }

export type RegionExpansion = {
  top: number
  bottom: number
}

const CONTEXT_LINES = 3
// woke2 impl DV-CL8
export const EXPAND_STEP = 20

/**
 * Converts hunk lines into side-by-side paired rows.
 * Context lines → both sides. Deletions → left only. Additions → right only.
 * Adjacent deletion/addition blocks get zipped into paired modification rows.
 */
// woke2 impl DV-RC1, DV-RC2, DV-RC3, DV-RC4
export function computeRows(hunks: DiffHunk[]): SideBySideRow[] {
  const rows: SideBySideRow[] = []

  for (const hunk of hunks) {
    let i = 0
    while (i < hunk.lines.length) {
      const line = hunk.lines[i]
      if (!line) {
        i++
        continue
      }

      if (line.origin === " ") {
        rows.push({
          kind: "paired",
          left: { lineNo: line.old_line_no ?? 0, content: line.content, type: "context" },
          right: { lineNo: line.new_line_no ?? 0, content: line.content, type: "context" },
        })
        i++
        continue
      }

      // Collect consecutive deletion/addition block
      const deletions: LineData[] = []
      const additions: LineData[] = []

      for (let del = hunk.lines[i]; del && del.origin === "-"; del = hunk.lines[++i]) {
        deletions.push({ lineNo: del.old_line_no ?? 0, content: del.content, type: "deletion" })
      }

      for (let add = hunk.lines[i]; add && add.origin === "+"; add = hunk.lines[++i]) {
        additions.push({ lineNo: add.new_line_no ?? 0, content: add.content, type: "addition" })
      }

      // Zip deletions and additions into paired rows
      const maxLen = Math.max(deletions.length, additions.length)
      for (let j = 0; j < maxLen; j++) {
        rows.push({
          kind: "paired",
          left: deletions[j] ?? null,
          right: additions[j] ?? null,
        })
      }
    }
  }

  return rows
}

function pushSlice(
  result: SideBySideRow[],
  source: SideBySideRow[],
  from: number,
  to: number,
): void {
  for (let i = from; i < to; i++) {
    const row = source[i]
    if (row) result.push(row)
  }
}

// woke2 impl DV-SC1
function measureIndent(line: string): number {
  let indent = 0
  for (const ch of line) {
    if (ch === " ") indent++
    else if (ch === "\t") indent += 4
    else break
  }
  return indent
}

/**
 * Detects enclosing scope openers within a range of hidden context rows.
 * Uses indentation as a heuristic: lines whose indent level increases and
 * persists to the end of the hidden range are scope openers.
 */
// woke2 impl DV-SC2, DV-SC3, DV-SC4, DV-SC5
export function computeStickyLines(
  rows: SideBySideRow[],
  startIndex: number,
  endIndex: number,
): StickyContextLine[] {
  const stack: { indent: number; content: string; lineNo: number; offset: number }[] = []

  for (let i = startIndex; i < endIndex; i++) {
    const row = rows[i]
    if (row?.kind !== "paired") continue
    const line = row.left ?? row.right
    if (!line) continue
    if (line.content.trim() === "") continue

    const indent = measureIndent(line.content)

    // Pop entries at >= current indent (their scope closed within the hidden area)
    while (stack.length > 0 && (stack[stack.length - 1]?.indent ?? -1) >= indent) {
      stack.pop()
    }

    stack.push({
      indent,
      content: line.content,
      lineNo: line.lineNo,
      offset: i - startIndex,
    })
  }

  // Drop stack entries whose scope isn't still open at the boundary. We compare
  // against the indent of the first non-blank visible row after the hidden
  // region: an entry at indent >= that boundary indent has already closed (or
  // is itself the boundary line), so it's not an enclosing scope. If there's
  // no visible row after (region runs to EOF), every entry is an opener.
  let boundaryIndent = Number.POSITIVE_INFINITY
  for (let i = endIndex; i < rows.length; i++) {
    const row = rows[i]
    if (row?.kind !== "paired") continue
    const line = row.left ?? row.right
    if (!line) continue
    if (line.content.trim() === "") continue
    boundaryIndent = measureIndent(line.content)
    break
  }

  return stack
    .filter((entry) => entry.indent < boundaryIndent)
    .map((entry) => ({
      content: entry.content,
      lineNo: entry.lineNo,
      offsetFromTop: entry.offset,
    }))
}

/**
 * Determines how many context lines to show at the bottom of a collapsed region.
 * Walks the candidate lines looking for indentation decreases, which signal scope
 * boundaries (e.g. a closing brace). When found, the visible context starts after
 * the last such boundary so that unrelated scope lines stay hidden.
 */
// woke2 impl DV-SB1, DV-SB2
export function computeSmartBottom(
  rows: SideBySideRow[],
  runStart: number,
  runEnd: number,
  maxLines: number,
): number {
  const candidateStart = runEnd - maxLines
  // Scan a few extra lines before the candidate range to seed the indent tracker
  const scanStart = Math.max(runStart, candidateStart - 3)
  let prevIndent = -1
  let lastBoundaryIdx = -1

  for (let i = scanStart; i < runEnd; i++) {
    const row = rows[i]
    if (row?.kind !== "paired") continue
    const line = row.left ?? row.right
    if (!line) continue
    if (line.content.trim() === "") continue

    const indent = measureIndent(line.content)
    if (i >= candidateStart && prevIndent >= 0 && indent < prevIndent) {
      lastBoundaryIdx = i
    }
    prevIndent = indent
  }

  if (lastBoundaryIdx < 0) return maxLines
  return Math.max(1, runEnd - lastBoundaryIdx - 1)
}

/**
 * Collapses long runs of consecutive context rows.
 * Each region tracks how many extra lines are revealed from the top and bottom
 * via the expansions map. Chevron clicks increment these values by EXPAND_STEP.
 */
// woke2 impl DV-CL1, DV-CL2, DV-CL3, DV-CL4, DV-CL5, DV-CL6, DV-CL7
export function collapseRows(
  rows: SideBySideRow[],
  expansions: Map<number, RegionExpansion>,
): SideBySideRow[] {
  // Identify runs of consecutive context rows
  type Run = { start: number; length: number }
  const runs: Run[] = []
  let runStart = -1
  let runLength = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const isContext =
      row?.kind === "paired" && row.left?.type === "context" && row.right?.type === "context"

    if (isContext) {
      if (runStart === -1) {
        runStart = i
        runLength = 1
      } else {
        runLength++
      }
    } else {
      if (runStart !== -1) {
        runs.push({ start: runStart, length: runLength })
        runStart = -1
        runLength = 0
      }
    }
  }
  if (runStart !== -1) {
    runs.push({ start: runStart, length: runLength })
  }

  const result: SideBySideRow[] = []
  let cursor = 0
  const threshold = CONTEXT_LINES * 2 + 1

  for (let regionIndex = 0; regionIndex < runs.length; regionIndex++) {
    const run = runs[regionIndex]
    if (!run) continue
    const runEnd = run.start + run.length
    const isAtStart = run.start === 0
    const isAtEnd = runEnd === rows.length

    // Emit rows before this run
    pushSlice(result, rows, cursor, run.start)
    cursor = run.start

    if (run.length <= threshold) {
      // Short run — emit all, no collapsing
      pushSlice(result, rows, cursor, runEnd)
      cursor = runEnd
      continue
    }

    const expansion = expansions.get(regionIndex)
    const revealedTop = expansion?.top ?? 0
    const revealedBottom = expansion?.bottom ?? 0

    // Base visible lines at each boundary
    const baseTop = isAtStart ? 0 : CONTEXT_LINES
    const baseBottom = isAtEnd ? 0 : computeSmartBottom(rows, run.start, runEnd, CONTEXT_LINES)

    const showTop = baseTop + revealedTop
    const showBottom = baseBottom + revealedBottom
    const totalVisible = showTop + showBottom
    const remaining = run.length - totalVisible

    if (remaining <= 0) {
      // Fully revealed
      pushSlice(result, rows, cursor, runEnd)
      cursor = runEnd
    } else {
      // Top visible lines
      if (showTop > 0) {
        pushSlice(result, rows, run.start, run.start + showTop)
      }
      // Collapsed marker
      const hiddenStart = run.start + showTop
      const hiddenEnd = runEnd - showBottom
      const stickyLines = computeStickyLines(rows, hiddenStart, hiddenEnd)
      result.push({ kind: "collapsed", count: remaining, regionIndex, stickyLines })
      // Bottom visible lines
      if (showBottom > 0) {
        pushSlice(result, rows, runEnd - showBottom, runEnd)
      }
      cursor = runEnd
    }
  }

  // Emit remaining rows after last run
  pushSlice(result, rows, cursor, rows.length)

  return result
}
