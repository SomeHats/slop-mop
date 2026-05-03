import { Loader2 } from "lucide-react"
import { useEffect, useImperativeHandle, useMemo, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { CommentWithProjection } from "@/features/comments/use-session-comments"
import type { FileDiff, Selection, SessionCommit } from "@/lib/types"
import { commentAnchorLine } from "./diff-layout"
import { type InlineComment, SideBySideDiff } from "./side-by-side-diff"

export type DiffPanelHandle = {
  /** Scroll the right-side `lineNo` of `filePath` into view. Returns true on success. */
  scrollToLine: (filePath: string, lineNo: number) => boolean
}

type DiffPanelProps = {
  fileDiffs: FileDiff[]
  isLoading: boolean
  selection: Selection | null
  commits: SessionCommit[]
  commentingEnabled: boolean
  comments: CommentWithProjection[]
  onDeleteComment: (id: string) => void
  onSubmitComment?:
    | ((
        filePath: string,
        rangeStart: number,
        rangeEnd: number | null,
        contents: string,
      ) => Promise<void> | void)
    | undefined
  handleRef?: React.MutableRefObject<DiffPanelHandle | null> | undefined
}

export function DiffPanel({
  fileDiffs,
  isLoading,
  selection,
  commits,
  commentingEnabled,
  comments,
  onDeleteComment,
  onSubmitComment,
  handleRef,
}: DiffPanelProps): React.JSX.Element {
  const fileScrollRefs = useRef<
    Map<string, React.MutableRefObject<((lineNo: number) => void) | null>>
  >(new Map())

  useImperativeHandle(
    handleRef,
    () => ({
      scrollToLine: (filePath, lineNo) => {
        const ref = fileScrollRefs.current.get(filePath)
        if (ref?.current) {
          ref.current(lineNo)
          return true
        }
        return false
      },
    }),
    [],
  )

  // Drop refs for files that have left the diff so the map doesn't grow forever.
  useEffect(() => {
    const present = new Set(fileDiffs.map((f) => f.path))
    for (const key of fileScrollRefs.current.keys()) {
      if (!present.has(key)) fileScrollRefs.current.delete(key)
    }
  }, [fileDiffs])

  function refForFile(path: string): React.MutableRefObject<((lineNo: number) => void) | null> {
    let ref = fileScrollRefs.current.get(path)
    if (!ref) {
      ref = { current: null }
      fileScrollRefs.current.set(path, ref)
    }
    return ref
  }

  // Group projected comments by file. Only `located` projections are inlined;
  // orphaned ones stay sidebar-only. The `path` from the projection wins on
  // rename, otherwise we fall back to the comment's anchor file path.
  const inlineCommentsByFile = useMemo(() => {
    const map = new Map<string, InlineComment[]>()
    for (const { comment, projection } of comments) {
      if (projection?.kind !== "located") continue
      const path = projection.path ?? comment.file_path
      const anchorLine = commentAnchorLine(projection.end, projection.start)
      const list = map.get(path)
      const entry: InlineComment = { comment, anchorLine }
      if (list) list.push(entry)
      else map.set(path, [entry])
    }
    return map
  }, [comments])

  if (!selection) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Select a prompt to view diffs</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Single-commit view: older === newer && both non-null. Show its message above the diff.
  const singleCommit =
    selection.older !== null && selection.older === selection.newer
      ? (commits.find((c) => c.commit_hash === selection.older) ?? null)
      : null

  if (fileDiffs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">No changes in this range</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full overflow-hidden [&>[data-slot=scroll-area-viewport]>div]:!block">
      <div className="flex flex-col gap-3 p-3">
        {singleCommit && (
          <div className="border border-border bg-muted/30 px-3 py-2">
            <p className="whitespace-pre-wrap text-xs text-foreground">{singleCommit.prompt}</p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              {singleCommit.commit_hash.slice(0, 7)}
            </p>
          </div>
        )}
        {fileDiffs.map((file) => (
          <SideBySideDiff
            key={file.path}
            file={file}
            commentingEnabled={commentingEnabled}
            inlineComments={inlineCommentsByFile.get(file.path) ?? []}
            onDeleteComment={onDeleteComment}
            onSubmitComment={onSubmitComment}
            scrollLineRef={refForFile(file.path)}
          />
        ))}
      </div>
    </ScrollArea>
  )
}
