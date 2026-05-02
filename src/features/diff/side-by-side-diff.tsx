import { ChevronDown, ChevronUp } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { CommentComposer } from "@/features/comments/comment-composer"
import { tokenStyle } from "@/lib/shiki"
import type { FileDiff } from "@/lib/types"
import { cn } from "@/lib/utils"
import { EXPAND_STEP, type RegionExpansion } from "./compute-diff-rows"
import type { HighlightedLineData, HighlightedStickyLine } from "./use-highlighted-diff"
import { useHighlightedDiff } from "./use-highlighted-diff"

export type SideBySideDiffProps = {
  file: FileDiff
  /** When true, right-side context/addition lines are click + drag commentable. */
  commentingEnabled: boolean
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

/**
 * Row height constant: each row is h-5 = 1.25rem (from leading-5).
 * Used to compute spacer heights and absolute positions for collapse bars.
 */
const ROW_HEIGHT_REM = 1.25

export function SideBySideDiff({
  file,
  commentingEnabled,
  onSubmitComment,
  scrollLineRef,
}: SideBySideDiffProps): React.JSX.Element {
  const [expansions, setExpansions] = useState<Map<number, RegionExpansion>>(() => new Map())
  const [pending, setPending] = useState<PendingRange | null>(null)
  const [composer, setComposer] = useState<{ start: number; end: number | null } | null>(null)
  const lineRefsRef = useRef<Map<number, HTMLDivElement>>(new Map())

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

  /**
   * Compute positions for absolutely-positioned collapse bars.
   *
   * Each paired row occupies 1 row height. Each collapsed region occupies
   * (1 + stickyLines.length) row heights (1 for the control row, plus one
   * per sticky context line). We walk the rows array to compute cumulative
   * vertical offsets so each collapse bar can be positioned with `top`.
   */
  const collapsedBars = useMemo(() => {
    const bars: {
      topRows: number
      heightRows: number
      count: number
      regionIndex: number
      stickyLines: HighlightedStickyLine[]
    }[] = []
    let rowOffset = 0
    for (const row of rows) {
      if (row.kind === "collapsed") {
        const heightRows = 1 + row.stickyLines.length
        bars.push({
          topRows: rowOffset,
          heightRows,
          count: row.count,
          regionIndex: row.regionIndex,
          stickyLines: row.stickyLines,
        })
        rowOffset += heightRows
      } else {
        rowOffset += 1
      }
    }
    return bars
  }, [rows])

  // While the composer is open, also highlight the locked-in range visually.
  const lockedRange: PendingRange | null = composer
    ? { anchor: composer.start, current: composer.end ?? composer.start }
    : null
  const highlightRange = pending ?? lockedRange

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
       * All rows (code + collapsed spacers) are rendered in ONE set of 4 columns.
       * This ensures all "before" code shares one overflow-x-auto container and
       * all "after" code shares another — scrolling horizontally in one code
       * region scrolls ALL code in that column together.
       *
       * DO NOT split into per-segment columns. That breaks scroll synchronization
       * because each segment gets its own independent scroll container.
       *
       * Collapsed regions are spacer divs in each column. The actual collapse bar
       * UI is absolutely positioned over them (outside column flow) so it can
       * span the full width without disrupting column alignment.
       */}
      <div className="relative text-xs leading-5">
        <div className="flex">
          {/* Left gutter — fixed width, no horizontal scroll */}
          <div className="shrink-0" style={{ minWidth: gutterWidth }}>
            {rows.map((row, i) =>
              row.kind === "collapsed" ? (
                /* Spacer: reserves vertical space for the absolutely positioned collapse bar */
                <div
                  key={`spacer-${row.regionIndex.toString()}`}
                  style={{
                    height: `${((1 + row.stickyLines.length) * ROW_HEIGHT_REM).toString()}rem`,
                  }}
                />
              ) : (
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
              ),
            )}
          </div>

          {/* Left code (before) — single overflow-x-auto for ALL left-side code */}
          <div className="min-w-0 flex-1 overflow-x-auto">
            {/* w-fit: stretches to widest line. min-w-full: at least as wide as
                the visible area. This ensures row backgrounds (add/delete highlights)
                cover the full scrollable width, not just each line's own content. */}
            <div className="min-w-full w-fit">
              {rows.map((row, i) =>
                row.kind === "collapsed" ? (
                  <div
                    key={`spacer-${row.regionIndex.toString()}`}
                    style={{
                      height: `${((1 + row.stickyLines.length) * ROW_HEIGHT_REM).toString()}rem`,
                    }}
                  />
                ) : (
                  <CodeCell key={i.toString()} line={row.left} />
                ),
              )}
            </div>
          </div>

          {/* Right gutter — fixed width, no horizontal scroll */}
          <div className="shrink-0" style={{ minWidth: gutterWidth }}>
            {rows.map((row, i) =>
              row.kind === "collapsed" ? (
                <div
                  key={`spacer-${row.regionIndex.toString()}`}
                  style={{
                    height: `${((1 + row.stickyLines.length) * ROW_HEIGHT_REM).toString()}rem`,
                  }}
                />
              ) : (
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
              ),
            )}
          </div>

          {/* Right code (after) — single overflow-x-auto for ALL right-side code */}
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="min-w-full w-fit">
              {rows.map((row, i) =>
                row.kind === "collapsed" ? (
                  <div
                    key={`spacer-${row.regionIndex.toString()}`}
                    style={{
                      height: `${((1 + row.stickyLines.length) * ROW_HEIGHT_REM).toString()}rem`,
                    }}
                  />
                ) : (
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
                ),
              )}
            </div>
          </div>
        </div>

        {/*
         * Collapse bars — absolutely positioned over the spacer regions.
         *
         * These must be position:absolute (not in the column flow) because they
         * span the full width of the diff and contain their own internal layout
         * (gutter + label + sticky lines). If they were in-flow inside the
         * columns, they'd break the 4-column alignment.
         */}
        {collapsedBars.map((bar) => (
          <div
            key={`bar-${bar.regionIndex.toString()}`}
            className="absolute left-0 right-0 z-[5] flex flex-col border-y border-border bg-background"
            style={{
              top: `${(bar.topRows * ROW_HEIGHT_REM).toString()}rem`,
              height: `${(bar.heightRows * ROW_HEIGHT_REM).toString()}rem`,
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
      </div>

      {composer && (
        <div className="border-t border-border bg-background p-2">
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
      )}
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
