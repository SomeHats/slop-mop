---
name: Session commit log
description: Walking git log to surface the commits belonging to a Claude session
---

# Session commit log

`list_session_commits` reads commits from `git log` and filters them by the [`Slop-Mop-Session-Id` trailer](git.spec.md). The chat sidebar uses this to seed its history on session resume — the realtime path is the `prompt-committed` event from the [auto-commit hooks](claude.spec.md).

## Walk

- !SCM-W1 Walks `revwalk().push_head()` from HEAD; topology order, no time-based buffering
- !SCM-W2 Filters commits by matching the `Slop-Mop-Session-Id` trailer to the requested session id
- !SCM-W3 Skips commits whose trailer block fails to parse (`message_trailers_strs` error) rather than aborting the walk
- !SCM-W4 Each result carries: commit hash, session id, subject (first line, prefix-as-stored), full message, and author timestamp in unix seconds

## Output

- !SCM-O1 `prompt` is the subject as stored in the commit (may carry a branch prefix); the sidebar strips the *current* prefix at display time
- !SCM-O2 `message` is the full commit message body — used as the row's hover-title
- !SCM-O3 Result is newest-first because revwalk yields children before parents

## current_prefix

- !SCM-P1 `list_session_commits` also returns the prefix that *new* commits would carry (delegates to `project::current_prefix`) so the sidebar can strip it consistently
- !SCM-P2 Returns `None` when no prefix applies (mode=`none`, detached HEAD, or settings unreadable)
