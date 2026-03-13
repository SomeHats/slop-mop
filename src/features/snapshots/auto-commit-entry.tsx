import { Eye, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { AutoCommitPhase } from "@/lib/types"

type AutoCommitEntryProps = {
  phase: AutoCommitPhase
  onViewOutput: () => void
}

export function AutoCommitEntry({ phase, onViewOutput }: AutoCommitEntryProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
      {phase.status === "running" ? (
        <>
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Auto-committing...</span>
        </>
      ) : (
        <>
          <span className="text-xs text-muted-foreground">Auto-commit</span>
          <Badge variant="destructive" className="text-[10px]">
            failed
          </Badge>
          <button
            type="button"
            className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onViewOutput}
          >
            <Eye className="size-3.5" />
          </button>
        </>
      )}
    </div>
  )
}
