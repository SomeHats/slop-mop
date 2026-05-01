import { Terminal } from "lucide-react"
import { cn } from "@/lib/utils"

type CurrentSessionEntryProps = {
  selected: boolean
  onSelect: () => void
}

export function CurrentSessionEntry({
  selected,
  onSelect,
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
    </button>
  )
}
