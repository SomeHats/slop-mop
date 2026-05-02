import { describe, expect, it } from "vitest"
import type { ProjectionResult } from "@/lib/types"
import { isOrphaned, projectedSuffix, rangeLabel } from "./comments-format"

describe("rangeLabel", () => {
  it("formats a single line as `:N`", () => {
    expect(rangeLabel(7, null)).toBe(":7")
  })

  it("formats a range as `:A–B` with an en-dash", () => {
    expect(rangeLabel(3, 8)).toBe(":3–8")
  })
})

describe("projectedSuffix", () => {
  it("returns empty when no projection has resolved yet", () => {
    expect(projectedSuffix(null)).toBe("")
  })

  it("returns empty for orphaned projections", () => {
    const result: ProjectionResult = { kind: "orphaned", reason: "line_deleted" }
    expect(projectedSuffix(result)).toBe("")
  })

  it("returns empty when located but path is unchanged (no rename)", () => {
    const result: ProjectionResult = { kind: "located", path: null, start: 5, end: null }
    expect(projectedSuffix(result)).toBe("")
  })

  it("renders the new path + range when the file was renamed", () => {
    const result: ProjectionResult = {
      kind: "located",
      path: "src/new.ts",
      start: 5,
      end: 9,
    }
    expect(projectedSuffix(result)).toBe(" → src/new.ts:5–9")
  })

  it("renders the new path + single-line range on rename", () => {
    const result: ProjectionResult = {
      kind: "located",
      path: "src/new.ts",
      start: 5,
      end: null,
    }
    expect(projectedSuffix(result)).toBe(" → src/new.ts:5")
  })
})

describe("isOrphaned", () => {
  it("is false for null and located projections", () => {
    expect(isOrphaned(null)).toBe(false)
    expect(isOrphaned({ kind: "located", path: null, start: 1, end: null })).toBe(false)
  })

  it("is true for orphaned projections", () => {
    expect(isOrphaned({ kind: "orphaned", reason: "file_deleted" })).toBe(true)
    expect(isOrphaned({ kind: "orphaned", reason: "line_deleted" })).toBe(true)
  })
})
