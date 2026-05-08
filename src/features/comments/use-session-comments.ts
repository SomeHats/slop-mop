import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as tauri from "@/lib/tauri"
import type { Comment, ProjectedComment, ProjectionResult, Selection } from "@/lib/types"
import { allSendableIds, reconcileStaged, shouldAutoStageNew } from "./staging"
import { commentForSubmit, type SubmittableComment } from "./submit-comments"

export type CommentWithProjection = {
  comment: Comment
  /** Null while projection is in flight or when no selection is active. */
  projection: ProjectionResult | null
  /** Projection against the live workdir, regardless of the diff view. Drives
   *  staging eligibility — null while in flight. */
  sessionProjection: ProjectionResult | null
}

export type UseSessionCommentsResult = {
  comments: CommentWithProjection[]
  /** Ids of comments currently staged for the next batch send. */
  staged: Set<string>
  /** Flip a single comment's staged state. */
  toggleStaged: (id: string) => void
  /** Stage (true) or unstage (false) every sendable comment. */
  setAllStaged: (checked: boolean) => void
  add: (comment: Comment) => void
  remove: (id: string) => Promise<void>
  update: (id: string, contents: string) => Promise<void>
  /** Snapshot the staged + sendable comments, formatted for submission. The
   *  parent (which owns `writeInput`) is responsible for actually sending
   *  them and then calling `remove` on each id. */
  prepareSubmit: () => { ids: string[]; items: SubmittableComment[] }
  /** Resolve a comment id's currently-projected position, or null. */
  projectionFor: (id: string) => ProjectionResult | null
}

/**
 * Loads comments for the current session and re-projects them whenever the
 * selection changes. Two projection maps are tracked independently:
 *   - `projection` mirrors the diff view (target = `selection.newer ?? null`).
 *   - `sessionProjection` always targets the workdir, since the staging set
 *     reflects what the agent will see when comments are sent — that may
 *     diverge from what's visible in the current diff view.
 */
// woke2 impl CFE-HK12
export function useSessionComments(
  projectPath: string,
  sessionId: string | null,
  selection: Selection | null,
): UseSessionCommentsResult {
  const [comments, setComments] = useState<Comment[]>([])
  const [projections, setProjections] = useState<Map<string, ProjectionResult>>(() => new Map())
  const [workdirProjections, setWorkdirProjections] = useState<Map<string, ProjectionResult>>(
    () => new Map(),
  )
  const [staged, setStaged] = useState<Set<string>>(() => new Set())

  const reqSeqRef = useRef(0)
  const workdirReqSeqRef = useRef(0)

  // Refs let callbacks read the latest state without re-creating themselves.
  const commentsRef = useRef<Comment[]>([])
  const workdirProjectionsRef = useRef<Map<string, ProjectionResult>>(new Map())
  useEffect(() => {
    commentsRef.current = comments
  }, [comments])
  useEffect(() => {
    workdirProjectionsRef.current = workdirProjections
  }, [workdirProjections])

  // Initial load + reload when sessionId changes. Also resets staged set so
  // staging is per-session and doesn't leak across switches.
  // woke2 impl CFE-HK1, CFE-HK2, CFE-HK3
  useEffect(() => {
    setStaged(new Set())
    if (!sessionId) {
      setComments([])
      return
    }
    let cancelled = false
    void tauri.listComments(sessionId).then(
      (loaded) => {
        if (!cancelled) setComments(loaded)
      },
      (e) => console.error("[slop-mop] listComments failed", e),
    )
    return () => {
      cancelled = true
    }
  }, [sessionId])

  // Diff-view projection: target follows the selection's `newer` end, or
  // workdir (None) for any view that includes uncommitted changes.
  // woke2 impl CFE-HK4, CFE-HK6
  useEffect(() => {
    if (comments.length === 0) {
      setProjections(new Map())
      return
    }
    const target = selection?.newer ?? null
    const seq = ++reqSeqRef.current
    const ids = comments.map((c) => c.id)
    void tauri.projectComments(projectPath, ids, target).then(
      (results: ProjectedComment[]) => {
        if (seq !== reqSeqRef.current) return
        const map = new Map<string, ProjectionResult>()
        for (const r of results) map.set(r.comment_id, r.result)
        setProjections(map)
      },
      (e) => console.error("[slop-mop] projectComments failed", e),
    )
  }, [projectPath, selection, comments])

  // Workdir projection: always targets None (workdir). Independent of the
  // selection so the staging UI reflects what the agent will see, not what
  // the user happens to be looking at.
  // woke2 impl CFE-HK5, CFE-HK6
  useEffect(() => {
    if (comments.length === 0) {
      setWorkdirProjections(new Map())
      return
    }
    const seq = ++workdirReqSeqRef.current
    const ids = comments.map((c) => c.id)
    void tauri.projectComments(projectPath, ids, null).then(
      (results: ProjectedComment[]) => {
        if (seq !== workdirReqSeqRef.current) return
        const map = new Map<string, ProjectionResult>()
        for (const r of results) map.set(r.comment_id, r.result)
        setWorkdirProjections(map)
      },
      (e) => console.error("[slop-mop] projectComments (workdir) failed", e),
    )
  }, [projectPath, comments])

  useEffect(() => {
    setStaged((prev) => reconcileStaged(prev, comments, workdirProjections))
  }, [comments, workdirProjections])

  // woke2 impl CFE-HK7
  const add = useCallback((c: Comment): void => {
    const prevComments = commentsRef.current
    const proj = workdirProjectionsRef.current
    setComments((prev) => [c, ...prev])
    setStaged((prev) => {
      if (!shouldAutoStageNew(prevComments, proj, prev)) return prev
      const next = new Set(prev)
      next.add(c.id)
      return next
    })
  }, [])

  // woke2 impl CFE-HK8
  const remove = useCallback(async (id: string): Promise<void> => {
    await tauri.deleteComment(id)
    setComments((prev) => prev.filter((c) => c.id !== id))
    setStaged((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  // woke2 impl CFE-HK13
  const update = useCallback(async (id: string, contents: string): Promise<void> => {
    const updated = await tauri.updateComment(id, contents)
    setComments((prev) => prev.map((c) => (c.id === id ? updated : c)))
  }, [])

  // woke2 impl CFE-HK9
  const toggleStaged = useCallback((id: string): void => {
    setStaged((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // woke2 impl CFE-HK10
  const setAllStaged = useCallback((checked: boolean): void => {
    setStaged(
      checked ? allSendableIds(commentsRef.current, workdirProjectionsRef.current) : new Set(),
    )
  }, [])

  // Stable ref for prepareSubmit — `staged` changes every toggle and we don't
  // want to rebuild the callback (which would invalidate App's `useCallback`
  // dep on it).
  const stagedRef = useRef<Set<string>>(staged)
  useEffect(() => {
    stagedRef.current = staged
  }, [staged])

  // woke2 impl CFE-HK11
  const prepareSubmit = useCallback((): { ids: string[]; items: SubmittableComment[] } => {
    const stagedSet = stagedRef.current
    const wp = workdirProjectionsRef.current
    // Sort oldest → newest by created_at so the agent reads comments in the
    // order the user wrote them. ISO-8601 timestamps compare lexically.
    const ordered = [...commentsRef.current].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    )
    const ids: string[] = []
    const items: SubmittableComment[] = []
    for (const c of ordered) {
      if (!stagedSet.has(c.id)) continue
      const item = commentForSubmit({
        comment: c,
        projection: null,
        sessionProjection: wp.get(c.id) ?? null,
      })
      if (!item) continue
      ids.push(c.id)
      items.push(item)
    }
    return { ids, items }
  }, [])

  const projectionFor = useCallback(
    (id: string): ProjectionResult | null => projections.get(id) ?? null,
    [projections],
  )

  const merged = useMemo<CommentWithProjection[]>(
    () =>
      comments.map((c) => ({
        comment: c,
        projection: projections.get(c.id) ?? null,
        sessionProjection: workdirProjections.get(c.id) ?? null,
      })),
    [comments, projections, workdirProjections],
  )

  return {
    comments: merged,
    staged,
    toggleStaged,
    setAllStaged,
    add,
    remove,
    update,
    prepareSubmit,
    projectionFor,
  }
}
