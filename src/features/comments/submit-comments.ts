import type { CommentWithProjection } from "./use-session-comments"

export type SubmittableComment = {
  /** Workdir-projected file path (handles renames). */
  filePath: string
  start: number
  end: number | null
  contents: string
}

/**
 * Pulls the workdir-projected coords off a comment so it can be sent to the
 * agent. Returns null when the comment has no live workdir position
 * (orphaned, file deleted, projection still pending). The staging UI already
 * filters these out, so a non-null result is the expected case.
 */
// woke2 impl CFE-SM1, CFE-SM2, CFE-SM3
export function commentForSubmit(c: CommentWithProjection): SubmittableComment | null {
  if (c.sessionProjection?.kind !== "located") return null
  return {
    filePath: c.sessionProjection.path ?? c.comment.file_path,
    start: c.sessionProjection.start,
    end: c.sessionProjection.end,
    contents: c.comment.contents,
  }
}

// woke2 impl CFE-SM4
function rangeLabel(start: number, end: number | null): string {
  // ASCII hyphen on purpose — this is going into a model prompt, not the UI
  // (where we use an em dash via comments-format#rangeLabel).
  return end === null ? start.toString() : `${start.toString()}-${end.toString()}`
}

/**
 * Render the staged comments as a single prompt string. Each comment is a
 * `### path:lines` heading followed by the body, separated from neighbors by
 * a blank line. Empty input → empty string.
 */
// woke2 impl CFE-SM5, CFE-SM6
export function formatCommentsForSubmit(items: SubmittableComment[]): string {
  return items
    .map((it) => `### ${it.filePath}:${rangeLabel(it.start, it.end)}\n${it.contents}`)
    .join("\n\n")
}
