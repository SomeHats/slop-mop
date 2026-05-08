import { describe, expect, test } from "vitest"
import { computeStickyLines, type SideBySideRow } from "./compute-diff-rows"

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

  test("keeps every opener when hidden region runs to EOF", () => {
    // Hidden region with no visible rows after it: nothing constrains the
    // boundary, so every opener stays sticky.
    const rows: SideBySideRow[] = [
      ctx("describe('outer', () => {", 1),
      ctx("    test('inner', () => {", 2),
    ]

    const sticky = computeStickyLines(rows, 0, 2)

    expect(sticky).toEqual([
      { content: "describe('outer', () => {", lineNo: 1, offsetFromTop: 0 },
      { content: "    test('inner', () => {", lineNo: 2, offsetFromTop: 1 },
    ])
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
