import { useEffect, useMemo, useState } from "react"
import type { CommentWithProjection } from "@/features/comments/use-session-comments"
import { getFileLines } from "@/lib/tauri"
import type { FileDiff, Selection } from "@/lib/types"

/**
 * For each non-orphaned comment whose anchor file is missing from `fileDiffs`,
 * fetches the file's lines at the diff's right-side target (selection.newer,
 * or workdir when null) and synthesises a single-hunk all-context FileDiff so
 * the file shows up in the diff view and its commented lines stay visible.
 *
 * `status` on synthesised entries is `"unchanged"` so the UI can distinguish
 * them from real changes.
 */
// woke2 impl DV-CO1, DV-CO2, DV-CO3, DV-CO4
export function useCommentOnlyFileDiffs(
  projectPath: string,
  selection: Selection | null,
  comments: CommentWithProjection[],
  fileDiffs: FileDiff[],
): FileDiff[] {
  // Stable string key over the (sorted) set of missing paths and the target,
  // so we don't refetch when an unrelated bit of state churns.
  const { missingPaths, targetCommit, key } = useMemo(() => {
    const inDiff = new Set(fileDiffs.map((f) => f.path))
    const set = new Set<string>()
    for (const { comment, projection } of comments) {
      if (projection?.kind !== "located") continue
      const path = projection.path ?? comment.file_path
      if (inDiff.has(path)) continue
      set.add(path)
    }
    const sorted = [...set].sort()
    const target = selection?.newer ?? null
    return {
      missingPaths: sorted,
      targetCommit: target,
      key: `${target ?? ""}|${sorted.join("|")}`,
    }
  }, [comments, fileDiffs, selection])

  const [extras, setExtras] = useState<FileDiff[]>([])

  useEffect(() => {
    if (missingPaths.length === 0) {
      setExtras([])
      return
    }
    let cancelled = false
    void Promise.all(
      missingPaths.map((path) =>
        getFileLines(projectPath, path, targetCommit).then(
          (lines) => ({ path, lines }),
          () => ({ path, lines: null }),
        ),
      ),
    ).then((results) => {
      if (cancelled) return
      const out: FileDiff[] = []
      for (const { path, lines } of results) {
        if (!lines || lines.length === 0) continue
        out.push(synthesiseFileDiff(path, lines))
      }
      setExtras(out)
    })
    return () => {
      cancelled = true
    }
    // `key` already encodes missingPaths + targetCommit, but we list the
    // primitive deps too so eslint can verify them.
  }, [projectPath, key, missingPaths, targetCommit])

  return extras
}

// woke2 impl DV-CO5
function synthesiseFileDiff(path: string, lines: string[]): FileDiff {
  return {
    path,
    status: "unchanged",
    old_path: null,
    additions: 0,
    deletions: 0,
    hunks: [
      {
        old_start: 1,
        old_lines: lines.length,
        new_start: 1,
        new_lines: lines.length,
        lines: lines.map((content, i) => ({
          origin: " ",
          content,
          old_line_no: i + 1,
          new_line_no: i + 1,
        })),
      },
    ],
  }
}
