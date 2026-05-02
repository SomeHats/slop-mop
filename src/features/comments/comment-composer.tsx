import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

export type CommentComposerProps = {
  rangeStart: number
  rangeEnd: number | null
  onSubmit: (contents: string) => void
  onCancel: () => void
}

/**
 * Inline composer for a new comment. Anchored just below the selected line(s)
 * by the parent. Submits non-empty contents only; Esc cancels.
 */
export function CommentComposer({
  rangeStart,
  rangeEnd,
  onSubmit,
  onCancel,
}: CommentComposerProps): React.JSX.Element {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const submit = (): void => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  const label = rangeEnd === null ? `Line ${rangeStart}` : `Lines ${rangeStart}–${rangeEnd}`

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="flex w-full flex-col gap-2 border border-border bg-background p-2"
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            onCancel()
          } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault()
            submit()
          }
        }}
        rows={3}
        placeholder="Leave a comment…"
        className="w-full resize-y border border-border bg-input/30 px-2 py-1 text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
      />
      <div className="flex items-center justify-end gap-2">
        <Button type="button" size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="xs" disabled={!value.trim()}>
          Comment
        </Button>
      </div>
    </form>
  )
}
