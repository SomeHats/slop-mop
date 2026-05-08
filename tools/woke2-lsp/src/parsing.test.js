// @ts-check

const { describe, it } = require("node:test")
const assert = require("node:assert/strict")
const { extractDefinitions, extractPragmas, idAtPosition } = require("./parsing.js")

// woke2 test LSP-IX4
describe("extractDefinitions", () => {
  it("extracts heading definitions", () => {
    const content = "## !DRG Drag and drop"
    const defs = extractDefinitions(content, "test.spec.md")
    assert.equal(defs.length, 1)
    assert.equal(defs[0].id, "DRG")
    assert.equal(defs[0].line, 0)
    assert.equal(defs[0].text, "## !DRG Drag and drop")
  })

  it("extracts list item definitions", () => {
    const content = "- !SKL-2 When it goes red it should flash"
    const defs = extractDefinitions(content, "test.spec.md")
    assert.equal(defs.length, 1)
    assert.equal(defs[0].id, "SKL-2")
    assert.equal(defs[0].line, 0)
  })

  it("extracts multi-segment IDs", () => {
    const content = "- !DRG-1-3 Nested behavior"
    const defs = extractDefinitions(content, "test.spec.md")
    assert.equal(defs.length, 1)
    assert.equal(defs[0].id, "DRG-1-3")
  })

  it("extracts multiple definitions across lines", () => {
    const content = ["## !DRG Drag", "", "- !DRG-1 Start", "- !DRG-2 Drop"].join("\n")
    const defs = extractDefinitions(content, "test.spec.md")
    assert.equal(defs.length, 3)
    assert.deepEqual(
      defs.map((d) => d.id),
      ["DRG", "DRG-1", "DRG-2"],
    )
    assert.deepEqual(
      defs.map((d) => d.line),
      [0, 2, 3],
    )
  })

  it("skips definitions inside fenced code blocks", () => {
    const content = [
      "- !REAL Real behavior",
      "```markdown",
      "- !FAKE Not a behavior",
      "```",
      "- !ALSO-REAL Also real",
    ].join("\n")
    const defs = extractDefinitions(content, "test.spec.md")
    assert.equal(defs.length, 2)
    assert.deepEqual(
      defs.map((d) => d.id),
      ["REAL", "ALSO-REAL"],
    )
  })

  it("handles nested fenced blocks (toggle on/off)", () => {
    const content = [
      "```",
      "- !SKIP1 inside block",
      "```",
      "- !KEEP between blocks",
      "```",
      "- !SKIP2 inside second block",
      "```",
    ].join("\n")
    const defs = extractDefinitions(content, "test.spec.md")
    assert.equal(defs.length, 1)
    assert.equal(defs[0].id, "KEEP")
  })

  it("preserves file path in results", () => {
    const defs = extractDefinitions("- !X Test", "specs/my.spec.md")
    assert.equal(defs[0].file, "specs/my.spec.md")
  })

  it("ignores plain headings without !ID", () => {
    const content = "## Delta model\n- !D1 A behavior"
    const defs = extractDefinitions(content, "test.spec.md")
    assert.equal(defs.length, 1)
    assert.equal(defs[0].id, "D1")
  })

  it("handles heading levels 2-6", () => {
    const content = ["## !H2 Level 2", "### !H3 Level 3", "###### !H6 Level 6"].join("\n")
    const defs = extractDefinitions(content, "test.spec.md")
    assert.equal(defs.length, 3)
  })

  it("does not match h1 headings", () => {
    const content = "# !NOPE Top-level heading"
    const defs = extractDefinitions(content, "test.spec.md")
    assert.equal(defs.length, 0)
  })
})

// woke2 test LSP-HV2
describe("idAtPosition", () => {
  it("matches ID on a pragma line", () => {
    const line = "// woke2 impl DRG-1"
    const result = idAtPosition(line, line.indexOf("DRG-1") + 2)
    assert.deepEqual(result, {
      id: "DRG-1",
      col: line.indexOf("DRG-1"),
      endCol: line.indexOf("DRG-1") + 5,
    })
  })

  it("matches multi-segment ID on a pragma line", () => {
    const line = "// woke2 test FOO-BAR-3"
    const result = idAtPosition(line, line.indexOf("FOO-BAR-3"))
    assert.equal(result?.id, "FOO-BAR-3")
  })

  it("matches second ID in comma-separated pragma", () => {
    const line = "// woke2 impl A-1, B-2"
    const result = idAtPosition(line, line.indexOf("B-2") + 1)
    assert.equal(result?.id, "B-2")
  })

  it("returns undefined for non-ID position on pragma line", () => {
    const line = "// woke2 impl DRG-1"
    assert.equal(idAtPosition(line, 0), undefined)
    assert.equal(idAtPosition(line, 3), undefined)
  })

  it("does not match arbitrary words on non-pragma lines", () => {
    assert.equal(idAtPosition("const foo = 1;", 6), undefined)
    assert.equal(idAtPosition("function DRG() {}", 9), undefined)
  })

  it("matches !ID in spec definitions", () => {
    const line = "- !SKL-2 When it goes red"
    const result = idAtPosition(line, line.indexOf("SKL-2"))
    assert.equal(result?.id, "SKL-2")
  })

  it("matches !ID when cursor is on the bang character", () => {
    const line = "## !DRG Drag and drop"
    const result = idAtPosition(line, line.indexOf("!"))
    assert.equal(result?.id, "DRG")
  })

  it("returns correct col/endCol for !ID (excludes bang)", () => {
    const line = "- !FOO-1 Description"
    const result = idAtPosition(line, line.indexOf("FOO-1"))
    assert.equal(result?.col, line.indexOf("FOO-1"))
    assert.equal(result?.endCol, line.indexOf("FOO-1") + 5)
  })

  it("returns undefined for plain text without ! or pragma", () => {
    assert.equal(idAtPosition("Some random text", 5), undefined)
    assert.equal(idAtPosition("## Heading without ID", 3), undefined)
  })

  it("matches single-segment ID on pragma line", () => {
    const line = "// woke2 impl DRG"
    const result = idAtPosition(line, line.indexOf("DRG"))
    assert.equal(result?.id, "DRG")
  })
})

// woke2 test LSP-IX5
describe("extractPragmas", () => {
  it("extracts single impl pragma", () => {
    const content = "// woke2 impl DRG-1"
    const refs = extractPragmas(content, "src/drag.ts")
    assert.equal(refs.length, 1)
    assert.equal(refs[0].id, "DRG-1")
    assert.equal(refs[0].kind, "impl")
    assert.equal(refs[0].line, 0)
    assert.equal(refs[0].file, "src/drag.ts")
  })

  it("extracts test pragma", () => {
    const content = "// woke2 test DRG-1"
    const refs = extractPragmas(content, "test.ts")
    assert.equal(refs.length, 1)
    assert.equal(refs[0].kind, "test")
  })

  it("extracts multiple IDs from one pragma (comma-separated)", () => {
    const content = "// woke2 impl DRG-1, DRG-2"
    const refs = extractPragmas(content, "src/drag.ts")
    assert.equal(refs.length, 2)
    assert.deepEqual(
      refs.map((r) => r.id),
      ["DRG-1", "DRG-2"],
    )
  })

  it("extracts multiple IDs from one pragma (space-separated)", () => {
    const content = "// woke2 impl DRG-1 DRG-2"
    const refs = extractPragmas(content, "src/drag.ts")
    assert.equal(refs.length, 2)
    assert.deepEqual(
      refs.map((r) => r.id),
      ["DRG-1", "DRG-2"],
    )
  })

  it("computes correct column positions", () => {
    const content = "// woke2 impl FOO-1"
    const refs = extractPragmas(content, "test.ts")
    assert.equal(refs[0].col, content.indexOf("FOO-1"))
    assert.equal(refs[0].endCol, content.indexOf("FOO-1") + "FOO-1".length)
  })

  it("handles hash comment prefix", () => {
    const content = "# woke2 impl PY-1"
    const refs = extractPragmas(content, "script.py")
    assert.equal(refs.length, 1)
    assert.equal(refs[0].id, "PY-1")
  })

  it("handles block comment prefix", () => {
    const content = "/* woke2 impl C-1 */"
    const refs = extractPragmas(content, "main.c")
    assert.equal(refs.length, 1)
    assert.equal(refs[0].id, "C-1")
  })

  it("handles leading whitespace", () => {
    const content = "    // woke2 impl INDENTED-1"
    const refs = extractPragmas(content, "test.ts")
    assert.equal(refs.length, 1)
    assert.equal(refs[0].id, "INDENTED-1")
  })

  it("extracts single-segment IDs", () => {
    const content = "// woke2 impl DRG"
    const refs = extractPragmas(content, "test.ts")
    assert.equal(refs.length, 1)
    assert.equal(refs[0].id, "DRG")
  })

  it("ignores non-pragma lines", () => {
    const content = ["const x = 1;", "// woke2 impl FOO-1", "function foo() {}"].join("\n")
    const refs = extractPragmas(content, "test.ts")
    assert.equal(refs.length, 1)
    assert.equal(refs[0].line, 1)
  })

  it("extracts from multiple pragma lines", () => {
    const content = ["// woke2 impl A-1", "fn a() {}", "// woke2 test B-1"].join("\n")
    const refs = extractPragmas(content, "test.rs")
    assert.equal(refs.length, 2)
    assert.equal(refs[0].id, "A-1")
    assert.equal(refs[0].kind, "impl")
    assert.equal(refs[1].id, "B-1")
    assert.equal(refs[1].kind, "test")
  })
})
