import { ChevronDown, ChevronUp } from "lucide-react"
import { useCallback, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { tokenStyle } from "@/lib/shiki"
import type { FileDiff } from "@/lib/types"
import { cn } from "@/lib/utils"
import { EXPAND_STEP, type RegionExpansion } from "./compute-diff-rows"
import type { HighlightedLineData, HighlightedRow } from "./use-highlighted-diff"
import { useHighlightedDiff } from "./use-highlighted-diff"

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  added: "default",
  deleted: "destructive",
  modified: "secondary",
  renamed: "outline",
}

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

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
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
        <span className="text-[10px] text-muted-foreground">from {file.old_path}</span>
      ) : null}
      <div
        className="grid overflow-x-auto bg-muted text-xs"
        style={{
          gridTemplateColumns: "minmax(3rem, auto) 1fr minmax(3rem, auto) 1fr",
        }}
      >
        {rows.map((row, i) => (
          <DiffRow
            key={i.toString()}
            row={row}
            onExpandTop={handleExpandTop}
            onExpandBottom={handleExpandBottom}
          />
        ))}
      </div>
    </div>
  )
}

function DiffRow({
  row,
  onExpandTop,
  onExpandBottom,
}: {
  row: HighlightedRow
  onExpandTop: (regionIndex: number) => void
  onExpandBottom: (regionIndex: number) => void
}): React.JSX.Element {
  if (row.kind === "collapsed") {
    return (
      <div className="col-span-4 flex items-center border-y border-border py-px">
        <div className="flex w-12 shrink-0 items-center justify-center gap-1">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onExpandTop(row.regionIndex)}
          >
            <ChevronDown className="size-3" />
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onExpandBottom(row.regionIndex)}
          >
            <ChevronUp className="size-3" />
          </button>
        </div>
        <span className="text-[10px] text-muted-foreground">{row.count} lines</span>
      </div>
    )
  }

  const { left, right } = row
  const leftBg = cellBg(left)
  const rightBg = cellBg(right)

  return (
    <>
      <LineGutter line={left} bg={leftBg} />
      <LineContent line={left} bg={leftBg} />
      <LineGutter line={right} bg={rightBg} />
      <LineContent line={right} bg={rightBg} />
    </>
  )
}

function cellBg(line: HighlightedLineData | null): string {
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

function LineGutter({
  line,
  bg,
}: {
  line: HighlightedLineData | null
  bg: string
}): React.JSX.Element {
  return (
    <div className={cn("select-none pr-2 text-right text-foreground/30", bg)}>
      {line ? line.lineNo : ""}
    </div>
  )
}

function LineContent({
  line,
  bg,
}: {
  line: HighlightedLineData | null
  bg: string
}): React.JSX.Element {
  if (!line) {
    return <div className={cn("whitespace-pre pr-4", bg)} />
  }

  return (
    <div className={cn("whitespace-pre pr-4", bg)}>
      {line.tokens
        ? line.tokens.map((token, j) => (
            <span key={j.toString()} style={tokenStyle(token)}>
              {token.content}
            </span>
          ))
        : line.content}
    </div>
  )
}
