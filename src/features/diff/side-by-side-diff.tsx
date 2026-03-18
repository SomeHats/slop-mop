import { ChevronDown, ChevronUp } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { tokenStyle } from "@/lib/shiki"
import type { FileDiff } from "@/lib/types"
import { cn } from "@/lib/utils"
import { EXPAND_STEP, type RegionExpansion } from "./compute-diff-rows"
import type {
  HighlightedLineData,
  HighlightedRow,
  HighlightedStickyLine,
} from "./use-highlighted-diff"
import { useHighlightedDiff } from "./use-highlighted-diff"

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  added: "default",
  deleted: "destructive",
  modified: "secondary",
  renamed: "outline",
}

type CodeSegment = { kind: "code"; rows: (HighlightedRow & { kind: "paired" })[] }
type CollapsedSegment = {
  kind: "collapsed"
  count: number
  regionIndex: number
  stickyLines: HighlightedStickyLine[]
}
type Segment = CodeSegment | CollapsedSegment

export function SideBySideDiff({ file }: { file: FileDiff }): React.JSX.Element {
  const [expansions, setExpansions] = useState<Map<number, RegionExpansion>>(() => new Map())

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

  // Split rows into alternating code/collapsed segments
  const segments = useMemo(() => {
    const result: Segment[] = []
    let codeRows: (HighlightedRow & { kind: "paired" })[] = []

    for (const row of rows) {
      if (row.kind === "collapsed") {
        if (codeRows.length > 0) {
          result.push({ kind: "code", rows: codeRows })
          codeRows = []
        }
        result.push({
          kind: "collapsed",
          count: row.count,
          regionIndex: row.regionIndex,
          stickyLines: row.stickyLines,
        })
      } else {
        codeRows.push(row)
      }
    }
    if (codeRows.length > 0) {
      result.push({ kind: "code", rows: codeRows })
    }

    return result
  }, [rows])

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

  // Measure file header height for sticky offset
  const headerRef = useRef<HTMLDivElement>(null)
  const [stickyTop, setStickyTop] = useState(0)

  useEffect(() => {
    if (headerRef.current) setStickyTop(headerRef.current.offsetHeight)
  }, [])

  return (
    <div className="flex flex-col border border-border">
      <div
        ref={headerRef}
        className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background px-3 py-1.5"
      >
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

      <div className="text-xs leading-5">
        {segments.map((segment, segIdx) =>
          segment.kind === "collapsed" ? (
            <CollapseBar
              key={`bar-${segment.regionIndex.toString()}`}
              segment={segment}
              gutterWidth={gutterWidth}
              stickyTop={stickyTop}
              onExpandTop={handleExpandTop}
              onExpandBottom={handleExpandBottom}
              onRevealThrough={handleRevealThrough}
            />
          ) : (
            <div key={`seg-${segIdx.toString()}`} className="flex">
              {/* Left gutter */}
              <div className="shrink-0" style={{ minWidth: gutterWidth }}>
                {segment.rows.map((row, i) => (
                  <div
                    key={i.toString()}
                    className={cn(
                      "h-5 select-none pr-2 text-right text-foreground/30",
                      codeCellBg(row.left),
                    )}
                  >
                    {row.left?.lineNo ?? ""}
                  </div>
                ))}
              </div>

              {/* Left code (before) */}
              <div className="min-w-0 flex-1 overflow-x-auto">
                {segment.rows.map((row, i) => (
                  <CodeCell key={i.toString()} line={row.left} />
                ))}
              </div>

              {/* Right gutter */}
              <div className="shrink-0" style={{ minWidth: gutterWidth }}>
                {segment.rows.map((row, i) => (
                  <div
                    key={i.toString()}
                    className={cn(
                      "h-5 select-none pr-2 text-right text-foreground/30",
                      codeCellBg(row.right),
                    )}
                  >
                    {row.right?.lineNo ?? ""}
                  </div>
                ))}
              </div>

              {/* Right code (after) */}
              <div className="min-w-0 flex-1 overflow-x-auto">
                {segment.rows.map((row, i) => (
                  <CodeCell key={i.toString()} line={row.right} />
                ))}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  )
}

function CollapseBar({
  segment,
  gutterWidth,
  stickyTop,
  onExpandTop,
  onExpandBottom,
  onRevealThrough,
}: {
  segment: CollapsedSegment
  gutterWidth: string
  stickyTop: number
  onExpandTop: (regionIndex: number) => void
  onExpandBottom: (regionIndex: number) => void
  onRevealThrough: (regionIndex: number, offsetFromTop: number, count: number) => void
}): React.JSX.Element {
  return (
    <div
      className="sticky z-[5] flex flex-col border-y border-border bg-background"
      style={{ top: stickyTop }}
    >
      <div className="flex h-5 items-center">
        <div
          className="flex shrink-0 items-center justify-center gap-1"
          style={{ width: gutterWidth }}
        >
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onExpandTop(segment.regionIndex)}
          >
            <ChevronDown className="size-3" />
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onExpandBottom(segment.regionIndex)}
          >
            <ChevronUp className="size-3" />
          </button>
        </div>
        <span className="text-[10px] text-muted-foreground">{segment.count} lines</span>
      </div>
      {segment.stickyLines.map((sl) => (
        <button
          key={sl.lineNo}
          type="button"
          className="flex h-5 items-center whitespace-pre text-left hover:bg-muted"
          onClick={() => onRevealThrough(segment.regionIndex, sl.offsetFromTop, segment.count)}
        >
          <span
            className="shrink-0 select-none pr-2 text-right text-foreground/30"
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
  )
}

function CodeCell({ line }: { line: HighlightedLineData | null }): React.JSX.Element {
  return (
    <div className={cn("h-5 whitespace-pre pr-4", codeCellBg(line))}>
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
      return "bg-red-950/40"
    case "addition":
      return "bg-green-950/40"
    default:
      return ""
  }
}
