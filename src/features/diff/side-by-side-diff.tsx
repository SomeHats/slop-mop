import { ChevronDown, ChevronUp } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { CommentComposer } from "@/features/comments/comment-composer"
import { tokenStyle } from "@/lib/shiki"
import type { Comment, FileDiff } from "@/lib/types"
import { cn } from "@/lib/utils"
import { EXPAND_STEP, type RegionExpansion } from "./compute-diff-rows"
import { computeDiffLayout } from "./diff-layout"
import { InlineCommentCard } from "./inline-comment-card"
import type { HighlightedLineData } from "./use-highlighted-diff"
import { useHighlightedDiff } from "./use-highlighted-diff"

export type InlineComment = {
  comment: Comment
  /** Right-side line number in the currently shown diff (already projected). */
  anchorLine: number
}

export type SideBySideDiffProps = {
  file: FileDiff
  /** When true, right-side context/addition lines are click + drag commentable. */
  commentingEnabled: boolean
  /** Comments rendered inline under their anchor line. Already filtered to
   *  this file and to projections that resolved (not orphaned). */
  inlineComments: InlineComment[]
  onDeleteComment: (id: string) => void
  /** Called when the user submits the composer for the current selection. */
  onSubmitComment?:
    | ((
        filePath: string,
        rangeStart: number,
        rangeEnd: number | null,
        contents: string,
      ) => Promise<void> | void)
    | undefined
  /** Imperative ref to scroll a specific line into view from outside (e.g. sidebar click). */
  scrollLineRef?: React.MutableRefObject<((lineNo: number) => void) | null> | undefined
}

type PendingRange = { anchor: number; current: number }

function rangeBounds(p: PendingRange): { start: number; end: number | null } {
  const lo = Math.min(p.anchor, p.current)
  const hi = Math.max(p.anchor, p.current)
  return { start: lo, end: lo === hi ? null : hi }
}

function lineInPending(line: number | null | undefined, p: PendingRange | null): boolean {
  if (!p || line == null) return false
  const lo = Math.min(p.anchor, p.current)
  const hi = Math.max(p.anchor, p.current)
  return line >= lo && line <= hi
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  added: "default",
  deleted: "destructive",
  modified: "secondary",
  renamed: "outline",
}

/** Each code row is `h-5` (1.25rem). Multiply by the root font size to get pixels. */
const ROW_HEIGHT_REM = 1.25

/** Sentinel id used to slot the composer into the same overlay/spacer machinery
 *  as committed comments. Never collides with a real UUID. */
const COMPOSER_ID = "__composer__"

function getRootFontSizePx(): number {
  if (typeof window === "undefined") return 16
  const fs = window.getComputedStyle(document.documentElement).fontSize
  const n = Number.parseFloat(fs)
  return Number.isFinite(n) && n > 0 ? n : 16
}

export function SideBySideDiff({
  file,
  commentingEnabled,
  inlineComments,
  onDeleteComment,
  onSubmitComment,
  scrollLineRef,
}: SideBySideDiffProps): React.JSX.Element {
  const [expansions, setExpansions] = useState<Map<number, RegionExpansion>>(() => new Map())
  const [pending, setPending] = useState<PendingRange | null>(null)
  const [composer, setComposer] = useState<{ start: number; end: number | null } | null>(null)
  const [commentHeights, setCommentHeights] = useState<Map<string, number>>(() => new Map())
  const [rowHeightPx, setRowHeightPx] = useState<number>(() => ROW_HEIGHT_REM * getRootFontSizePx())
  const lineRefsRef = useRef<Map<number, HTMLDivElement>>(new Map())
  const observerRef = useRef<ResizeObserver | null>(null)
  const elToCommentRef = useRef<Map<Element, string>>(new Map())

  const handleExpandTop = useCallback((regionIndex: number): void => {
    setExpansions((prev) => {
      const next = new Map(prev)
      const current = next.get(regionIndex) ?? { top: 0, bottom: 0 }
      next.set(regionIndex, { ...current, top: current.top + EXPAND_STEP })
      return next
    })
  }, [])

  const handleExpandBottom = useCallback((regionIndex: number): void => {
    setExpansions((prev) => {
      const next = new Map(prev)
      const current = next.get(regionIndex) ?? { top: 0, bottom: 0 }
      next.set(regionIndex, { ...current, bottom: current.bottom + EXPAND_STEP })
      return next
    })
  }, [])

  const handleRevealThrough = useCallback(
    (regionIndex: number, offsetFromTop: number, count: number): void => {
      setExpansions((prev) => {
        const next = new Map(prev)
        const current = next.get(regionIndex) ?? { top: 0, bottom: 0 }
        next.set(regionIndex, { ...current, bottom: current.bottom + count - offsetFromTop })
        return next
      })
    },
    [],
  )

  const { rows } = useHighlightedDiff(file, expansions)

  // Re-measure row pixel height on font-size changes (rare, but cheap).
  useEffect(() => {
    setRowHeightPx(ROW_HEIGHT_REM * getRootFontSizePx())
  }, [])

  // Drop measured heights for entries that no longer exist (comments removed
  // from the inline list, composer closed) so the map doesn't grow unbounded.
  const composerOpen = composer !== null
  useEffect(() => {
    setCommentHeights((prev) => {
      const ids = new Set(inlineComments.map((c) => c.comment.id))
      if (composerOpen) ids.add(COMPOSER_ID)
      let changed = false
      const next = new Map<string, number>()
      for (const [id, h] of prev) {
        if (ids.has(id)) next.set(id, h)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [inlineComments, composerOpen])

  // Single ResizeObserver per diff. Cards register their element via the ref
  // callback below; height changes feed back into commentHeights state, which
  // re-runs the layout pass.
  useEffect(() => {
    const elMap = elToCommentRef.current
    const obs = new ResizeObserver((entries) => {
      setCommentHeights((prev) => {
        let changed = false
        const next = new Map(prev)
        for (const entry of entries) {
          const id = elMap.get(entry.target)
          if (!id) continue
          const h = entry.contentRect.height
          if (next.get(id) !== h) {
            next.set(id, h)
            changed = true
          }
        }
        return changed ? next : prev
      })
    })
    observerRef.current = obs
    return () => {
      obs.disconnect()
      observerRef.current = null
      elMap.clear()
    }
  }, [])

  const registerCard = useCallback(
    (id: string) =>
      (el: HTMLDivElement | null): void => {
        const obs = observerRef.current
        if (!obs) return
        const elMap = elToCommentRef.current
        for (const [prevEl, prevId] of elMap) {
          if (prevId === id && prevEl !== el) {
            obs.unobserve(prevEl)
            elMap.delete(prevEl)
          }
        }
        if (el) {
          elMap.set(el, id)
          obs.observe(el)
        }
      },
    [],
  )

  // Mouseup anywhere finalizes a pending drag into the composer state.
  // Listening at window-level handles mouseups outside the diff.
  useEffect(() => {
    if (!pending) return
    const onUp = (): void => {
      setPending((p) => {
        if (!p) return null
        const { start, end } = rangeBounds(p)
        setComposer({ start, end })
        return null
      })
    }
    window.addEventListener("mouseup", onUp)
    return () => window.removeEventListener("mouseup", onUp)
  }, [pending])

  // Scroll-to-line: imperatively scrolls a right-side line into view.
  useEffect(() => {
    if (!scrollLineRef) return
    scrollLineRef.current = (lineNo: number): void => {
      const el = lineRefsRef.current.get(lineNo)
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
    }
    return () => {
      if (scrollLineRef.current) scrollLineRef.current = null
    }
  }, [scrollLineRef])

  const handleLineMouseDown = useCallback(
    (lineNo: number) =>
      (e: React.MouseEvent): void => {
        if (!commentingEnabled || e.button !== 0) return
        e.preventDefault()
        setComposer(null)
        setPending({ anchor: lineNo, current: lineNo })
      },
    [commentingEnabled],
  )

  const handleLineMouseEnter = useCallback(
    (lineNo: number) => (): void => {
      setPending((p) => (p ? { ...p, current: lineNo } : null))
    },
    [],
  )

  // Consistent gutter width based on max line number
  const gutterWidth = useMemo(() => {
    let max = 0
    for (const row of rows) {
      if (row.kind === "paired") {
        if (row.left) max = Math.max(max, row.left.lineNo)
        if (row.right) max = Math.max(max, row.right.lineNo)
      }
    }
    return `${(String(max).length + 1).toString()}ch`
  }, [rows])

  // Composer participates in the same overlay/spacer machinery as committed
  // comments via a sentinel id. When present, it appears as the *last* item on
  // its anchor line (so it sits below any existing comments on that same line).
  const composerAnchorLine = composer ? (composer.end ?? composer.start) : null

  const commentsByAnchorLine = useMemo(() => {
    const map = new Map<number, Comment[]>()
    for (const ic of inlineComments) {
      const list = map.get(ic.anchorLine)
      if (list) list.push(ic.comment)
      else map.set(ic.anchorLine, [ic.comment])
    }
    if (composerAnchorLine !== null) {
      const placeholder: Comment = {
        id: COMPOSER_ID,
        session_id: "",
        commit_hash: "",
        file_path: file.path,
        range_start: composer?.start ?? composerAnchorLine,
        range_end: composer?.end ?? null,
        contents: "",
        created_at: "",
      }
      const list = map.get(composerAnchorLine)
      if (list) list.push(placeholder)
      else map.set(composerAnchorLine, [placeholder])
    }
    return map
  }, [inlineComments, composer, composerAnchorLine, file.path])

  const commentsById = useMemo(() => {
    const map = new Map<string, Comment>()
    for (const ic of inlineComments) map.set(ic.comment.id, ic.comment)
    return map
  }, [inlineComments])

  const layout = useMemo(
    () =>
      computeDiffLayout({
        rows,
        commentsByAnchorLine,
        commentHeights,
        rowHeightPx,
      }),
    [rows, commentsByAnchorLine, commentHeights, rowHeightPx],
  )

  // While the composer is open, also highlight the locked-in range visually.
  const lockedRange: PendingRange | null = composer
    ? { anchor: composer.start, current: composer.end ?? composer.start }
    : null
  const highlightRange = pending ?? lockedRange

  const renderColumnSlot = useCallback(
    (
      slot: (typeof layout.slots)[number],
      render: (rowIndex: number) => React.ReactNode,
    ): React.ReactNode => {
      switch (slot.kind) {
        case "row":
          return render(slot.rowIndex)
        case "collapsed":
          return (
            <div
              key={`spacer-${slot.regionIndex.toString()}`}
              style={{ height: `${slot.heightPx.toString()}px` }}
            />
          )
        case "commentSpacer":
          return (
            <div key={`cs-${slot.commentId}`} style={{ height: `${slot.heightPx.toString()}px` }} />
          )
      }
    },
    [],
  )

  return (
    <div className="flex flex-col border border-border">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background px-3 py-1.5">
        <span className="flex-1 truncate text-xs font-medium text-foreground">{file.path}</span>
        <Badge variant={STATUS_VARIANTS[file.status] ?? "secondary"} className="text-[10px]">
          {file.status}
        </Badge>
        <span className="text-[10px]">
          <span className="text-green-400">+{file.additions}</span>{" "}
          <span className="text-red-400">-{file.deletions}</span>
        </span>
      </div>
      {file.old_path ? (
        <div className="border-b border-border bg-background px-3 py-0.5">
          <span className="text-[10px] text-muted-foreground">from {file.old_path}</span>
        </div>
      ) : null}

      {/*
       * IMPORTANT: Single 4-column layout for synchronized horizontal scrolling.
       *
       * All rows (code + collapsed spacers + comment spacers) are rendered in
       * ONE set of 4 columns. This ensures all "before" code shares one
       * overflow-x-auto container and all "after" code shares another —
       * scrolling horizontally in one code region scrolls ALL code in that
       * column together.
       *
       * DO NOT split into per-segment columns. That breaks scroll synchronization
       * because each segment gets its own independent scroll container.
       *
       * Collapse bars and inline comment cards are absolutely positioned over
       * 0-flow spacers in the columns (the spacer reserves vertical space; the
       * absolute element spans full width).
       */}
      <div className="relative text-xs leading-5">
        <div className="flex">
          {/* Left gutter — fixed width, no horizontal scroll */}
          <div className="shrink-0" style={{ minWidth: gutterWidth }}>
            {layout.slots.map((slot, i) =>
              renderColumnSlot(slot, (rowIndex) => {
                const row = rows[rowIndex]
                if (!row || row.kind !== "paired") return null
                return (
                  <div
                    key={i.toString()}
                    className={cn(
                      "h-5 select-none px-2 text-right",
                      codeCellBg(row.left),
                      gutterText(row.left),
                    )}
                  >
                    {row.left?.lineNo ?? ""}
                  </div>
                )
              }),
            )}
          </div>

          {/* Left code (before) — single overflow-x-auto for ALL left-side code */}
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="min-w-full w-fit">
              {layout.slots.map((slot, i) =>
                renderColumnSlot(slot, (rowIndex) => {
                  const row = rows[rowIndex]
                  if (!row || row.kind !== "paired") return null
                  return <CodeCell key={i.toString()} line={row.left} />
                }),
              )}
            </div>
          </div>

          {/* Right gutter */}
          <div className="shrink-0" style={{ minWidth: gutterWidth }}>
            {layout.slots.map((slot, i) =>
              renderColumnSlot(slot, (rowIndex) => {
                const row = rows[rowIndex]
                if (!row || row.kind !== "paired") return null
                return (
                  <div
                    key={i.toString()}
                    onMouseDown={
                      commentingEnabled && row.right?.lineNo
                        ? handleLineMouseDown(row.right.lineNo)
                        : undefined
                    }
                    onMouseEnter={
                      commentingEnabled && row.right?.lineNo
                        ? handleLineMouseEnter(row.right.lineNo)
                        : undefined
                    }
                    className={cn(
                      "h-5 select-none px-2 text-right",
                      codeCellBg(row.right),
                      gutterText(row.right),
                      lineInPending(row.right?.lineNo, highlightRange) && "bg-purple-500/30",
                      commentingEnabled &&
                        row.right?.lineNo &&
                        "cursor-pointer hover:bg-purple-500/20",
                    )}
                  >
                    {row.right?.lineNo ?? ""}
                  </div>
                )
              }),
            )}
          </div>

          {/* Right code (after) */}
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="min-w-full w-fit">
              {layout.slots.map((slot, i) =>
                renderColumnSlot(slot, (rowIndex) => {
                  const row = rows[rowIndex]
                  if (!row || row.kind !== "paired") return null
                  return (
                    <CodeCell
                      key={i.toString()}
                      line={row.right}
                      pending={lineInPending(row.right?.lineNo, highlightRange)}
                      onMouseDown={
                        commentingEnabled && row.right?.lineNo
                          ? handleLineMouseDown(row.right.lineNo)
                          : undefined
                      }
                      onMouseEnter={
                        commentingEnabled && row.right?.lineNo
                          ? handleLineMouseEnter(row.right.lineNo)
                          : undefined
                      }
                      registerRef={
                        row.right?.lineNo
                          ? (el) => {
                              const lineNo = row.right?.lineNo
                              if (lineNo == null) return
                              if (el) lineRefsRef.current.set(lineNo, el)
                              else lineRefsRef.current.delete(lineNo)
                            }
                          : undefined
                      }
                    />
                  )
                }),
              )}
            </div>
          </div>
        </div>

        {/*
         * Collapse bars — absolutely positioned over the spacer regions. Pixel
         * `top` values come from the layout pass so they account for any
         * comment cards above them.
         */}
        {layout.collapsedBars.map((bar) => (
          <div
            key={`bar-${bar.regionIndex.toString()}`}
            className="absolute left-0 right-0 z-[5] flex flex-col border-y border-border bg-background"
            style={{
              top: `${bar.topPx.toString()}px`,
              height: `${bar.heightPx.toString()}px`,
            }}
          >
            <div className="flex h-5 items-center">
              <div className="flex shrink-0 items-center gap-1 pl-2">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => handleExpandTop(bar.regionIndex)}
                >
                  <ChevronDown className="size-3" />
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => handleExpandBottom(bar.regionIndex)}
                >
                  <ChevronUp className="size-3" />
                </button>
              </div>
              <span className="pl-2 text-[10px] text-muted-foreground">{bar.count} lines</span>
            </div>
            {bar.stickyLines.map((sl) => (
              <button
                key={sl.lineNo}
                type="button"
                className="flex h-5 items-center whitespace-pre text-left hover:bg-muted"
                onClick={() => handleRevealThrough(bar.regionIndex, sl.offsetFromTop, bar.count)}
              >
                <span
                  className="shrink-0 select-none px-2 text-right text-foreground/30"
                  style={{ minWidth: gutterWidth }}
                >
                  {sl.lineNo}
                </span>
                <span className="text-muted-foreground">
                  {sl.tokens
                    ? sl.tokens.map((token, j) => (
                        <span key={j.toString()} className="opacity-60" style={tokenStyle(token)}>
                          {token.content}
                        </span>
                      ))
                    : sl.content}
                </span>
              </button>
            ))}
          </div>
        ))}

        {/* Inline comment cards + composer — absolute, full-width.
         * ResizeObserver feeds height back into commentHeights state so the
         * spacer in each column matches and rows below shift accordingly. */}
        {layout.commentOverlays.map(({ commentId, topPx }) => {
          if (commentId === COMPOSER_ID) {
            if (!composer) return null
            return (
              <div
                key="composer"
                ref={registerCard(COMPOSER_ID)}
                className="absolute left-0 right-0 z-[5] bg-background p-2"
                style={{ top: `${topPx.toString()}px` }}
              >
                <CommentComposer
                  rangeStart={composer.start}
                  rangeEnd={composer.end}
                  onCancel={() => setComposer(null)}
                  onSubmit={async (contents) => {
                    if (onSubmitComment) {
                      await onSubmitComment(file.path, composer.start, composer.end, contents)
                    }
                    setComposer(null)
                  }}
                />
              </div>
            )
          }
          const c = commentsById.get(commentId)
          if (!c) return null
          return (
            <div
              key={`comment-${commentId}`}
              ref={registerCard(commentId)}
              className="absolute left-0 right-0 z-[5]"
              style={{ top: `${topPx.toString()}px` }}
            >
              <InlineCommentCard comment={c} onDelete={() => onDeleteComment(commentId)} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

type CodeCellProps = {
  line: HighlightedLineData | null
  pending?: boolean | undefined
  onMouseDown?: ((e: React.MouseEvent) => void) | undefined
  onMouseEnter?: (() => void) | undefined
  registerRef?: ((el: HTMLDivElement | null) => void) | undefined
}

function CodeCell({
  line,
  pending,
  onMouseDown,
  onMouseEnter,
  registerRef,
}: CodeCellProps): React.JSX.Element {
  return (
    <div
      ref={registerRef}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      className={cn(
        "h-5 whitespace-pre pr-4",
        codeCellBg(line),
        pending && "bg-purple-500/30",
        onMouseDown && "cursor-pointer",
      )}
    >
      {line?.tokens
        ? line.tokens.map((token, j) => (
            <span key={j.toString()} style={tokenStyle(token)}>
              {token.content}
            </span>
          ))
        : (line?.content ?? "")}
    </div>
  )
}

function codeCellBg(line: HighlightedLineData | null): string {
  if (!line) return ""
  switch (line.type) {
    case "deletion":
      return "bg-red-900/40"
    case "addition":
      return "bg-green-900/40"
    default:
      return ""
  }
}

function gutterText(line: HighlightedLineData | null): string {
  if (!line) return "text-foreground/30"
  switch (line.type) {
    case "deletion":
      return "font-medium text-red-400/55"
    case "addition":
      return "font-medium text-green-400/55"
    default:
      return "text-foreground/30"
  }
}
