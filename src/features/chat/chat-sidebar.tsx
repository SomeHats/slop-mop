import { Loader2, Terminal } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { DiffStats, Selection, SessionCommit } from "@/lib/types"
import { cn } from "@/lib/utils"

type ChatSidebarProps = {
  commits: SessionCommit[]
  diffStats: Map<string, DiffStats>
  selection: Selection | null
  onSelect: (sel: Selection | null) => void
  committing: boolean
}

/**
 * Each row on the sidebar represents either the "Current Session" (workdir,
 * key=null) or one prompt commit. The rail column on the left shows a node
 * per row with line segments connecting adjacent nodes; the segment lights
 * up when both endpoints are inside the selection.
 */
type RowKey = string | null

type RowMeta = {
  /** null = workdir / Current Session; string = commit hash. */
  key: RowKey
  /** Position in the rendered list (0 at the top). */
  index: number
}

function formatTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  const hours = d.getHours().toString().padStart(2, "0")
  const minutes = d.getMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

const CLICK_DELAY_MS = 220
const DRAG_THRESHOLD_PX = 4

export function ChatSidebar({
  commits,
  diffStats,
  selection,
  onSelect,
  committing,
}: ChatSidebarProps): React.JSX.Element {
  // Rows: Current Session at the top, then commits in newest-first order
  // (matches `commits` from useClaudeSession).
  const rows: RowMeta[] = useMemo(() => {
    const list: RowMeta[] = [{ key: null, index: 0 }]
    for (let i = 0; i < commits.length; i++) {
      const c = commits[i]
      if (c) list.push({ key: c.commit_hash, index: i + 1 })
    }
    return list
  }, [commits])

  const indexFor = useMemo(() => {
    const map = new Map<RowKey, number>()
    for (const row of rows) map.set(row.key, row.index)
    return (key: RowKey): number => map.get(key) ?? -1
  }, [rows])

  // Selected positions on the rail (sorted lo→hi). Empty range when no
  // selection or when an endpoint isn't in the current row list.
  const litRange = useMemo<[number, number] | null>(() => {
    if (!selection) return null
    const a = indexFor(selection.older)
    const b = indexFor(selection.newer)
    if (a < 0 || b < 0) return null
    return a <= b ? [a, b] : [b, a]
  }, [selection, indexFor])

  const isInRange = (i: number): boolean => {
    if (!litRange) return false
    return i >= litRange[0] && i <= litRange[1]
  }

  // ── Interaction state ─────────────────────────────────────────────────────
  // Drag state lives in refs because we don't need re-renders for in-flight
  // tracking; the live selection update handles visual feedback.
  const dragAnchorRef = useRef<RowKey>(null)
  const dragStartedRef = useRef(false)
  const mouseStartXYRef = useRef<{ x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Always reset drag state on global mouseup so we don't leak state when
  // mouseup happens outside the sidebar.
  useEffect(() => {
    const onUp = (): void => {
      dragAnchorRef.current = null
      dragStartedRef.current = false
      mouseStartXYRef.current = null
    }
    window.addEventListener("mouseup", onUp)
    return () => window.removeEventListener("mouseup", onUp)
  }, [])

  const cancelClickTimer = (): void => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
  }

  const handleMouseDown = (key: RowKey, e: React.MouseEvent): void => {
    if (e.button !== 0) return
    dragAnchorRef.current = key
    dragStartedRef.current = false
    mouseStartXYRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseEnter = (key: RowKey, e: React.MouseEvent): void => {
    // `mouseStartXYRef.current === null` means no mousedown is active.
    const start = mouseStartXYRef.current
    if (!start) return
    const movedFar =
      Math.abs(e.clientX - start.x) > DRAG_THRESHOLD_PX ||
      Math.abs(e.clientY - start.y) > DRAG_THRESHOLD_PX
    if (key === dragAnchorRef.current && !movedFar) return

    dragStartedRef.current = true
    suppressClickRef.current = true
    cancelClickTimer()

    const anchor = dragAnchorRef.current
    const a = indexFor(anchor)
    const b = indexFor(key)
    if (a < 0 || b < 0) return
    // older = larger index (further down the rail = older in time);
    // newer = smaller index (closer to the top / present).
    const olderKey = a > b ? anchor : key
    const newerKey = a > b ? key : anchor
    onSelect({ older: olderKey, newer: newerKey })
  }

  const handleMouseUp = (key: RowKey): void => {
    if (dragStartedRef.current) {
      const anchor = dragAnchorRef.current
      const a = indexFor(anchor)
      const b = indexFor(key)
      if (a >= 0 && b >= 0) {
        const olderKey = a > b ? anchor : key
        const newerKey = a > b ? key : anchor
        onSelect({ older: olderKey, newer: newerKey })
      }
    }
  }

  const handleClick = (key: RowKey): void => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    cancelClickTimer()
    // Defer single-click action so a double-click can pre-empt it.
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null
      if (key === null) {
        // Click on Current Session = back to the terminal (no diff).
        onSelect(null)
      } else {
        // Click on a commit = from that commit through to the present.
        onSelect({ older: key, newer: null })
      }
    }, CLICK_DELAY_MS)
  }

  const handleDoubleClick = (key: RowKey): void => {
    cancelClickTimer()
    suppressClickRef.current = false
    // Double-click = just this row.
    onSelect({ older: key, newer: key })
  }

  const lastRowIndex = rows.length - 1

  return (
    <div className="flex w-80 flex-col overflow-hidden border-r border-border bg-background">
      <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:!block">
        <div className="flex w-full flex-col">
          {rows.map((row) => {
            // No selection at all = "back to terminal" state, which we
            // represent visually by lighting the Current Session node.
            const isCurrent = row.key === null
            const inRange =
              isInRange(row.index) || (selection === null && isCurrent)
            const aboveLit = inRange && isInRange(row.index - 1)
            const belowLit = inRange && isInRange(row.index + 1)

            if (row.key === null) {
              return (
                <Row
                  key="__current__"
                  rowKey={null}
                  isFirst={row.index === 0}
                  isLast={row.index === lastRowIndex}
                  inRange={inRange}
                  aboveLit={aboveLit}
                  belowLit={belowLit}
                  onMouseDown={handleMouseDown}
                  onMouseEnter={handleMouseEnter}
                  onMouseUp={handleMouseUp}
                  onClick={handleClick}
                  onDoubleClick={handleDoubleClick}
                >
                  <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">Current Session</span>
                  {committing && (
                    <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      committing…
                    </span>
                  )}
                </Row>
              )
            }

            const commit = commits[row.index - 1]
            if (!commit) return null
            const stats = diffStats.get(commit.commit_hash)
            return (
              <Row
                key={commit.commit_hash}
                rowKey={commit.commit_hash}
                isFirst={row.index === 0}
                isLast={row.index === lastRowIndex}
                inRange={inRange}
                aboveLit={aboveLit}
                belowLit={belowLit}
                onMouseDown={handleMouseDown}
                onMouseEnter={handleMouseEnter}
                onMouseUp={handleMouseUp}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="line-clamp-2 text-xs text-foreground">{commit.prompt}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                      {commit.commit_hash.slice(0, 7)}
                    </Badge>
                    {stats && (stats.additions > 0 || stats.deletions > 0) ? (
                      <span className="text-[10px]">
                        <span className="text-green-400">+{stats.additions}</span>{" "}
                        <span className="text-red-400">-{stats.deletions}</span>
                      </span>
                    ) : null}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {formatTime(commit.timestamp_unix)}
                    </span>
                  </div>
                </div>
              </Row>
            )
          })}
          {commits.length === 0 && (
            <p className="px-3 py-4 text-xs text-muted-foreground">No prompts yet.</p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

type RowProps = {
  rowKey: RowKey
  isFirst: boolean
  isLast: boolean
  inRange: boolean
  aboveLit: boolean
  belowLit: boolean
  onMouseDown: (key: RowKey, e: React.MouseEvent) => void
  onMouseEnter: (key: RowKey, e: React.MouseEvent) => void
  onMouseUp: (key: RowKey) => void
  onClick: (key: RowKey) => void
  onDoubleClick: (key: RowKey) => void
  children: React.ReactNode
}

function Row({
  rowKey,
  isFirst,
  isLast,
  inRange,
  aboveLit,
  belowLit,
  onMouseDown,
  onMouseEnter,
  onMouseUp,
  onClick,
  onDoubleClick,
  children,
}: RowProps): React.JSX.Element {
  return (
    <button
      type="button"
      onMouseDown={(e) => onMouseDown(rowKey, e)}
      onMouseEnter={(e) => onMouseEnter(rowKey, e)}
      onMouseUp={() => onMouseUp(rowKey)}
      onClick={() => onClick(rowKey)}
      onDoubleClick={() => onDoubleClick(rowKey)}
      className="group flex w-full select-none items-stretch bg-background text-left"
    >
      {/* Rail column — borders never cross this so the line stays continuous. */}
      <div className="relative w-6 shrink-0">
        {/* top half-line */}
        {!isFirst && (
          <span
            className={cn(
              "absolute left-1/2 top-0 h-1/2 w-[2px] -translate-x-1/2",
              aboveLit ? "bg-purple-400" : "bg-muted-foreground/60",
            )}
          />
        )}
        {/* bottom half-line */}
        {!isLast && (
          <span
            className={cn(
              "absolute left-1/2 top-1/2 h-1/2 w-[2px] -translate-x-1/2",
              belowLit ? "bg-purple-400" : "bg-muted-foreground/60",
            )}
          />
        )}
        {/* node — filled+purple when in range; out-of-range hover lights
            the border purple, in-range hover adds a soft purple halo. */}
        <span
          className={cn(
            "absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-[border-color,box-shadow]",
            inRange
              ? "border-purple-400 bg-purple-400 group-hover:ring-2 group-hover:ring-purple-400/50"
              : "border-muted-foreground/60 bg-background group-hover:border-purple-400",
          )}
        />
      </div>
      <div
        className={cn(
          "flex flex-1 min-w-0 items-center gap-2 py-2 pl-1.5 pr-3",
          !isFirst && "border-t border-border",
        )}
      >
        {children}
      </div>
    </button>
  )
}
