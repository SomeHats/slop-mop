import { Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { displayLocation, isOrphaned } from "./comments-format"
import type { CommentWithProjection } from "./use-session-comments"

export type CommentsPanelProps = {
  comments: CommentWithProjection[]
  /** Called when the user clicks a comment row. Implementer decides whether
   *  to scroll the diff in place or navigate the selection. */
  onJump: (commentId: string) => void
  onDelete: (commentId: string) => void
  className?: string
}

export function CommentsPanel({
  comments,
  onJump,
  onDelete,
  className,
}: CommentsPanelProps): React.JSX.Element | null {
  if (comments.length === 0) return null

  return (
    <div
      className={cn(
        "flex max-h-1/2 shrink-0 flex-col overflow-hidden border-t border-border bg-background",
        className,
      )}
      data-testid="comments-panel"
    >
      <div className="border-b border-border px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Comments ({comments.length})
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {comments.map(({ comment, projection }) => {
          const orphaned = isOrphaned(projection)
          return (
            <div
              key={comment.id}
              className="group flex items-start gap-2 border-b border-border px-3 py-2 last:border-b-0 hover:bg-muted/50"
            >
              <button
                type="button"
                onClick={() => onJump(comment.id)}
                className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
              >
                <div className="flex w-full items-center gap-2">
                  <span className="truncate text-[10px] text-muted-foreground">
                    {displayLocation(comment, projection)}
                  </span>
                  {orphaned && (
                    <Badge variant="destructive" className="ml-auto shrink-0 text-[10px]">
                      orphaned
                    </Badge>
                  )}
                </div>
                <p className="line-clamp-2 text-xs text-foreground">{comment.contents}</p>
              </button>
              <button
                type="button"
                aria-label="Delete comment"
                onClick={() => onDelete(comment.id)}
                className="shrink-0 self-center text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
