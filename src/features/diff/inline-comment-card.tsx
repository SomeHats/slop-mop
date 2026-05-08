import { Pencil, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { Comment } from "@/lib/types"

export type InlineCommentCardProps = {
  comment: Comment
  onDelete: () => void
  onUpdate: (contents: string) => Promise<void> | void
}

/**
 * The card shown inline in the diff under a commented line. Width matches the
 * full diff width (parent positions it absolutely with `left-0 right-0`); the
 * card itself just renders contents + delete/edit affordances.
 */
// woke2 impl DV-IC1, DV-IC2
export function InlineCommentCard({
  comment,
  onDelete,
  onUpdate,
}: InlineCommentCardProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.contents)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // woke2 impl DV-IC4
  useEffect(() => {
    if (editing) textareaRef.current?.focus()
  }, [editing])

  // woke2 impl DV-IC3
  const beginEdit = (): void => {
    setDraft(comment.contents)
    setEditing(true)
  }

  const cancel = (): void => {
    setDraft(comment.contents)
    setEditing(false)
  }

  const save = async (): Promise<void> => {
    const trimmed = draft.trim()
    // woke2 impl DV-IC5
    if (!trimmed || trimmed === comment.contents) {
      setEditing(false)
      return
    }
    // woke2 impl DV-IC7
    await onUpdate(trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
        className="flex w-full flex-col gap-2 border-y border-border bg-muted/30 px-3 py-2"
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // woke2 impl DV-IC6
            if (e.key === "Escape") {
              e.preventDefault()
              cancel()
            } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault()
              void save()
            }
          }}
          rows={3}
          className="w-full resize-y border border-border bg-input/30 px-2 py-1 text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
        />
        <div className="flex items-center justify-end gap-2">
          <Button type="button" size="xs" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button type="submit" size="xs" disabled={!draft.trim()}>
            Save
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="group flex items-start gap-2 border-y border-border bg-muted/30 px-3 py-2">
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-foreground">
        {comment.contents}
      </p>
      <div className="flex shrink-0 items-center gap-1 self-start opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          aria-label="Edit comment"
          onClick={beginEdit}
          className="text-muted-foreground hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Delete comment"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
