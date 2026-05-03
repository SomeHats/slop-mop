import type { Comment } from "@/lib/types"
import type { HighlightedRow, HighlightedStickyLine } from "./use-highlighted-diff"

/**
 * One vertical "slot" in the diff body. Slots are emitted in document order;
 * each of the 4 columns (left gutter, left code, right gutter, right code)
 * iterates the slot list and emits a `<div>` per slot of `heightPx` so that
 * the columns stay aligned. Absolutely-positioned overlays (collapse bars,
 * comment cards) use the slot's `topPx` to anchor over the in-flow spacers.
 */
export type DiffSlot =
  | { kind: "row"; rowIndex: number; topPx: number; heightPx: number }
  | {
      kind: "collapsed"
      rowIndex: number
      regionIndex: number
      topPx: number
      heightPx: number
    }
  | { kind: "commentSpacer"; commentId: string; topPx: number; heightPx: number }

export type CollapsedBar = {
  regionIndex: number
  topPx: number
  heightPx: number
  count: number
  stickyLines: HighlightedStickyLine[]
}

export type CommentOverlay = {
  commentId: string
  topPx: number
}

export type DiffLayout = {
  slots: DiffSlot[]
  collapsedBars: CollapsedBar[]
  commentOverlays: CommentOverlay[]
  totalHeightPx: number
}

export type DiffLayoutInput = {
  rows: HighlightedRow[]
  /** Comments keyed by their projected right-side anchor line number. The
   *  caller is responsible for choosing the anchor (e.g. `range_end ?? range_start`)
   *  and filtering to comments visible in the current view. */
  commentsByAnchorLine: Map<number, Comment[]>
  /** Measured pixel heights per comment id. Missing entries treated as 0
   *  (first-frame, before ResizeObserver reports). */
  commentHeights: Map<string, number>
  /** Pixel height of one code row. Resolved from `--root-font-size × 1.25rem`
   *  by the caller so this helper stays unitless. */
  rowHeightPx: number
}

/**
 * Walks the row list once and produces an in-flow slot list plus the absolute
 * overlay positions. Pure: no React, no DOM access.
 */
export function computeDiffLayout(input: DiffLayoutInput): DiffLayout {
  const { rows, commentsByAnchorLine, commentHeights, rowHeightPx } = input
  const slots: DiffSlot[] = []
  const collapsedBars: CollapsedBar[] = []
  const commentOverlays: CommentOverlay[] = []
  let topPx = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue

    if (row.kind === "collapsed") {
      const heightPx = (1 + row.stickyLines.length) * rowHeightPx
      slots.push({
        kind: "collapsed",
        rowIndex: i,
        regionIndex: row.regionIndex,
        topPx,
        heightPx,
      })
      collapsedBars.push({
        regionIndex: row.regionIndex,
        topPx,
        heightPx,
        count: row.count,
        stickyLines: row.stickyLines,
      })
      topPx += heightPx
      continue
    }

    slots.push({ kind: "row", rowIndex: i, topPx, heightPx: rowHeightPx })
    topPx += rowHeightPx

    const lineNo = row.right?.lineNo
    if (lineNo == null) continue
    const here = commentsByAnchorLine.get(lineNo)
    if (!here || here.length === 0) continue
    for (const c of here) {
      const heightPx = commentHeights.get(c.id) ?? 0
      commentOverlays.push({ commentId: c.id, topPx })
      slots.push({ kind: "commentSpacer", commentId: c.id, topPx, heightPx })
      topPx += heightPx
    }
  }

  return { slots, collapsedBars, commentOverlays, totalHeightPx: topPx }
}

/**
 * Picks the right-side line number a comment should anchor to in the current
 * view. Uses the projected `end` when present (so the card sits below the last
 * line of a multi-line range), otherwise the projected `start`.
 */
export function commentAnchorLine(projectionEnd: number | null, projectionStart: number): number {
  return projectionEnd ?? projectionStart
}
