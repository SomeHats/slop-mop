import { describe, expect, test } from "vitest"
import { computeSmartBottom, computeStickyLines, type SideBySideRow } from "./compute-diff-rows"

function ctx(content: string, lineNo: number): SideBySideRow {
  return {
    kind: "paired",
    left: { lineNo, content, type: "context" },
    right: { lineNo, content, type: "context" },
  }
}

function add(content: string, lineNo: number): SideBySideRow {
  return {
    kind: "paired",
    left: null,
    right: { lineNo, content, type: "addition" },
  }
}

// woke2 test DV-SC2, DV-SC3, DV-SC4, DV-SC5
describe("computeStickyLines", () => {
  test("keeps enclosing opener when next visible line is at deeper indent", () => {
    // Hidden:
    //   describe('something', () => {        indent 0
    //     test('bar', () => {                 indent 4
    // Visible (boundary):
    //         x;                              indent 8
    const rows: SideBySideRow[] = [
      ctx("describe('something', () => {", 1),
      ctx("    test('bar', () => {", 2),
      ctx("        x;", 3),
      ctx("        y;", 4),
      ctx("        z;", 5),
      add("        1;", 6),
    ]

    const sticky = computeStickyLines(rows, 0, 2)

    expect(sticky).toEqual([
      { content: "describe('something', () => {", lineNo: 1, offsetFromTop: 0 },
      { content: "    test('bar', () => {", lineNo: 2, offsetFromTop: 1 },
    ])
  })

  test("drops sibling-indent entry when next visible line is at same indent", () => {
    // Hidden:
    //   describe(...) {            indent 0
    //     test('a', () => {});     indent 4   ← closed, sibling of next visible
    // Visible:
    //     test('b', () => {        indent 4
    const rows: SideBySideRow[] = [
      ctx("describe('outer', () => {", 1),
      ctx("    test('a', () => {});", 2),
      ctx("    test('b', () => {", 3),
      add("        body;", 4),
    ]

    const sticky = computeStickyLines(rows, 0, 2)

    expect(sticky).toEqual([{ content: "describe('outer', () => {", lineNo: 1, offsetFromTop: 0 }])
  })

  test("returns nothing when hidden region runs to EOF", () => {
    // Sticky context is meant to anchor what's *below* the collapse — when
    // there's no visible row after the hidden region there's nothing for it
    // to be context for, so we suppress it entirely.
    const rows: SideBySideRow[] = [
      ctx("describe('outer', () => {", 1),
      ctx("    test('inner', () => {", 2),
    ]

    const sticky = computeStickyLines(rows, 0, 2)

    expect(sticky).toEqual([])
  })

  test("pops closed scopes inside the hidden region", () => {
    // describe(...) {              indent 0
    //   test('a', () => {});       indent 2  ← closes immediately (semicolon)
    //   test('b', () => {          indent 2  ← supersedes 'a' (same indent)
    // Visible:
    //     body;                    indent 4
    const rows: SideBySideRow[] = [
      ctx("describe('outer', () => {", 1),
      ctx("  test('a', () => {});", 2),
      ctx("  test('b', () => {", 3),
      add("    body;", 4),
    ]

    const sticky = computeStickyLines(rows, 0, 3)

    expect(sticky).toEqual([
      { content: "describe('outer', () => {", lineNo: 1, offsetFromTop: 0 },
      { content: "  test('b', () => {", lineNo: 3, offsetFromTop: 2 },
    ])
  })

  test("skips blank lines when scanning the boundary", () => {
    // Hidden:
    //   describe(...) {     indent 0
    //     test(...) {       indent 4
    // Visible:
    //   ""                  blank — skipped
    //         body;         indent 8
    const rows: SideBySideRow[] = [
      ctx("describe('outer', () => {", 1),
      ctx("    test('inner', () => {", 2),
      ctx("", 3),
      add("        body;", 4),
    ]

    const sticky = computeStickyLines(rows, 0, 2)

    expect(sticky).toEqual([
      { content: "describe('outer', () => {", lineNo: 1, offsetFromTop: 0 },
      { content: "    test('inner', () => {", lineNo: 2, offsetFromTop: 1 },
    ])
  })

  test("skips blank lines inside the hidden region", () => {
    // Blank lines inside the hidden span don't perturb the indent stack.
    const rows: SideBySideRow[] = [
      ctx("describe('outer', () => {", 1),
      ctx("", 2),
      ctx("    test('inner', () => {", 3),
      add("        body;", 4),
    ]

    const sticky = computeStickyLines(rows, 0, 3)

    expect(sticky).toEqual([
      { content: "describe('outer', () => {", lineNo: 1, offsetFromTop: 0 },
      { content: "    test('inner', () => {", lineNo: 3, offsetFromTop: 2 },
    ])
  })

  test("treats tabs as 4 spaces of indent", () => {
    // Tab-indented opener with space-indented children. Boundary at indent 8
    // (tab + 4 spaces) keeps tab-only opener.
    const rows: SideBySideRow[] = [
      ctx("describe('outer', () => {", 1),
      ctx("\ttest('inner', () => {", 2),
      add("\t    body;", 3),
    ]

    const sticky = computeStickyLines(rows, 0, 2)

    expect(sticky).toEqual([
      { content: "describe('outer', () => {", lineNo: 1, offsetFromTop: 0 },
      { content: "\ttest('inner', () => {", lineNo: 2, offsetFromTop: 1 },
    ])
  })

  test("returns empty for empty hidden region", () => {
    const rows: SideBySideRow[] = [add("body;", 1)]
    expect(computeStickyLines(rows, 0, 0)).toEqual([])
  })
})

// woke2 test DV-SB1
describe("computeSmartBottom", () => {
  test("returns maxLines when no indent boundary in candidate window", () => {
    // All lines at the same indent level — no decreases — so smart-bottom
    // can't trim anything and falls back to the full maxLines.
    const rows: SideBySideRow[] = [
      ctx("    a", 1),
      ctx("    b", 2),
      ctx("    c", 3),
      ctx("    d", 4),
      ctx("    e", 5),
      ctx("    f", 6),
    ]
    expect(computeSmartBottom(rows, 0, 6, 3)).toBe(3)
  })

  test("returns maxLines for monotonically increasing indent", () => {
    // Indent only ever increases, so there's no closing-brace-style boundary
    // for the heuristic to latch onto — fallback to maxLines.
    const rows: SideBySideRow[] = [
      ctx("a", 1),
      ctx("  a", 2),
      ctx("    a", 3),
      ctx("      a", 4),
      ctx("        a", 5),
    ]
    expect(computeSmartBottom(rows, 0, 5, 3)).toBe(3)
  })

  test("trims when an indent decrease appears in the candidate window", () => {
    // Indent decreases on the last line — smart-bottom keeps only what's
    // after the boundary (1 visible line).
    const rows: SideBySideRow[] = [
      ctx("    a", 1),
      ctx("    b", 2),
      ctx("    c", 3),
      ctx("    d", 4),
      ctx("    e", 5),
      ctx("}", 6),
    ]
    // With maxLines=3 the candidate is rows[3..6]; the dedent at row 6 is the
    // boundary, so visible = runEnd - boundaryIdx - 1 = 6 - 5 - 1 = 0 → clamped
    // to 1.
    expect(computeSmartBottom(rows, 0, 6, 3)).toBe(1)
  })
})
