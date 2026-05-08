# Untestable behaviors

Behaviors listed here are excluded from the woke2-coverage "missing test" report.
Each entry must justify why the behavior cannot be tested in automated CI.

## woke2 LSP extension (VS Code extension host required)

The woke2 LSP is a VS Code extension exercised through the editor's extension
host. Testing LSP handlers (hover, definition, references, completions,
diagnostics) and editor decorations requires a running VS Code instance with the
extension loaded — not feasible in headless CI. Pure parsing functions
(LSP-IX4, LSP-IX5) are tested separately via `npm test` in `tools/woke2-lsp/`.

- !LSP-IX1 — full workspace index on startup
- !LSP-IX2 — re-index on content change
- !LSP-IX3 — re-index on watched file changes
- !LSP-HV1 — hover shows definition text and reference counts
- !LSP-HV3 — hovering on a spec definition shows only impl/test counts: requires VS Code extension host
- !LSP-HV2 — hover range covers full ID
- !LSP-DEF1 — definition: pragma to spec
- !LSP-DEF2 — definition: spec to references with peek
- !LSP-DEF3 — LocationLink with originSelectionRange
- !LSP-DL1 — document links for pragma IDs
- !LSP-DL2 — document link holistic range
- !LSP-DL3 — spec files excluded from document links
- !LSP-REF1 — find references lists pragma sites
- !LSP-REF2 — includeDeclaration adds spec definition
- !LSP-CMP1 — completion after pragma prefix
- !LSP-CMP2 — completion items show definition detail
- !LSP-DG1 — diagnostic: duplicate IDs in specs
- !LSP-DG2 — diagnostic: orphan pragma IDs
- !LSP-DG3 — diagnostic lifecycle (publish/clear)
- !LSP-DC1 — bold + dotted underline decoration
- !LSP-DC2 — spec definition decoration
- !LSP-DC3 — pragma ID decoration
- !LSP-DC4 — decoration updates on editor events

## Tauri-runtime backend behaviors (require a real Tauri app context)

These commands and event handlers run inside the Tauri runtime — they need a
real `AppHandle`, native window, PTY system, or `tauri-plugin-dialog`. The pure
helpers they delegate to (`derive_branch_prefix`, `strip_subject_prefix`,
projection logic, etc.) are exhaustively unit-tested.

PTY supervision and hook server (claude.rs):

- !AC-SP1 — temp-file settings + hook server bind: needs Tauri app context + PTY
- !AC-SP2 — login+interactive shell launch: needs PTY system
- !AC-SP3 — env vars on PTY: needs PTY system
- !AC-SP4 — `exec claude` via shell: needs PTY system
- !AC-SP5 — `--resume` passthrough: needs PTY system
- !AC-SP6 — single-quote escape: trivial wrapper, no logic worth a unit test
- !AC-SP7 — pre-spawn cleanup: needs Tauri state
- !AC-SP8 — PTY default size: needs PTY system
- !AC-IO1 — reader thread output streaming: needs running PTY + event bus
- !AC-IO2 — exit emit + child reap: needs running PTY + event bus
- !AC-IO3 — write_claude_stdin command: needs Tauri state
- !AC-IO4 — resize_claude command: needs Tauri state
- !AC-KL1 — shutdown_process: needs Tauri state + running child
- !AC-KL2 — kill_for_window: needs Tauri state
- !AC-HS1 — hook server recv_timeout: needs running tiny_http server
- !AC-HS2 — non-POST 405: needs running server
- !AC-HS3 — malformed body 200: needs running server
- !AC-HS4 — query string parse: trivial parser, exercised end-to-end via hooks
- !AC-HS5 — unknown path no-op: needs running server
- !AC-PR1 — agent-busy emit: needs running app
- !AC-PR2 — pending_prompt cache: needs Tauri state
- !AC-PR3 — checkpoint commit only when dirty: integration through git CLI
- !AC-PR4 — checkpoint omits Prompt: body: integration
- !AC-PR5 — skip on missing cwd/session_id: integration
- !AC-ST1 — agent-idle on every Stop exit: needs running app
- !AC-ST2 — Stop no-op conditions: integration
- !AC-ST3 — commit Claude's diff with prompt: integration
- !AC-ST4 — fallback subject from prompt's first line: integration
- !AC-CM1 — `claude -p` invocation: shells out to a binary
- !AC-CM2 — fallback to caller subject on failure: integration
- !AC-CM3 — strip claude prefix when applying our own: integration (logic covered by AC-CM4..6)
- !AC-CM7 — mode=none leaves untouched: integration
- !AC-CM8 — apply branch prefix: integration
- !AC-CM9 — trailing blank line: integration
- !AC-EM1 — commit-started/finished bracketing: needs running app
- !AC-EM2 — prompt-committed payload: needs running app
- !AC-EM3 — re-read message from git: integration
- !AC-SS1 — persist session id: needs Tauri state
- !AC-SS2 — session-started emit: needs running app
- !AC-SS3 — empty session_id no-op: needs running app

Git plumbing that shells out (git.rs):

- !GIT-HD1 — get_head_commit_hash: trivial libgit2 wrapper
- !GIT-HD2 — get_head_commit_message: trivial libgit2 wrapper
- !GIT-HD4 — error on non-repo: covered transitively by upstream tests
- !GIT-BP6 — BranchPrefixMode default + serde: trivial derive
- !GIT-ST1 — stage-and-check via `git` CLI: integration
- !GIT-ST2 — error propagation: integration
- !GIT-CO1 — `--no-gpg-sign` flag: integration with real `git`
- !GIT-CO2 — trailers added: integration
- !GIT-CO3 — first attempt with hooks: integration
- !GIT-CO4 — fallback to `--no-verify`: integration
- !GIT-CO5 — final error: integration
- !GIT-TR1 — SESSION_TRAILER_KEY constant: trivial constant

Diff command surface (diff.rs):

- !DIF-S2 — include_untracked: covered by DIF-S1 integration
- !DIF-S3 — large context_lines: covered by DIF-S1 integration
- !DIF-R1 — workdir-only diff: needs writable repo
- !DIF-R2 — older Some / newer None: needs writable repo
- !DIF-R3 — both Some inclusive range: needs writable repo
- !DIF-R4 — recurse_untracked_dirs: needs writable repo
- !DIF-R5 — large context_lines: covered transitively
- !DIF-R6 — FileDiff shape: integration
- !DIF-L1 — strip trailing newlines: integration
- !DIF-L2 — only +/-/space origins: integration
- !DIF-L3 — additions/deletions tally: covered by DIF-S1
- !DIF-FL1 — get_file_lines from commit tree: needs writable repo
- !DIF-FL2 — get_file_lines from workdir: needs writable repo
- !DIF-FL3 — missing/non-utf8 returns Ok(None): needs writable repo
- !DIF-FL4 — NotAGitRepo error: covered by DIF-S5

Commands that need Tauri state (commits.rs, comments.rs, project.rs, watcher.rs, db.rs, menu.rs, window.rs, lib.rs):

- !SCM-W1 — revwalk topology order: covered transitively by SCM-W2 test
- !SCM-W3 — skip unparseable trailers: edge case, integration
- !SCM-W4 — payload shape: covered by SCM-W2 test
- !SCM-P1 — current_prefix in result: needs Tauri state + DB
- !SCM-P2 — None when no prefix applies: needs Tauri state + DB
- !CMT-DB1 — schema columns: structural, covered by CMT-DB2/DB3 constraint tests
- !CMT-DB4 — created_at default: trivial SQL default
- !CMT-CR1 — create_comment validation: covered transitively by CMT-DB2/DB3
- !CMT-CR2 — list_comments query: trivial SELECT
- !CMT-CR3 — delete_comment query: trivial DELETE
- !CMT-CR4 — update_comment query: trivial UPDATE
- !CMT-FC1 — diff opts: covered transitively by integration tests
- !CMT-FC4 — Unchanged when file absent from diff: integration with non-existent file
- !CMT-PC1 — project_comments command: needs Tauri state + DB
- !CMT-PC2 — output shape: needs Tauri state + DB
- !PRJ-WD1 — Repository::discover: covered transitively
- !PRJ-WD2 — worktree resolution: needs worktree-enabled fixture
- !PRJ-WD3 — bare repo error: needs bare-repo fixture
- !PRJ-WD4 — canonicalization: trivial fs call
- !PRJ-UP1 — upsert via SQL: needs Tauri DB state
- !PRJ-UP2 — UUID minting: trivial uuid::new_v4
- !PRJ-LS1 — list 10 most recent: needs DB state
- !PRJ-RM1 — delete by id: needs DB state
- !PRJ-ST1 — JSON blob storage: needs DB state
- !PRJ-ST2 — default on parse error: needs DB state
- !PRJ-ST3 — UPDATE statement: needs DB state
- !PRJ-ST4 — camelCase serde: trivial derive
- !PRJ-BR1 — get_head_branch command: needs Tauri context
- !PRJ-CP1 — current_prefix: needs Tauri state + DB
- !PRJ-CP2 — None edge cases: needs Tauri state + DB
- !WCH-S1 — restart-safe watcher: needs notify backend
- !WCH-S2 — recursive watch: needs notify backend
- !WCH-S3 — debounce window: needs notify backend
- !WCH-S4 — .git filter: needs notify backend
- !WCH-S5 — fs-change emission: needs notify + event bus
- !WCH-S6 — stop_watching command: needs Tauri state
- !WCH-S7 — stop_for_window: needs Tauri state
- !DB-O1 — open: trivial rusqlite wrapper
- !DB-O2 — PRAGMAs: trivial pragma exec
- !DB-O3 — open_in_memory: covered by usage in tests
- !DB-SC1 — projects schema: structural
- !DB-SC2 — comments schema: covered by CMT-DB2/DB3 constraint tests
- !DB-SC3 — index: structural
- !DB-MG1 — IF NOT EXISTS idempotence: structural
- !DB-MG2 — ALTER TABLE swallow duplicate-column: structural, integration
- !DB-MG3 — legacy table preservation: structural, integration
- !MNU-B1 — menu construction: needs Tauri runtime
- !MNU-B2 — macOS app submenu: needs Tauri runtime
- !MNU-B3 — Edit submenu: needs Tauri runtime
- !MNU-B4 — Window submenu: needs Tauri runtime
- !MNU-RC1 — Open Recent population: needs Tauri runtime + DB
- !MNU-RC2 — recent:<path> id format: needs Tauri runtime
- !MNU-EV1 — Open menu handler: needs Tauri dialog plugin
- !MNU-EV2 — recent menu handler: needs Tauri runtime
- !MNU-EV3 — close-window handler: needs Tauri runtime
- !MNU-RF1 — refresh_recent_menu: needs Tauri runtime
- !WIN-PK1 — picker idempotence: needs Tauri runtime
- !WIN-PK2 — picker chrome: needs Tauri runtime
- !WIN-PJ1 — open_project_window upsert: needs Tauri runtime + DB
- !WIN-PJ2 — unique window labels: needs Tauri runtime
- !WIN-PJ3 — __PROJECT injection: needs Tauri webview
- !WIN-PJ4 — project window chrome: needs Tauri runtime
- !WIN-PJ5 — default window size: needs Tauri runtime
- !WIN-PJ6 — picker close + menu refresh: needs Tauri runtime
- !WIN-RL1 — LastDestroyedLabel tracking: needs Tauri runtime
- !WIN-RL2 — re-open picker on project close: needs Tauri runtime
- !WIN-RL3 — quit on picker close: needs Tauri runtime
- !WIN-RL4 — agent + watcher cleanup on destroy: needs Tauri runtime

## React/Tauri UI behaviors (require browser DOM + Tauri runtime)

The frontend is exercised through a Tauri webview. Pure helpers (formatters,
staging predicates, projection layout, classname merging) are unit-tested.
Components, hooks that subscribe to Tauri events, and DOM-coupled behaviors
need either Playwright + a running app or a deeper jsdom + IPC mock — neither
of which is in place yet.

App shell (app.tsx):

- !APP-RT1 — picker fallback when no project: integration
- !APP-RT2 — ProjectApp render: integration
- !APP-SB1 — startWatching on mount: needs Tauri IPC mock
- !APP-SB2 — refetch on prefix-mode change: needs Tauri IPC mock
- !APP-SB3 — jump to landed commit: needs event bus
- !APP-CM1 — handleResolveAnchor branching: needs Tauri IPC mock
- !APP-CM2 — uncommittable returns ok:false: needs Tauri IPC mock
- !APP-CM3 — handleSubmitComment writes: needs Tauri IPC mock
- !APP-CM4 — no-op without sessionId: needs Tauri IPC mock
- !APP-CO1 — merges synthesised comment-only file diffs: needs Tauri IPC mock
- !APP-SS1 — busy guard: integration
- !APP-SS2 — prepareSubmit dispatch: integration
- !APP-SS3 — Ctrl-S clear: integration
- !APP-SS4 — split write to avoid paste behavior: integration
- !APP-SS5 — remove sent comments: integration
- !APP-SS6 — pop selection to terminal: integration
- !APP-JC1 — scroll-to-line via diff handle: integration
- !APP-JC2 — fallback navigate to anchor: integration
- !APP-LC1 — title bar drag region: visual / Tauri
- !APP-LC2 — fullscreen-aware traffic-light padding: visual / Tauri
- !APP-LC3 — terminal stays mounted: integration
- !APP-LC4 — diff overlay: visual
- !APP-LC5 — new-session button overlay: integration
- !APP-LC6 — session error bar: integration
- !APP-LC7 — workdir-inclusive views commentable: integration

Chat sidebar (chat-sidebar.tsx) — DOM rendering + mouse interactions:

- !CHT-R1 — Current Session row + commit list
- !CHT-R2 — empty state
- !CHT-R3 — commit row content
- !CHT-R4 — full message tooltip
- !CHT-R5 — sticky Current Session + committing spinner
- !CHT-PF1 — prefix stripping
- !CHT-PF2 — non-matching prefix passthrough
- !CHT-RL1 — rail column geometry
- !CHT-RL2 — split half-line lighting
- !CHT-RL3 — node fill + hover halo
- !CHT-RL4 — no-selection lights Current Session
- !CHT-RL5 — first/last row no edge half-line
- !CHT-SL1 — single click selects from commit
- !CHT-SL2 — Current Session click clears
- !CHT-SL3 — double-click pins single point
- !CHT-SL4 — drag selection
- !CHT-SL5 — drag threshold 4px
- !CHT-SL6 — click suppression after drag
- !CHT-SL7 — mousedown resets suppression
- !CHT-SL8 — global mouseup cleanup
- !CHT-TM1 — time formatting

Comments UI (composer + panel) — DOM rendering + interaction:

- !CFE-HK1 — load on session change
- !CFE-HK2 — staged reset on session change
- !CFE-HK3 — empty session clears
- !CFE-HK4 — diff-view projection effect
- !CFE-HK5 — workdir projection effect
- !CFE-HK6 — request-seq drop stale
- !CFE-HK7 — add prepends + auto-stages
- !CFE-HK8 — remove deletes + unstages
- !CFE-HK13 — update replaces in-memory comment
- !CFE-HK9 — toggleStaged
- !CFE-HK10 — setAllStaged
- !CFE-HK11 — prepareSubmit ordering
- !CFE-HK12 — stable callback identity
- !CFE-CP1 — composer auto-focus
- !CFE-CP2 — empty trim guards submit
- !CFE-CP3 — line/range label
- !CFE-CP4 — Esc cancels
- !CFE-CP5 — Cmd/Ctrl+Enter submits
- !CFE-PN1 — empty render
- !CFE-PN2 — header counts
- !CFE-PN3 — header checkbox tri-state
- !CFE-PN4 — header toggle
- !CFE-PN5 — Send button disabled state
- !CFE-PN6 — row checkbox disabled
- !CFE-PN7 — reason text
- !CFE-PN8 — orphaned badge
- !CFE-PN9 — onJump
- !CFE-PN10 — onDelete
- !CFE-PN11 — layout containment
- !CFE-PN12 — title attribute on truncated location
- !CFE-PN13 — title attribute on line-clamped contents

Diff viewer rendering and click+drag (compute-diff-rows.ts pure functions are tested separately):

- !DV-RC1 — context paired row
- !DV-RC2 — adjacent del/add zip
- !DV-RC3 — uneven del/add fills with null
- !DV-RC4 — line numbers default 0
- !DV-SC1 — indent measurement
- !DV-CL1 — context-run identification
- !DV-CL2 — short-run threshold
- !DV-CL3 — top base context
- !DV-CL4 — bottom base context (smart)
- !DV-CL5 — expansion deltas
- !DV-CL6 — full reveal omits collapse marker
- !DV-CL7 — collapsed marker emission
- !DV-CL8 — EXPAND_STEP constant
- !DV-CL9 — must-show breaks runs (pure but composes with already-untestable run logic)
- !DV-CL10 — SideBySideDiff derives must-show: DOM rendering
- !DV-SB2 — smart-bottom indent boundary
- !DV-HL2 — language resolution from path
- !DV-HL3 — cancellation flag
- !DV-HL4 — token mapping
- !DV-PN1 — no-selection placeholder
- !DV-PN2 — loading spinner
- !DV-PN3 — empty diff message
- !DV-PN4 — single-commit prompt header
- !DV-PN5 — file ref pruning
- !DV-PN6 — scroll-to-line imperative handle
- !DV-PN7 — comment grouping by file
- !DV-PN8 — empty inline-comments stable ref
- !DV-CC1 — line mousedown/enter pending range
- !DV-CC2 — window mouseup resolves anchor
- !DV-CC3 — validating range highlight
- !DV-CC4 — uncommittable alert
- !DV-CC5 — composer slotted via sentinel id
- !DV-CC6 — ResizeObserver feeds heights
- !DV-CC7 — heights map pruning
- !DV-IC1 — preserved whitespace
- !DV-IC2 — hover-revealed delete
- !DV-IC3 — pencil toggles edit mode
- !DV-IC4 — edit textarea auto-focus
- !DV-IC5 — empty/unchanged save guard
- !DV-IC6 — Esc cancel / Cmd+Enter save
- !DV-IC7 — onUpdate on save
- !DV-CO1 — only located comments trigger synthesis: needs Tauri IPC mock
- !DV-CO2 — skips paths in real fileDiffs: needs Tauri IPC mock
- !DV-CO3 — stable refetch key: needs Tauri IPC mock
- !DV-CO4 — parallel fetch + silent failure handling: needs Tauri IPC mock
- !DV-CO5 — synthesised FileDiff shape: covered indirectly via DV-CO4 integration

Project picker / settings UI:

- !PFE-PK1 — load recent on mount
- !PFE-PK2 — folder dialog open
- !PFE-PK3 — open project window + loading flag
- !PFE-PK4 — error surface
- !PFE-PK5 — top-3 cap
- !PFE-PK6 — recent-row click + remove
- !PFE-PK7 — drag region
- !PFE-ST1 — branch refetch on popover open
- !PFE-ST2 — three radio options
- !PFE-ST3 — dim when branch unknown
- !PFE-ST4 — featurePart helper
- !PFE-ST5 — onUpdate plumbing
- !PFE-ST6 — no-drag region
- !PFE-PS1 — load saved settings
- !PFE-PS2 — optimistic update + revert
- !PFE-PS3 — default mode `none`

Frontend session hook (use-claude-session.ts):

- !UCS-SP1 — spawn on mount
- !UCS-SP2 — refs alongside state
- !UCS-SP3 — agent_id filter on events
- !UCS-SP4 — kill + detach on unmount
- !UCS-SP5 — kill on cancellation race
- !UCS-SP6 — restart bumps spawnSeq
- !UCS-EV1 — claude-output decode + fanout
- !UCS-EV2 — session-started seed
- !UCS-EV3 — commit-started/finished count
- !UCS-EV4 — agent-busy/idle
- !UCS-EV5 — prompt-committed prepend
- !UCS-IO1 — onOutput Set + unsubscribe
- !UCS-IO2 — writeInput base64 + no-op
- !UCS-IO3 — resize forward + no-op
- !UCS-CL1 — onCommitLanded Set
- !UCS-CL2 — only realtime commits notify
- !UCS-RF1 — refetchCommits no-op when no session
- !UCS-RF2 — drop response on agent change

Misc hooks (use-diff-stats, use-range-diff, use-fullscreen, use-scroll-into-view):

- !DS-1 — joined-string key cache
- !DS-2 — empty commits clears
- !DS-3 — cancellation drop
- !DS-4 — failure preserves prior map
- !RD-1 — selection-key cache
- !RD-2 — no selection clears
- !RD-3 — cancellation drop
- !RD-4 — fs-change only when newer null
- !RD-5 — 200ms debounce
- !FS-1 — initial fullscreen read
- !FS-2 — onResized subscription
- !SV-1 — double rAF wait
- !SV-2 — viewport via data-slot
- !SV-3 — fits-in-viewport scroll
- !SV-4 — pin-top fallback

Terminal panel (xterm + ResizeObserver):

- !TRM-S1 — JetBrains Mono font stack
- !TRM-S2 — xterm options
- !TRM-S3 — terminalTheme palette
- !TRM-S4 — allowProposedApi
- !TRM-L1 — FitAddon + ResizeObserver
- !TRM-L2 — resize mirror to PTY
- !TRM-L3 — silent fail on 0×0
- !TRM-IO1 — output write
- !TRM-IO2 — onData → writeInput
- !TRM-V1 — kept in layout always
- !TRM-V2 — refresh + focus on visible
- !TRM-V3 — blur on hidden
- !TRM-V4 — clearSelection on hidden: visual / xterm internals
- !TRM-C1 — unmount cleanup

Library bindings (lib/tauri.ts):

- !LIB-TA1 — wrapper functions (structural)
- !LIB-TA2 — typed Promise returns (structural)

## woke2 checker (tools/woke2-check.js)

The checker is a CLI integration tool that operates on the entire repo. End-to-
end testing would require fixture repos for each rule; not in scope. The shared
parsing primitives it depends on (extractDefinitions, extractPragmas) are tested
in `tools/woke2-lsp/`.

- !W2C-FL1 — git ls-files
- !W2C-FL2 — extension filter
- !W2C-V1 — duplicate IDs
- !W2C-V2 — orphan pragmas
- !W2C-V3 — malformed IDs
- !W2C-V4 — heading-level IDs
- !W2C-V5 — broken cross-spec links
- !W2C-V6 — backlog cycles
- !W2C-V7 — broken backlog deps
- !W2C-V8 — unimplemented behaviors
- !W2C-CV1 — coverage summary
- !W2C-CV2 — UNTESTABLE exclusion
- !W2C-CV3 — list missing tests
- !W2C-CV4 — children need own pragmas
- !W2C-UT1 — load UNTESTABLE.md
- !W2C-UT2 — list-item parser
- !W2C-UT3 — fenced block skip
- !W2C-BL1 — backlog file glob
- !W2C-BL2 — depends-on parsing
- !W2C-BL3 — subsection ends section
- !W2C-BL4 — fenced block skip
- !W2C-LK1 — markdown link regex
- !W2C-LK2 — relative resolution
- !W2C-LK3 — fenced block skip
