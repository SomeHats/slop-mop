import { Trash2 } from "lucide-react"
import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import type { ProjectionResult } from "@/lib/types"
import { cn } from "@/lib/utils"
import { displayLocation, isOrphaned } from "./comments-format"
import type { CommentWithProjection } from "./use-session-comments"

export type CommentsPanelProps = {
  comments: CommentWithProjection[]
  staged: Set<string>
  /** Flip a single comment's staged state. */
  onToggleStaged: (commentId: string) => void
  /** Stage (true) or unstage (false) every sendable comment. */
  onToggleAllStaged: (checked: boolean) => void
  /** Called when the user clicks a comment row. Implementer decides whether
   *  to scroll the diff in place or navigate the selection. */
  onJump: (commentId: string) => void
  onDelete: (commentId: string) => void
  className?: string
}

function reasonText(p: ProjectionResult | null): string {
  if (p === null) return "Checking projection…"
  if (p.kind === "orphaned") {
    return p.reason === "file_deleted"
      ? "File no longer exists in the working tree"
      : "Line no longer exists in the working tree"
  }
  return ""
}

export function CommentsPanel({
  comments,
  staged,
  onToggleStaged,
  onToggleAllStaged,
  onJump,
  onDelete,
  className,
}: CommentsPanelProps): React.JSX.Element | null {
  const { sendableCount, stagedSendableCount } = useMemo(() => {
    let sendable = 0
    let stagedSendable = 0
    for (const { comment, sessionProjection } of comments) {
      if (sessionProjection?.kind !== "located") continue
      sendable++
      if (staged.has(comment.id)) stagedSendable++
    }
    return { sendableCount: sendable, stagedSendableCount: stagedSendable }
  }, [comments, staged])

  if (comments.length === 0) return null

  const headerChecked: boolean | "indeterminate" =
    sendableCount === 0
      ? false
      : stagedSendableCount === 0
        ? false
        : stagedSendableCount === sendableCount
          ? true
          : "indeterminate"

  return (
    <div
      className={cn(
        "flex max-h-1/2 shrink-0 flex-col overflow-hidden border-t border-border bg-background",
        className,
      )}
      // Layout containment so checkbox toggles inside don't invalidate the
      // sibling diff panel's layout tree.
      style={{ contain: "layout style" }}
      data-testid="comments-panel"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <Checkbox
          checked={headerChecked}
          disabled={sendableCount === 0}
          onCheckedChange={(next) => onToggleAllStaged(next === true)}
          aria-label="Stage all comments"
        />
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Comments ({comments.length})
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {comments.map(({ comment, projection, sessionProjection }) => {
          const orphaned = isOrphaned(projection)
          const sendable = sessionProjection?.kind === "located"
          const checkboxTitle = sendable ? undefined : reasonText(sessionProjection)
          return (
            <div
              key={comment.id}
              className="group flex items-start gap-2 border-b border-border px-3 py-2 last:border-b-0 hover:bg-muted/50"
            >
              <span
                title={checkboxTitle}
                className="flex shrink-0 items-center self-stretch pt-0.5"
              >
                <Checkbox
                  checked={staged.has(comment.id)}
                  disabled={!sendable}
                  onCheckedChange={() => onToggleStaged(comment.id)}
                  aria-label={sendable ? "Stage comment" : "Comment is not stageable"}
                />
              </span>
              <button
                type="button"
                onClick={() => onJump(comment.id)}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-start gap-1 text-left",
                  !sendable && "opacity-60",
                )}
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
