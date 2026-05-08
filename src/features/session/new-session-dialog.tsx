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
// woke2 impl SES-DG1, SES-DG2, SES-DG3
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
        <div className="flex flex-col gap-2">
          <Button type="button" onClick={onAlias}>
            Same task, fresh context
          </Button>
          <p className="px-1 text-[11px] text-muted-foreground">
            Keep the current review session and treat the new Claude session as part of it.
            Comments and history stay.
          </p>
          <Button type="button" variant="outline" onClick={onAccept}>
            Start a new task
          </Button>
          <p className="px-1 text-[11px] text-muted-foreground">
            Begin a fresh slop-mop session. The history pane will reflect only commits made under
            the new Claude session.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
