import type { ProjectionResult } from "@/lib/types"

/** Render `:N` for a single line or `:A–B` for a range. */
export function rangeLabel(start: number, end: number | null): string {
  return end === null ? `:${start.toString()}` : `:${start.toString()}–${end.toString()}`
}

/**
 * Suffix shown after the original `path:range` to surface a renamed location
 * in the current view. Returns an empty string when no remapping is meaningful
 * (no projection yet, orphaned, or the file path didn't change).
 */
export function projectedSuffix(projection: ProjectionResult | null): string {
  if (!projection || projection.kind !== "located") return ""
  if (projection.path === null) return ""
  return ` → ${projection.path}${rangeLabel(projection.start, projection.end)}`
}

export function isOrphaned(projection: ProjectionResult | null): boolean {
  return projection?.kind === "orphaned"
}
