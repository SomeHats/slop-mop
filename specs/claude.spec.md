---
name: Claude PTY supervision and auto-commit hooks
description: Spawning Claude under a PTY, the hook HTTP server, and the UserPromptSubmit / Stop / SessionStart handlers that drive auto-commits
---

# Claude PTY supervision and auto-commits

The backend wraps Claude Code in a PTY and pipes its `UserPromptSubmit`, `SessionStart`, and `Stop` hooks at a localhost HTTP server. Each prompt becomes one (or two) git commits carrying a session trailer. See [git plumbing](git.spec.md) and [session commit log](commits.spec.md).

## Process lifecycle

- !AC-SP1 `spawn_claude` writes a temp `slop-mop-{agent_id}.json` Claude settings file with `UserPromptSubmit`, `SessionStart`, and `Stop` hooks that POST to a localhost HTTP server bound to a random port
- !AC-SP2 Claude runs through the user's login+interactive shell (`$SHELL -ilc`) so it inherits the user's full environment (PATH, nvm/fnm/mise shims, secrets)
- !AC-SP3 PTY environment forces `TERM=xterm-256color` and `COLORTERM=truecolor` for consistent 24-bit color between `pnpm dev` and a bundled `.app`
- !AC-SP4 Uses `exec claude …` so signals and TTY ownership flow naturally from the shell to claude
- !AC-SP5 Passes `--resume` to claude when the caller asks to resume a session
- !AC-SP6 Quotes the settings path with single-quote shell escaping so paths containing apostrophes survive the `-ilc` boundary
- !AC-SP7 Spawning replaces any prior process for the same window label (frontend-reload safety)
- !AC-SP8 PTY opens at 40 rows × 120 cols by default

## I/O streaming

- !AC-IO1 Reader thread streams up to 4096 bytes per `read`, base64-encodes the chunk, and emits a `claude-output` event so ANSI/UTF-8 sequences survive the JSON round-trip
- !AC-IO2 On EOF or read error the reader thread emits `claude-exit` and reaps the child
- !AC-IO3 `write_claude_stdin` decodes base64 from the frontend before writing — keeps arbitrary key sequences (Ctrl, arrow keys, paste) intact
- !AC-IO4 `resize_claude` resizes the PTY master to the given cols/rows so the terminal feature can match the window

## Process teardown

- !AC-KL1 `kill_claude` and window-destroy both kill the child, unblock the hook server, and delete the temp settings file
- !AC-KL2 `kill_for_window` removes every agent attached to a given window label

## Hook HTTP server

- !AC-HS1 Listener uses `recv_timeout(500ms)` so it exits promptly when shutdown calls `unblock` on the server
- !AC-HS2 Non-POST requests respond `405 method not allowed`
- !AC-HS3 Malformed JSON or unreadable bodies still respond `200` so a hook failure never hangs claude
- !AC-HS4 `project_id` and `agent_id` are parsed from the URL query string with percent-decoding (also `+` → space)
- !AC-HS5 Unknown paths log and respond 200 without acting

## UserPromptSubmit handler

- !AC-PR1 Emits `agent-busy` on prompt submit; paired with the `agent-idle` emitted on every Stop exit path
- !AC-PR2 Caches the submitted prompt on the agent's `pending_prompt` so the Stop handler can use it as the commit body
- !AC-PR3 Stages the working tree and commits a "check point" only when the tree was already dirty (pre-prompt user work)
- !AC-PR4 Checkpoint commits omit the `Prompt:` body since they predate any prompt
- !AC-PR5 Skips checkpoint when the hook payload lacks a cwd or `session_id`

## Stop handler

- !AC-ST1 `agent-idle` is emitted on every exit path of the Stop handler (wrapper guarantees the UI never gets stuck busy)
- !AC-ST2 Stop is a no-op when the prompt was never seen, cwd is missing, `session_id` is empty, or the working tree is clean after staging
- !AC-ST3 Commits whatever Claude changed with the cached prompt rendered as a `Prompt: …` body line
- !AC-ST4 Falls back to the prompt's first line as the subject if `claude -p` is unavailable

## Commit message generation

- !AC-CM1 `claude -p` runs through the user's login shell so it inherits PATH/credentials needed to authenticate
- !AC-CM2 If `claude -p` exits non-zero or returns empty output, falls back to the caller-supplied subject — never lose a commit
- !AC-CM3 When applying our own branch prefix, strips any claude-supplied prefix (`feat: `, `alex/foo: `) first to avoid double-prefixing
- !AC-CM4 Strip preserves the subject untouched when the candidate prefix contains non-slug characters (parens, dots, spaces) or has empty segments
- !AC-CM5 Slug segment grammar: starts with ASCII letter, followed by ASCII alphanumerics or `-`; rejected otherwise
- !AC-CM6 Strips only the first `prefix: ` match — a trailing `: ` inside the body is left in place
- !AC-CM7 With `mode = none` the original claude output is left untouched (opting out of prefixing means opting out entirely)
- !AC-CM8 Applies the project's resolved branch prefix as `<prefix>: <subject>` when one is configured
- !AC-CM9 Two trailing newlines after the body keep `Prompt:` from being absorbed into git's trailer block by `interpret-trailers`

## Commit emission events

- !AC-EM1 Brackets each in-flight commit with `commit-started` / `commit-finished` window events
- !AC-EM2 After committing, emits `prompt-committed` with hash, prompt subject, full message body, and unix timestamp
- !AC-EM3 Reads the freshly-committed message back from git so the realtime payload matches what `list_session_commits` will return on reload

## SessionStart handler

- !AC-SS1 Persists Claude's reported `session_id` on the matching agent so subsequent commits can carry it as a trailer
- !AC-SS2 Emits `session-started` with the source string (`startup` / `resume` / `clear` / `compact`) so the UI can hide its "new session" overlay
- !AC-SS3 Skips emission when the session_id field is empty
