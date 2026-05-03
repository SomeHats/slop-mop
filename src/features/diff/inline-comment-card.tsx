import { Trash2 } from "lucide-react"
import type { Comment } from "@/lib/types"

export type InlineCommentCardProps = {
  comment: Comment
  onDelete: () => void
}

/**
 * The card shown inline in the diff under a commented line. Width matches the
 * full diff width (parent positions it absolutely with `left-0 right-0`); the
 * card itself just renders contents + a delete affordance.
 */
export function InlineCommentCard({
  comment,
  onDelete,
}: InlineCommentCardProps): React.JSX.Element {
  return (
    <div className="group flex items-start gap-2 border-y border-border bg-muted/30 px-3 py-2">
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-foreground">
        {comment.contents}
      </p>
      <button
        type="button"
        aria-label="Delete comment"
        onClick={onDelete}
        className="shrink-0 self-start text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}
