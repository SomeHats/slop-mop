import { cn } from "@/lib/utils"

type PathSegmentSelectorProps = {
  path: string
  selectedPrefix: string
  onSelectPrefix: (prefix: string) => void
}

export function PathSegmentSelector({
  path,
  selectedPrefix,
  onSelectPrefix,
}: PathSegmentSelectorProps): React.JSX.Element {
  const segments = path.split("/").filter(Boolean)

  const prefixForIndex = (index: number): string => {
    return `/${segments.slice(0, index + 1).join("/")}`
  }

  const selectedIndex = segments.findIndex((_, i) => prefixForIndex(i) === selectedPrefix)
  const effectiveIndex = selectedIndex === -1 ? segments.length - 1 : selectedIndex
  const isLastSelected = effectiveIndex === segments.length - 1

  return (
    <div className="flex flex-wrap items-center gap-0.5 text-xs">
      <span className="text-muted-foreground/40">/</span>
      {segments.map((segment, i) => {
        const prefix = prefixForIndex(i)
        const isSelected = i === effectiveIndex
        const isDescendant = i > effectiveIndex

        return (
          <span key={prefix} className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onSelectPrefix(prefix)}
              className={cn(
                "px-0.5 hover:text-foreground",
                isSelected && "text-foreground underline underline-offset-2 decoration-foreground",
                !isSelected && !isDescendant && "text-muted-foreground",
                isDescendant && "text-muted-foreground/40 line-through",
              )}
            >
              {segment}
            </button>
            {isSelected && !isLastSelected ? (
              <span className="text-muted-foreground">/{"*"}</span>
            ) : i < segments.length - 1 ? (
              <span
                className={cn(isDescendant ? "text-muted-foreground/40" : "text-muted-foreground")}
              >
                /
              </span>
            ) : null}
          </span>
        )
      })}
    </div>
  )
}
