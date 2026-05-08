import type { Comment, ProjectionResult } from "@/lib/types"

/** Render `:N` for a single line or `:A–B` for a range. */
// woke2 impl CFE-FM1, CFE-FM4
export function rangeLabel(start: number, end: number | null): string {
  return end === null ? `:${start.toString()}` : `:${start.toString()}–${end.toString()}`
}

/**
 * The location to display for a comment in the current view. When the
 * projection has resolved we show the projected position (and renamed path,
 * when applicable). Until it resolves we fall back to the anchor coordinates
 * so the row is never blank.
 */
// woke2 impl CFE-FM2, CFE-FM3
export function displayLocation(comment: Comment, projection: ProjectionResult | null): string {
  if (projection?.kind === "located") {
    const path = projection.path ?? comment.file_path
    return `${path}${rangeLabel(projection.start, projection.end)}`
  }
  return `${comment.file_path}${rangeLabel(comment.range_start, comment.range_end)}`
}

// woke2 impl CFE-FM5
export function isOrphaned(projection: ProjectionResult | null): boolean {
  return projection?.kind === "orphaned"
}
