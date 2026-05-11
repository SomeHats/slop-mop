import { describe, expect, test } from "vitest"
import type { SideBySideRow } from "./compute-diff-rows"
import { reconstructOldNewLines } from "./use-highlighted-diff"

function paired(
  leftLine: number | null,
  leftContent: string | null,
  rightLine: number | null,
  rightContent: string | null,
): SideBySideRow {
  return {
    kind: "paired",
    left:
      leftLine === null || leftContent === null
        ? null
        : { lineNo: leftLine, content: leftContent, type: "context" },
    right:
      rightLine === null || rightContent === null
        ? null
        : { lineNo: rightLine, content: rightContent, type: "context" },
  }
}

// woke2 test DV-HL1
describe("reconstructOldNewLines", () => {
  test("collects every left/right side from paired rows", () => {
    const rows: SideBySideRow[] = [
      paired(1, "a", 1, "a"),
      paired(2, "b", 2, "b"),
      paired(3, "c", 3, "c"),
    ]
    const { oldLines, newLines } = reconstructOldNewLines(rows)
    expect(oldLines.map((l) => l.content)).toEqual(["a", "b", "c"])
    expect(newLines.map((l) => l.content)).toEqual(["a", "b", "c"])
  })

  test("keeps left-only and right-only rows on their respective sides", () => {
    // A pure-deletion row (left set, right null) and a pure-addition row
    // (left null, right set). Reconstruction must keep each side independent.
    const rows: SideBySideRow[] = [paired(1, "old", null, null), paired(null, null, 1, "new")]
    const { oldLines, newLines } = reconstructOldNewLines(rows)
    expect(oldLines).toEqual([{ lineNo: 1, content: "old" }])
    expect(newLines).toEqual([{ lineNo: 1, content: "new" }])
  })

  test("includes hidden lines that would appear inside a collapsed region", () => {
    // The point of running this against `allRows` (not visible rows) is so
    // the highlighter sees full context. Even rows that would be hidden by
    // collapseRows must contribute to the reconstructed text.
    const rows: SideBySideRow[] = []
    for (let i = 1; i <= 50; i++) {
      rows.push(paired(i, `line ${i}`, i, `line ${i}`))
    }
    const { oldLines, newLines } = reconstructOldNewLines(rows)
    expect(oldLines).toHaveLength(50)
    expect(newLines).toHaveLength(50)
    expect(oldLines[24]?.content).toBe("line 25")
  })

  test("skips collapsed-marker rows (no content to contribute)", () => {
    const rows: SideBySideRow[] = [
      paired(1, "a", 1, "a"),
      { kind: "collapsed", count: 5, regionIndex: 0, stickyLines: [] },
      paired(7, "g", 7, "g"),
    ]
    const { oldLines, newLines } = reconstructOldNewLines(rows)
    expect(oldLines.map((l) => l.lineNo)).toEqual([1, 7])
    expect(newLines.map((l) => l.lineNo)).toEqual([1, 7])
  })

  test("preserves line numbers (highlighter relies on them as the merge key)", () => {
    const rows: SideBySideRow[] = [paired(10, "x", 12, "y")]
    const { oldLines, newLines } = reconstructOldNewLines(rows)
    expect(oldLines).toEqual([{ lineNo: 10, content: "x" }])
    expect(newLines).toEqual([{ lineNo: 12, content: "y" }])
  })
})
