import { Loader2 } from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { getFileBytes, resolveBeforeTarget } from "@/lib/tauri"
import type { FileBytesResult, FileDiff, Selection } from "@/lib/types"
import { cn } from "@/lib/utils"
import { computeImageScale, type ImageDiffMode, type NaturalSize } from "./image-diff-scale"

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  added: "default",
  deleted: "destructive",
  modified: "secondary",
  renamed: "outline",
}

export type ImageDiffProps = {
  projectPath: string
  file: FileDiff
  selection: Selection
}

type SideState =
  | { kind: "loading" }
  | { kind: "ok"; dataUrl: string; mime: string }
  | { kind: "missing" }
  | { kind: "too_large"; size: number }
  | { kind: "error"; message: string }
  | { kind: "absent" } // before doesn't exist (added) or after doesn't exist (deleted)

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function resultToSide(r: FileBytesResult): SideState {
  switch (r.kind) {
    case "ok":
      return { kind: "ok", dataUrl: `data:${r.mime};base64,${r.data}`, mime: r.mime }
    case "missing":
      return { kind: "missing" }
    case "too_large":
      return { kind: "too_large", size: r.size }
  }
}

// woke2 impl DV-IMG-2
export function ImageDiff({ projectPath, file, selection }: ImageDiffProps): React.JSX.Element {
  // woke2 impl DV-IMG-6
  const [mode, setMode] = useState<ImageDiffMode>("2-up")
  const [before, setBefore] = useState<SideState>({ kind: "loading" })
  const [after, setAfter] = useState<SideState>({ kind: "loading" })
  const [beforeSize, setBeforeSize] = useState<NaturalSize | null>(null)
  const [afterSize, setAfterSize] = useState<NaturalSize | null>(null)
  const [fadeValue, setFadeValue] = useState(0.5)
  const [wipeFraction, setWipeFraction] = useState(0.5)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState<number>(800)

  // woke2 impl DV-IMG-5
  // Cancellation flag for fetches when file/selection changes.
  useEffect(() => {
    let cancelled = false
    setBefore({ kind: "loading" })
    setAfter({ kind: "loading" })
    setBeforeSize(null)
    setAfterSize(null)

    const beforePath = file.old_path ?? file.path
    const isAdded = file.status === "added"
    const isDeleted = file.status === "deleted"

    // woke2 impl DV-IMG-3
    async function load(): Promise<void> {
      // Before side
      if (isAdded) {
        if (!cancelled) setBefore({ kind: "absent" })
      } else {
        try {
          const beforeCommit = await resolveBeforeTarget(projectPath, selection.older)
          if (cancelled) return
          // woke2 impl DV-IMG-4
          const r = await getFileBytes(projectPath, beforePath, beforeCommit)
          if (!cancelled) setBefore(resultToSide(r))
        } catch (e) {
          if (!cancelled) {
            setBefore({ kind: "error", message: e instanceof Error ? e.message : String(e) })
          }
        }
      }

      // After side
      if (isDeleted) {
        if (!cancelled) setAfter({ kind: "absent" })
      } else {
        try {
          const r = await getFileBytes(projectPath, file.path, selection.newer)
          if (!cancelled) setAfter(resultToSide(r))
        } catch (e) {
          if (!cancelled) {
            setAfter({ kind: "error", message: e instanceof Error ? e.message : String(e) })
          }
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [projectPath, file.path, file.old_path, file.status, selection.older, selection.newer])

  // Measure container width for scaling.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(() => {
      const w = el.clientWidth
      if (w > 0) setContainerWidth(w)
    })
    obs.observe(el)
    setContainerWidth(el.clientWidth || 800)
    return () => obs.disconnect()
  }, [])

  const hasBefore = before.kind === "ok"
  const hasAfter = after.kind === "ok"
  const singleSided = before.kind === "absent" || after.kind === "absent"

  // woke2 impl DV-IMG-8
  // Force 2-up when one side is absent; the other mode buttons are hidden.
  useEffect(() => {
    if (singleSided && mode !== "2-up") setMode("2-up")
  }, [singleSided, mode])

  const { scale, boxW, boxH } = useMemo(
    () => computeImageScale({ beforeSize, afterSize, mode, containerWidth }),
    [beforeSize, afterSize, mode, containerWidth],
  )

  const beforeDims = beforeSize
    ? { w: Math.round(beforeSize.w * scale), h: Math.round(beforeSize.h * scale) }
    : null
  const afterDims = afterSize
    ? { w: Math.round(afterSize.w * scale), h: Math.round(afterSize.h * scale) }
    : null

  return (
    <div className="border border-border bg-background">
      <div className="sticky top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border bg-background px-3 py-1.5">
        <span className="min-w-0 truncate text-xs font-medium text-foreground">{file.path}</span>
        {
          // woke2 impl DV-IMG-7
        }
        <div className="flex items-center gap-px justify-self-center">
          <ModeButton label="2-up" active={mode === "2-up"} onClick={() => setMode("2-up")} />
          {!singleSided && (
            <>
              <ModeButton label="Fade" active={mode === "fade"} onClick={() => setMode("fade")} />
              <ModeButton label="Wipe" active={mode === "wipe"} onClick={() => setMode("wipe")} />
            </>
          )}
        </div>
        <Badge
          variant={STATUS_VARIANTS[file.status] ?? "secondary"}
          className="justify-self-end text-[10px]"
        >
          {file.status}
        </Badge>
      </div>
      {file.old_path ? (
        <div className="border-b border-border bg-background px-3 py-0.5">
          <span className="text-[10px] text-muted-foreground">from {file.old_path}</span>
        </div>
      ) : null}

      <div ref={containerRef} className="p-3">
        {mode === "2-up" ? (
          // woke2 impl DV-IMG-10
          <div className="flex gap-2">
            <SideSlot
              state={before}
              dims={beforeDims}
              onLoadedSize={setBeforeSize}
              label="before"
            />
            <SideSlot state={after} dims={afterDims} onLoadedSize={setAfterSize} label="after" />
          </div>
        ) : mode === "fade" ? (
          // woke2 impl DV-IMG-11
          <div className="flex flex-col items-center gap-2">
            <OverlayBox
              boxW={boxW}
              boxH={boxH}
              before={hasBefore ? before.dataUrl : null}
              after={hasAfter ? after.dataUrl : null}
              afterOpacity={fadeValue}
              onBeforeLoadedSize={setBeforeSize}
              onAfterLoadedSize={setAfterSize}
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={fadeValue}
              onChange={(e) => setFadeValue(Number.parseFloat(e.target.value))}
              className="w-2/3"
              aria-label="Crossfade blend"
            />
          </div>
        ) : (
          // woke2 impl DV-IMG-12
          <div className="flex justify-center">
            <WipeBox
              boxW={boxW}
              boxH={boxH}
              before={hasBefore ? before.dataUrl : null}
              after={hasAfter ? after.dataUrl : null}
              fraction={wipeFraction}
              setFraction={setWipeFraction}
              onBeforeLoadedSize={setBeforeSize}
              onAfterLoadedSize={setAfterSize}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function ModeButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2 py-0.5 text-[10px] font-medium border border-border",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  )
}

function SideSlot({
  state,
  dims,
  onLoadedSize,
  label,
}: {
  state: SideState
  dims: { w: number; h: number } | null
  onLoadedSize: (s: NaturalSize) => void
  label: "before" | "after"
}): React.JSX.Element {
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center gap-1">
      <SideContent state={state} dims={dims} onLoadedSize={onLoadedSize} />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  )
}

function SideContent({
  state,
  dims,
  onLoadedSize,
}: {
  state: SideState
  dims: { w: number; h: number } | null
  onLoadedSize: (s: NaturalSize) => void
}): React.JSX.Element {
  if (state.kind === "loading") {
    return (
      <div className="flex h-32 w-full items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (state.kind === "missing") {
    return <SideLabel text="Missing" />
  }
  if (state.kind === "absent") {
    return <SideLabel text="—" />
  }
  if (state.kind === "too_large") {
    return <SideLabel text={`Too large to preview (${formatBytes(state.size)})`} />
  }
  if (state.kind === "error") {
    return <SideLabel text={`Failed to load: ${state.message}`} />
  }
  // ok
  return (
    <img
      src={state.dataUrl}
      alt=""
      onLoad={(e) => {
        const img = e.currentTarget
        onLoadedSize({ w: img.naturalWidth, h: img.naturalHeight })
      }}
      style={dims ? { width: dims.w, height: dims.h } : undefined}
      className="block max-w-full"
    />
  )
}

function SideLabel({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="flex h-24 w-full items-center justify-center border border-dashed border-border">
      <span className="text-[10px] text-muted-foreground">{text}</span>
    </div>
  )
}

function OverlayBox({
  boxW,
  boxH,
  before,
  after,
  afterOpacity,
  onBeforeLoadedSize,
  onAfterLoadedSize,
}: {
  boxW: number
  boxH: number
  before: string | null
  after: string | null
  afterOpacity: number
  onBeforeLoadedSize: (s: NaturalSize) => void
  onAfterLoadedSize: (s: NaturalSize) => void
}): React.JSX.Element {
  const style: React.CSSProperties =
    boxW > 0 && boxH > 0 ? { width: boxW, height: boxH } : { minHeight: 96 }
  return (
    <div className="relative" style={style}>
      {before && (
        <img
          src={before}
          alt=""
          onLoad={(e) => {
            const img = e.currentTarget
            onBeforeLoadedSize({ w: img.naturalWidth, h: img.naturalHeight })
          }}
          className="absolute inset-0 block h-full w-full object-contain"
        />
      )}
      {after && (
        <img
          src={after}
          alt=""
          onLoad={(e) => {
            const img = e.currentTarget
            onAfterLoadedSize({ w: img.naturalWidth, h: img.naturalHeight })
          }}
          style={{ opacity: afterOpacity }}
          className="absolute inset-0 block h-full w-full object-contain"
        />
      )}
    </div>
  )
}

function WipeBox({
  boxW,
  boxH,
  before,
  after,
  fraction,
  setFraction,
  onBeforeLoadedSize,
  onAfterLoadedSize,
}: {
  boxW: number
  boxH: number
  before: string | null
  after: string | null
  fraction: number
  setFraction: (n: number) => void
  onBeforeLoadedSize: (s: NaturalSize) => void
  onAfterLoadedSize: (s: NaturalSize) => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)

  function updateFromClientX(clientX: number): void {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return
    const x = clientX - rect.left
    const f = Math.max(0, Math.min(1, x / rect.width))
    setFraction(f)
  }

  useEffect(() => {
    function onMove(e: MouseEvent): void {
      if (!draggingRef.current) return
      updateFromClientX(e.clientX)
    }
    function onUp(): void {
      draggingRef.current = false
      document.body.style.userSelect = ""
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  })

  const style: React.CSSProperties =
    boxW > 0 && boxH > 0 ? { width: boxW, height: boxH } : { minHeight: 96, width: "100%" }

  return (
    <div
      ref={ref}
      className="relative cursor-ew-resize select-none"
      style={style}
      onMouseDown={(e) => {
        draggingRef.current = true
        document.body.style.userSelect = "none"
        updateFromClientX(e.clientX)
      }}
    >
      {before && (
        <img
          src={before}
          alt=""
          onLoad={(e) => {
            const img = e.currentTarget
            onBeforeLoadedSize({ w: img.naturalWidth, h: img.naturalHeight })
          }}
          className="absolute inset-0 block h-full w-full object-contain pointer-events-none"
        />
      )}
      {after && (
        <img
          src={after}
          alt=""
          onLoad={(e) => {
            const img = e.currentTarget
            onAfterLoadedSize({ w: img.naturalWidth, h: img.naturalHeight })
          }}
          style={{ clipPath: `inset(0 0 0 ${fraction * 100}%)` }}
          className="absolute inset-0 block h-full w-full object-contain pointer-events-none"
        />
      )}
      <div
        className="absolute top-0 bottom-0 w-px bg-primary pointer-events-none"
        style={{ left: `${fraction * 100}%` }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-5 border border-primary bg-background flex items-center justify-center">
          <span className="text-[10px] leading-none text-primary">⇔</span>
        </div>
      </div>
    </div>
  )
}
