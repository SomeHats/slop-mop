import { describe, expect, test } from "vitest"
import type { Comment, ProjectionResult } from "@/lib/types"
import {
  commentForSubmit,
  formatCommentsForSubmit,
  type SubmittableComment,
} from "./submit-comments"
import type { CommentWithProjection } from "./use-session-comments"

function comment(over: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    session_id: "s1",
    commit_hash: "deadbeef",
    file_path: "src/foo.ts",
    range_start: 10,
    range_end: null,
    contents: "fix this",
    created_at: "2026-05-05T00:00:00Z",
    ...over,
  }
}

function withProjection(
  c: Comment,
  projection: ProjectionResult | null,
  sessionProjection: ProjectionResult | null,
): CommentWithProjection {
  return { comment: c, projection, sessionProjection }
}

describe("formatCommentsForSubmit", () => {
  test("empty input → empty string", () => {
    expect(formatCommentsForSubmit([])).toBe("")
  })

  test("single-line comment", () => {
    const items: SubmittableComment[] = [
      { filePath: "src/foo.ts", start: 42, end: null, contents: "fix this" },
    ]
    expect(formatCommentsForSubmit(items)).toBe("### src/foo.ts:42\nfix this")
  })

  test("range comment uses ASCII hyphen", () => {
    const items: SubmittableComment[] = [
      { filePath: "src/foo.ts", start: 42, end: 50, contents: "this block" },
    ]
    expect(formatCommentsForSubmit(items)).toBe("### src/foo.ts:42-50\nthis block")
  })

  test("multiple comments separated by blank line", () => {
    const items: SubmittableComment[] = [
      { filePath: "src/a.ts", start: 1, end: null, contents: "one" },
      { filePath: "src/b.ts", start: 5, end: 10, contents: "two\nliner" },
    ]
    expect(formatCommentsForSubmit(items)).toBe(
      "### src/a.ts:1\none\n\n### src/b.ts:5-10\ntwo\nliner",
    )
  })
})

describe("commentForSubmit", () => {
  test("returns null when projection is null (still pending)", () => {
    expect(commentForSubmit(withProjection(comment(), null, null))).toBeNull()
  })

  test("returns null when workdir projection is orphaned", () => {
    const sp: ProjectionResult = { kind: "orphaned", reason: "line_deleted" }
    expect(commentForSubmit(withProjection(comment(), null, sp))).toBeNull()
  })

  test("uses workdir-projected start/end and original path when not renamed", () => {
    const sp: ProjectionResult = { kind: "located", path: null, start: 8, end: 12 }
    expect(commentForSubmit(withProjection(comment(), null, sp))).toEqual({
      filePath: "src/foo.ts",
      start: 8,
      end: 12,
      contents: "fix this",
    })
  })

  test("uses projected path on rename", () => {
    const sp: ProjectionResult = { kind: "located", path: "src/renamed.ts", start: 8, end: null }
    expect(commentForSubmit(withProjection(comment(), null, sp))).toEqual({
      filePath: "src/renamed.ts",
      start: 8,
      end: null,
      contents: "fix this",
    })
  })

  test("ignores diff-view projection — only sessionProjection drives the result", () => {
    // diff-view projection says orphaned, but workdir says located → we send.
    const proj: ProjectionResult = { kind: "orphaned", reason: "line_deleted" }
    const sp: ProjectionResult = { kind: "located", path: null, start: 1, end: null }
    expect(commentForSubmit(withProjection(comment(), proj, sp))?.start).toBe(1)
  })
})
