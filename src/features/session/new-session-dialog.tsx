import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { PendingNewSession } from "@/hooks/use-claude-session"

export type NewSessionDialogProps = {
  pending: PendingNewSession | null
  /** User picked "this is a new task" — start a fresh slop-mop session. */
  onAccept: () => void
  /** User picked "same task, fresh context" — alias the new claude id under
   *  the existing primary. */
  onAlias: () => void
}

function describeSource(source: string): string {
  switch (source) {
    case "clear":
      return "Claude's context was cleared (`/clear`)."
    case "compact":
      return "Claude compacted its context (`/compact`)."
    case "resume":
      return "A resumed Claude session was started."
    default:
      return `Claude reported a new session (source: ${source}).`
  }
}

/**
 * Surfaced when Claude issues a fresh session id mid-flow. The user picks
 * whether this is conceptually the same task (alias) or a fresh start (new
 * primary). The dialog is non-dismissible — one of the two has to be picked
 * so the rest of the UI knows which session to anchor to.
 */
// woke2 impl SES-DG1, SES-DG2, SES-DG3, SES-DG4
export function NewSessionDialog({
  pending,
  onAccept,
  onAlias,
}: NewSessionDialogProps): React.JSX.Element {
  return (
    <Dialog open={pending !== null}>
      <DialogContent
        showCloseButton={false}
        // Block both Esc and outside-click — the user has to choose.
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>New Claude session detected</DialogTitle>
          <DialogDescription>
            {pending ? describeSource(pending.source) : ""} What would you like to do with the
            review history so far?
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 px-4 py-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onAccept}>
            Clear
          </Button>
          <Button type="button" className="flex-1" onClick={onAlias} autoFocus>
            Keep history
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
