import { describe, expect, it } from "vitest"
import type { Comment } from "@/lib/types"
import { commentAnchorLine, computeDiffLayout } from "./diff-layout"
import type { HighlightedRow } from "./use-highlighted-diff"

const ROW_PX = 20

function pairedRow(leftLine: number | null, rightLine: number | null): HighlightedRow {
  return {
    kind: "paired",
    left:
      leftLine === null ? null : { lineNo: leftLine, content: "L", type: "context", tokens: null },
    right:
      rightLine === null
        ? null
        : { lineNo: rightLine, content: "R", type: "context", tokens: null },
  }
}

function collapsedRow(regionIndex: number, count: number, stickyCount: number = 0): HighlightedRow {
  return {
    kind: "collapsed",
    regionIndex,
    count,
    stickyLines: Array.from({ length: stickyCount }, (_, i) => ({
      lineNo: 100 + i,
      content: "ctx",
      offsetFromTop: i,
      tokens: null,
    })),
  }
}

function makeComment(id: string, line: number, lineEnd: number | null = null): Comment {
  return {
    id,
    session_id: "s",
    commit_hash: "abc",
    file_path: "f.ts",
    range_start: line,
    range_end: lineEnd,
    contents: "c",
    created_at: "2026-05-02T00:00:00Z",
  }
}

// woke2 test DV-LY1, DV-LY2, DV-LY3, DV-LY4
describe("computeDiffLayout", () => {
  it("returns one slot per row when there are no comments", () => {
    const rows: HighlightedRow[] = [pairedRow(1, 1), pairedRow(2, 2), pairedRow(3, 3)]
    const layout = computeDiffLayout({
      rows,
      commentsByAnchorLine: new Map(),
      commentHeights: new Map(),
      rowHeightPx: ROW_PX,
    })
    expect(layout.slots).toHaveLength(3)
    expect(layout.slots.map((s) => s.topPx)).toEqual([0, 20, 40])
    expect(layout.commentOverlays).toEqual([])
    expect(layout.collapsedBars).toEqual([])
    expect(layout.totalHeightPx).toBe(60)
  })

  it("inserts a comment spacer after the anchor row and shifts rows below", () => {
    const rows: HighlightedRow[] = [pairedRow(1, 1), pairedRow(2, 2), pairedRow(3, 3)]
    const c = makeComment("c1", 2)
    const layout = computeDiffLayout({
      rows,
      commentsByAnchorLine: new Map([[2, [c]]]),
      commentHeights: new Map([["c1", 50]]),
      rowHeightPx: ROW_PX,
    })
    // row(0) → row(20) → spacer(40, 50) → row(90)
    expect(layout.slots).toEqual([
      { kind: "row", rowIndex: 0, topPx: 0, heightPx: 20 },
      { kind: "row", rowIndex: 1, topPx: 20, heightPx: 20 },
      { kind: "commentSpacer", commentId: "c1", topPx: 40, heightPx: 50 },
      { kind: "row", rowIndex: 2, topPx: 90, heightPx: 20 },
    ])
    expect(layout.commentOverlays).toEqual([{ commentId: "c1", topPx: 40 }])
    expect(layout.totalHeightPx).toBe(110)
  })

  it("stacks multiple comments on the same line", () => {
    const rows: HighlightedRow[] = [pairedRow(1, 1), pairedRow(2, 2)]
    const c1 = makeComment("c1", 1)
    const c2 = makeComment("c2", 1)
    const layout = computeDiffLayout({
      rows,
      commentsByAnchorLine: new Map([[1, [c1, c2]]]),
      commentHeights: new Map([
        ["c1", 30],
        ["c2", 40],
      ]),
      rowHeightPx: ROW_PX,
    })
    expect(layout.slots).toEqual([
      { kind: "row", rowIndex: 0, topPx: 0, heightPx: 20 },
      { kind: "commentSpacer", commentId: "c1", topPx: 20, heightPx: 30 },
      { kind: "commentSpacer", commentId: "c2", topPx: 50, heightPx: 40 },
      { kind: "row", rowIndex: 1, topPx: 90, heightPx: 20 },
    ])
    expect(layout.commentOverlays).toEqual([
      { commentId: "c1", topPx: 20 },
      { commentId: "c2", topPx: 50 },
    ])
  })

  it("treats missing measured heights as 0 (first-frame behavior)", () => {
    const rows: HighlightedRow[] = [pairedRow(1, 1), pairedRow(2, 2)]
    const c = makeComment("c1", 1)
    const layout = computeDiffLayout({
      rows,
      commentsByAnchorLine: new Map([[1, [c]]]),
      commentHeights: new Map(),
      rowHeightPx: ROW_PX,
    })
    expect(layout.slots).toEqual([
      { kind: "row", rowIndex: 0, topPx: 0, heightPx: 20 },
      { kind: "commentSpacer", commentId: "c1", topPx: 20, heightPx: 0 },
      { kind: "row", rowIndex: 1, topPx: 20, heightPx: 20 },
    ])
    expect(layout.commentOverlays).toEqual([{ commentId: "c1", topPx: 20 }])
  })

  it("propagates comment shift into subsequent collapsed bar position", () => {
    const rows: HighlightedRow[] = [pairedRow(1, 1), collapsedRow(0, 5, 2)]
    const c = makeComment("c1", 1)
    const layout = computeDiffLayout({
      rows,
      commentsByAnchorLine: new Map([[1, [c]]]),
      commentHeights: new Map([["c1", 60]]),
      rowHeightPx: ROW_PX,
    })
    // row(0,20) → spacer(20,60) → collapsed(80, 60)  [1+2 sticky lines × 20]
    expect(layout.collapsedBars).toEqual([
      {
        regionIndex: 0,
        topPx: 80,
        heightPx: 60,
        count: 5,
        stickyLines: rows[1]?.kind === "collapsed" ? rows[1].stickyLines : [],
      },
    ])
    expect(layout.totalHeightPx).toBe(140)
  })

  it("uses the right-side line number as the anchor for multi-line ranges via commentAnchorLine", () => {
    expect(commentAnchorLine(7, 3)).toBe(7)
    expect(commentAnchorLine(null, 3)).toBe(3)
  })

  it("does not emit anything for an unmatched anchor line (e.g. inside a collapsed region)", () => {
    const rows: HighlightedRow[] = [pairedRow(1, 1), collapsedRow(0, 5)]
    const c = makeComment("c1", 99)
    const layout = computeDiffLayout({
      rows,
      commentsByAnchorLine: new Map([[99, [c]]]),
      commentHeights: new Map([["c1", 50]]),
      rowHeightPx: ROW_PX,
    })
    expect(layout.commentOverlays).toEqual([])
    expect(layout.slots.some((s) => s.kind === "commentSpacer")).toBe(false)
  })
})
