import type { Comment, ProjectionResult } from "@/lib/types"

/** A comment is sendable iff its workdir projection has resolved as `located`. */
// woke2 impl CFE-ST1
export function isSendable(p: ProjectionResult | null | undefined): boolean {
  return p?.kind === "located"
}

/**
 * Whether a newly added comment should land pre-staged. Returns true when:
 *   - there are no sendable comments yet (first comment in the session), or
 *   - every existing sendable comment is already staged (preserves "select all").
 */
// woke2 impl CFE-ST2
export function shouldAutoStageNew(
  prevComments: Comment[],
  workdirProjections: Map<string, ProjectionResult>,
  staged: ReadonlySet<string>,
): boolean {
  const sendableIds = prevComments
    .map((c) => c.id)
    .filter((id) => isSendable(workdirProjections.get(id)))
  return sendableIds.length === 0 || sendableIds.every((id) => staged.has(id))
}

/**
 * Drops staged ids whose comment is gone or whose workdir projection resolved
 * to not-sendable. Pending (null) projections are left alone — they may resolve
 * to located. Returns the previous reference unchanged when nothing dropped, so
 * callers can short-circuit re-renders cheaply.
 */
// woke2 impl CFE-ST3, CFE-ST4, CFE-ST5
export function reconcileStaged(
  staged: ReadonlySet<string>,
  comments: Comment[],
  workdirProjections: Map<string, ProjectionResult>,
): Set<string> {
  if (staged.size === 0) return staged as Set<string>
  const ids = new Set(comments.map((c) => c.id))
  let changed = false
  const next = new Set(staged)
  for (const id of staged) {
    if (!ids.has(id)) {
      next.delete(id)
      changed = true
      continue
    }
    const proj = workdirProjections.get(id)
    if (proj && !isSendable(proj)) {
      next.delete(id)
      changed = true
    }
  }
  return changed ? next : (staged as Set<string>)
}

/** Set of every sendable comment id (use as the "select all" target). */
// woke2 impl CFE-ST6
export function allSendableIds(
  comments: Comment[],
  workdirProjections: Map<string, ProjectionResult>,
): Set<string> {
  const next = new Set<string>()
  for (const c of comments) {
    if (isSendable(workdirProjections.get(c.id))) next.add(c.id)
  }
  return next
}
