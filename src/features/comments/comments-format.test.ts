import { describe, expect, it } from "vitest"
import type { Comment, ProjectionResult } from "@/lib/types"
import { displayLocation, isOrphaned, rangeLabel } from "./comments-format"

const baseComment: Comment = {
  id: "c1",
  session_id: "s1",
  commit_hash: "abcdef1234567890",
  file_path: "src/old.ts",
  range_start: 5,
  range_end: 9,
  contents: "review me",
  created_at: "2026-05-02T00:00:00Z",
}

// woke2 test CFE-FM1, CFE-FM4
describe("rangeLabel", () => {
  it("formats a single line as `:N`", () => {
    expect(rangeLabel(7, null)).toBe(":7")
  })

  it("formats a range as `:A–B` with an en-dash", () => {
    expect(rangeLabel(3, 8)).toBe(":3–8")
  })
})

// woke2 test CFE-FM2, CFE-FM3, CFE-FM4
describe("displayLocation", () => {
  it("falls back to anchor coords while projection is unresolved", () => {
    expect(displayLocation(baseComment, null)).toBe("src/old.ts:5–9")
  })

  it("falls back to anchor coords for orphaned projections", () => {
    const proj: ProjectionResult = { kind: "orphaned", reason: "line_deleted" }
    expect(displayLocation(baseComment, proj)).toBe("src/old.ts:5–9")
  })

  it("uses projected line numbers when located in same file", () => {
    const proj: ProjectionResult = { kind: "located", path: null, start: 8, end: 12 }
    expect(displayLocation(baseComment, proj)).toBe("src/old.ts:8–12")
  })

  it("uses projected path + lines when the file was renamed", () => {
    const proj: ProjectionResult = { kind: "located", path: "src/new.ts", start: 8, end: 12 }
    expect(displayLocation(baseComment, proj)).toBe("src/new.ts:8–12")
  })

  it("collapses single-line projection back to `:N`", () => {
    const single: Comment = { ...baseComment, range_end: null }
    const proj: ProjectionResult = { kind: "located", path: null, start: 8, end: null }
    expect(displayLocation(single, proj)).toBe("src/old.ts:8")
  })
})

// woke2 test CFE-FM5
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
