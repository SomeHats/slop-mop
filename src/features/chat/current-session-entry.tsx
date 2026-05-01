import { Loader2, Terminal } from "lucide-react"
import { cn } from "@/lib/utils"

type CurrentSessionEntryProps = {
  selected: boolean
  onSelect: () => void
  committing?: boolean
}

export function CurrentSessionEntry({
  selected,
  onSelect,
  committing = false,
}: CurrentSessionEntryProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 border-b border-border bg-background px-3 py-2 text-left transition-colors hover:bg-accent",
        selected && "bg-accent",
      )}
    >
      <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="text-xs font-medium text-foreground">Current Session</span>
      {committing && (
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          committing…
        </span>
      )}
    </button>
  )
}
