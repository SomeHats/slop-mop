import { ChevronDown, ChevronUp } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { tokenStyle } from "@/lib/shiki"
import type { FileDiff } from "@/lib/types"
import { cn } from "@/lib/utils"
import { EXPAND_STEP, type RegionExpansion } from "./compute-diff-rows"
import type { HighlightedLineData } from "./use-highlighted-diff"
import { useHighlightedDiff } from "./use-highlighted-diff"

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  added: "default",
  deleted: "destructive",
  modified: "secondary",
  renamed: "outline",
}

const ROW_H = 20 // px — matches h-5 / leading-5

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

  const { rows } = useHighlightedDiff(file, expansions)

  // Compute absolute positions for collapsed bars
  const collapsedBars = useMemo(() => {
    const bars: { top: number; count: number; regionIndex: number }[] = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (row?.kind === "collapsed") {
        bars.push({ top: i * ROW_H, count: row.count, regionIndex: row.regionIndex })
      }
    }
    return bars
  }, [rows])

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

      <div className="relative flex text-xs leading-5">
        {/* Left gutter */}
        <div className="shrink-0">
          {rows.map((row, i) =>
            row.kind === "collapsed" ? (
              <div key={i.toString()} className="h-5" />
            ) : (
              <div
                key={i.toString()}
                className={cn(
                  "h-5 select-none pr-2 text-right text-foreground/30",
                  codeCellBg(row.left),
                )}
              >
                {row.left?.lineNo ?? ""}
              </div>
            ),
          )}
        </div>

        {/* Left code (before) */}
        <div className="min-w-0 flex-1 overflow-x-auto">
          {rows.map((row, i) =>
            row.kind === "collapsed" ? (
              <div key={i.toString()} className="h-5" />
            ) : (
              <CodeCell key={i.toString()} line={row.left} />
            ),
          )}
        </div>

        {/* Right gutter */}
        <div className="shrink-0">
          {rows.map((row, i) =>
            row.kind === "collapsed" ? (
              <div key={i.toString()} className="h-5" />
            ) : (
              <div
                key={i.toString()}
                className={cn(
                  "h-5 select-none pr-2 text-right text-foreground/30",
                  codeCellBg(row.right),
                )}
              >
                {row.right?.lineNo ?? ""}
              </div>
            ),
          )}
        </div>

        {/* Right code (after) */}
        <div className="min-w-0 flex-1 overflow-x-auto">
          {rows.map((row, i) =>
            row.kind === "collapsed" ? (
              <div key={i.toString()} className="h-5" />
            ) : (
              <CodeCell key={i.toString()} line={row.right} />
            ),
          )}
        </div>

        {/* Collapse bars — absolutely positioned over the spacers */}
        {collapsedBars.map((bar) => (
          <div
            key={`bar-${bar.regionIndex.toString()}`}
            className="absolute inset-x-0 z-[1] flex items-center border-y border-border bg-background"
            style={{ top: bar.top, height: ROW_H }}
          >
            <div className="flex w-12 shrink-0 items-center justify-center gap-1">
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
            <span className="text-[10px] text-muted-foreground">{bar.count} lines</span>
          </div>
        ))}
      </div>
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
