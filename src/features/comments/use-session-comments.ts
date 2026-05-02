import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as tauri from "@/lib/tauri"
import type { Comment, ProjectedComment, ProjectionResult, Selection } from "@/lib/types"

export type CommentWithProjection = {
  comment: Comment
  /** Null while projection is in flight or when no selection is active. */
  projection: ProjectionResult | null
}

export type UseSessionCommentsResult = {
  comments: CommentWithProjection[]
  add: (comment: Comment) => void
  remove: (id: string) => Promise<void>
  /** Resolve a comment id's currently-projected position, or null. */
  projectionFor: (id: string) => ProjectionResult | null
}

/**
 * Loads comments for the current session and re-projects them whenever the
 * selection changes. Projection target = the `newer` end of the selection (a
 * commit hash) or workdir when `newer === null`. When `selection === null`
 * (terminal view) projections are cleared.
 */
export function useSessionComments(
  projectPath: string,
  sessionId: string | null,
  selection: Selection | null,
): UseSessionCommentsResult {
  const [comments, setComments] = useState<Comment[]>([])
  const [projections, setProjections] = useState<Map<string, ProjectionResult>>(() => new Map())
  const reqSeqRef = useRef(0)

  // Initial load + reload when sessionId changes.
  useEffect(() => {
    if (!sessionId) {
      setComments([])
      return
    }
    let cancelled = false
    void tauri.listComments(sessionId).then(
      (loaded) => {
        if (!cancelled) setComments(loaded)
      },
      (e) => console.error("[creche] listComments failed", e),
    )
    return () => {
      cancelled = true
    }
  }, [sessionId])

  // Re-project whenever selection or comment set changes.
  useEffect(() => {
    if (!selection || comments.length === 0) {
      setProjections(new Map())
      return
    }
    const seq = ++reqSeqRef.current
    const ids = comments.map((c) => c.id)
    void tauri.projectComments(projectPath, ids, selection.newer).then(
      (results: ProjectedComment[]) => {
        if (seq !== reqSeqRef.current) return
        const map = new Map<string, ProjectionResult>()
        for (const r of results) map.set(r.comment_id, r.result)
        setProjections(map)
      },
      (e) => console.error("[creche] projectComments failed", e),
    )
  }, [projectPath, selection, comments])

  const add = useCallback((c: Comment): void => {
    setComments((prev) => [c, ...prev])
  }, [])

  const remove = useCallback(async (id: string): Promise<void> => {
    await tauri.deleteComment(id)
    setComments((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const projectionFor = useCallback(
    (id: string): ProjectionResult | null => projections.get(id) ?? null,
    [projections],
  )

  const merged = useMemo<CommentWithProjection[]>(
    () => comments.map((c) => ({ comment: c, projection: projections.get(c.id) ?? null })),
    [comments, projections],
  )

  return { comments: merged, add, remove, projectionFor }
}
