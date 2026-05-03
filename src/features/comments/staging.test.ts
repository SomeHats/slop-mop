import { describe, expect, test } from "vitest"
import type { Comment, ProjectionResult } from "@/lib/types"
import { allSendableIds, isSendable, reconcileStaged, shouldAutoStageNew } from "./staging"

function comment(id: string): Comment {
  return {
    id,
    session_id: "s1",
    commit_hash: "deadbeef",
    file_path: "src/x.ts",
    range_start: 1,
    range_end: null,
    contents: "c",
    created_at: "2026-05-03T00:00:00Z",
  }
}

function located(): ProjectionResult {
  return { kind: "located", path: null, start: 1, end: null }
}

function orphaned(): ProjectionResult {
  return { kind: "orphaned", reason: "line_deleted" }
}

describe("isSendable", () => {
  test("located → true; orphaned/null → false", () => {
    expect(isSendable(located())).toBe(true)
    expect(isSendable(orphaned())).toBe(false)
    expect(isSendable(null)).toBe(false)
    expect(isSendable(undefined)).toBe(false)
  })
})

describe("shouldAutoStageNew", () => {
  test("first comment in the session → stage", () => {
    expect(shouldAutoStageNew([], new Map(), new Set())).toBe(true)
  })

  test("every sendable comment was staged → stage", () => {
    const prev = [comment("a"), comment("b")]
    const proj = new Map<string, ProjectionResult>([
      ["a", located()],
      ["b", located()],
    ])
    expect(shouldAutoStageNew(prev, proj, new Set(["a", "b"]))).toBe(true)
  })

  test("a sendable comment was unstaged → do not stage", () => {
    const prev = [comment("a"), comment("b")]
    const proj = new Map<string, ProjectionResult>([
      ["a", located()],
      ["b", located()],
    ])
    expect(shouldAutoStageNew(prev, proj, new Set(["a"]))).toBe(false)
  })

  test("only non-sendable comments exist → stage", () => {
    // The "no sendable comments" predicate fires regardless of pre-existing
    // ones, so the new tick gets the all-checked default.
    const prev = [comment("a"), comment("b")]
    const proj = new Map<string, ProjectionResult>([
      ["a", orphaned()],
      ["b", null as unknown as ProjectionResult], // pending
    ])
    expect(shouldAutoStageNew(prev, proj, new Set())).toBe(true)
  })

  test("ignores non-sendable when checking 'all staged'", () => {
    // Orphaned comment is not sendable, so it's not required to be staged.
    const prev = [comment("a"), comment("b")]
    const proj = new Map<string, ProjectionResult>([
      ["a", located()],
      ["b", orphaned()],
    ])
    expect(shouldAutoStageNew(prev, proj, new Set(["a"]))).toBe(true)
  })
})

describe("reconcileStaged", () => {
  test("returns same reference when nothing dropped", () => {
    const staged = new Set(["a"])
    const out = reconcileStaged(staged, [comment("a")], new Map([["a", located()]]))
    expect(out).toBe(staged)
  })

  test("drops ids whose comment is gone", () => {
    const staged = new Set(["a", "b"])
    const out = reconcileStaged(staged, [comment("a")], new Map([["a", located()]]))
    expect(out).not.toBe(staged)
    expect([...out]).toEqual(["a"])
  })

  test("drops ids whose workdir projection is orphaned", () => {
    const staged = new Set(["a", "b"])
    const out = reconcileStaged(
      staged,
      [comment("a"), comment("b")],
      new Map<string, ProjectionResult>([
        ["a", located()],
        ["b", orphaned()],
      ]),
    )
    expect([...out]).toEqual(["a"])
  })

  test("leaves staged ids whose projection is still pending (null)", () => {
    // A pending projection might still resolve to located. Dropping eagerly
    // would un-tick the new-comment auto-check before the workdir round-trip
    // returns.
    const staged = new Set(["a"])
    const out = reconcileStaged(staged, [comment("a")], new Map())
    expect(out).toBe(staged)
  })

  test("empty staged set is a no-op", () => {
    const staged = new Set<string>()
    const out = reconcileStaged(staged, [comment("a")], new Map())
    expect(out).toBe(staged)
  })
})

describe("allSendableIds", () => {
  test("returns only located comments", () => {
    const out = allSendableIds(
      [comment("a"), comment("b"), comment("c")],
      new Map<string, ProjectionResult>([
        ["a", located()],
        ["b", orphaned()],
        // c is pending (not in map) → not sendable
      ]),
    )
    expect([...out]).toEqual(["a"])
  })

  test("returns empty when no comments are sendable", () => {
    const out = allSendableIds(
      [comment("a")],
      new Map<string, ProjectionResult>([["a", orphaned()]]),
    )
    expect(out.size).toBe(0)
  })
})
