import type { Comment, ProjectionResult } from "@/lib/types"

/** Render `:N` for a single line or `:A–B` for a range. */
export function rangeLabel(start: number, end: number | null): string {
  return end === null ? `:${start.toString()}` : `:${start.toString()}–${end.toString()}`
}

/**
 * The location to display for a comment in the current view. When the
 * projection has resolved we show the projected position (and renamed path,
 * when applicable). Until it resolves we fall back to the anchor coordinates
 * so the row is never blank.
 */
export function displayLocation(comment: Comment, projection: ProjectionResult | null): string {
  if (projection?.kind === "located") {
    const path = projection.path ?? comment.file_path
    return `${path}${rangeLabel(projection.start, projection.end)}`
  }
  return `${comment.file_path}${rangeLabel(comment.range_start, comment.range_end)}`
}

export function isOrphaned(projection: ProjectionResult | null): boolean {
  return projection?.kind === "orphaned"
}
