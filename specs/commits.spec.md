---
name: Session commit log
description: Walking git log to surface the commits belonging to a Claude session
---

# Session commit log

`list_session_commits` reads commits from `git log` and filters them by the [`Slop-Mop-Session-Id` trailer](git.spec.md). The chat sidebar uses this to seed its history on session resume — the realtime path is the `prompt-committed` event from the [auto-commit hooks](claude.spec.md).

## Walk

- !SCM-W1 Walks `revwalk().push_head()` from HEAD; topology order, no time-based buffering
- !SCM-W2 Filters commits by matching the `Slop-Mop-Session-Id` trailer against any id in the resolved set (the primary plus any aliased Claude session ids)
- !SCM-W3 Skips commits whose trailer block fails to parse (`message_trailers_strs` error) rather than aborting the walk
- !SCM-W4 Each result carries: commit hash, session id, subject (first line, prefix-as-stored), full message, and author timestamp in unix seconds

## Output

- !SCM-O1 `prompt` is the subject as stored in the commit (may carry a branch prefix); the sidebar strips the *current* prefix at display time
- !SCM-O2 `message` is the full commit message body — used as the row's hover-title
- !SCM-O3 Result is newest-first because revwalk yields children before parents

## current_prefix

- !SCM-P1 `list_session_commits` also returns the prefix that *new* commits would carry (delegates to `project::current_prefix`) so the sidebar can strip it consistently
- !SCM-P2 Returns `None` when no prefix applies (mode=`none`, detached HEAD, or settings unreadable)

## Session aliasing

A single slop-mop session can correspond to multiple Claude session ids — Claude issues a fresh id on `/clear`, `/compact`, etc., and the user gets to decide whether that's a continuation (alias) or a fresh start.

- !SCM-AL1 `walk_session_commits` accepts a list of Claude session ids and matches the trailer against any of them; the row's `session_id` field surfaces the *primary* id regardless of which alias the trailer carried
- !SCM-AL2 `expand_session_ids(primary)` returns `[primary, ...aliases]` — the primary itself is always implicitly part of the set, even with no rows in `session_aliases`
- !SCM-AL3 `add_session_alias(claude_id, primary_id)` upserts an alias row; self-aliases (`claude_id == primary_id`) are no-ops since the primary is implicit
- !SCM-AL4 `resolve_primary_session_id(claude_id)` returns the primary the id maps to via `session_aliases`, or the input itself when unaliased — used at session-start so resuming an aliased Claude session lands on the original primary
- !SCM-AL5 `list_session_commits` resolves the input via `resolve_primary_session_id` before expanding/walking, and returns the resolved `primary_session_id` in the result so the frontend can anchor its `sessionId` on it
