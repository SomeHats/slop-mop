# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Always load the woke2 skill

When doing any feature work or behavior changes, follow the woke2 skill at `.claude/skills/woke2/SKILL.md`.

Always define or update behaviors in `*.spec.md` files BEFORE writing code.
Add `// woke2 impl` / `// woke2 test` pragmas, as you go, or at the end.
Run `npm run woke2:check` after you've finished.

Backlog tasks live in `backlog/` — one file per task, named `P<priority>_<Description>.md`. Delete the file when the task is finished.

## What this is

Slop Mop wraps a single Claude Code agent in a structured review loop: every prompt becomes an auto-commit, the user reviews the resulting diff and leaves inline comments, then sends those comments back as a batched follow-up prompt. The user-facing pitch and tech stack live in `README.md`; this file covers what isn't obvious from a file scan.

It is **not** a multi-agent orchestrator and there is no worktree isolation — single Claude process per project window. (Earlier docs called it a "nursery" / "Claude Crèche"; that vision was abandoned.)

## Common commands

```sh
pnpm dev               # full Tauri app (Vite dev server + native window)
pnpm test              # TS + Rust tests
pnpm test:ts           # vitest run only
pnpm test:rs           # cargo test (lib only)
pnpm typecheck         # tsc -b, no emit
pnpm check             # biome lint + format check
pnpm check:fix         # biome with auto-fix
```

Single TS test file: `pnpm vitest run src/features/comments/submit-comments.test.ts`
Single Rust test: `cargo test --manifest-path src-tauri/Cargo.toml --lib <test_name>`

`pnpm build` is `tauri build` (full distributable). For just the frontend bundle, use `pnpm build:frontend`.

## Architecture

Two-layer split:

- **Frontend** — TypeScript / React in a Tauri webview. No direct filesystem or process access. Talks to the backend exclusively via `invoke`, wrapped in `src/lib/tauri.ts`.
- **Backend** — Rust under `src-tauri/`. Owns git, PTY supervision, SQLite, and the filesystem. Tauri commands are registered in `lib.rs` and delegate to dedicated modules.

### Auto-commit machinery (the core surprise)

Every user prompt becomes one or two git commits, automatically. Wired up in `src-tauri/src/claude.rs`:

1. When spawning Claude, the backend writes a temp `slop-mop-{agent_id}.json` Claude Code settings file pointing `UserPromptSubmit`, `SessionStart`, and `Stop` hooks at a small `tiny_http` server bound to localhost.
2. **`UserPromptSubmit`** (`handle_prompt`): emits `agent-busy`, then `git add --all && git commit` any pre-existing dirty work as a "check point" so Claude's resulting diff starts clean.
3. **`Stop`** (`handle_stop`): commits whatever Claude changed, generating the commit subject via `claude -p` plus a `Prompt: <user prompt>` body, then emits `agent-idle`. The wrapper guarantees `agent-idle` fires on every exit path so the UI doesn't get stuck busy.

Hook-driven commits carry a `Slop-Mop-Session-Id: <claude_session_id>` git trailer (`git.rs::SESSION_TRAILER_KEY`). That trailer is the **only** linkage between a Claude session and its commits — session views walk `git log` and filter by trailer. Old commits with the previous trailer key (`Creche-Session-Id`) are no longer findable.

### Comment system (the other core surprise)

Comments anchor to `(commit_hash, file_path, range_start, range_end)` and live in SQLite (`comments.rs`, `db.rs`). Because lines move as Claude makes more commits, every comment is **projected** through subsequent commits to figure out where it currently lives:

- `ProjectionResult` (`src/lib/types.ts`) is a discriminated union: `located` (`{ path, start, end }`) or `orphaned` (`{ reason }`).
- Each comment carries two projections: the **diff-view projection** (where it lands in the diff currently being viewed) and the **session/workdir projection** (where it lands in HEAD's working tree right now).
- "Send to agent" only includes comments whose **workdir** projection is `located`. Orphaned comments stay visible but are flagged unsendable.

Projection logic is the most-tested code in the repo (`cargo test --lib comments::tests::integration_*`). When changing it, run those tests.

### Frontend ↔ backend events

The backend pushes events to the frontend via `emit_to_window`. The full set, all listened to in `src/hooks/use-claude-session.ts`:

- `claude-output` — base64-encoded PTY bytes; the terminal feature pipes them into xterm.
- `session-started` — fired by the `SessionStart` hook with Claude's session id.
- `commit-started` / `commit-finished` — bracket each in-flight git commit.
- `prompt-committed` — emitted at the tail of a successful `Stop` commit; the chat sidebar prepends the new commit.
- `agent-busy` / `agent-idle` — bracket "Claude is mid-turn"; gates the comments-panel Send button.

## Frontend conventions

- Functional components only. Named exports only (no default exports). Explicit return types on exported functions.
- Files: `kebab-case.tsx` for components, `kebab-case.ts` for utilities. One component per file. Tests co-located: `foo.test.ts` next to `foo.ts`.
- Prefer `type` over `interface` unless extending.
- TypeScript runs on full strict: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noUncheckedSideEffectImports`. No `any` — use `unknown` and narrow. No `as`-casts unless genuinely unavoidable and commented.
- Prefer discriminated unions over optional fields for state modeling. The comment `ProjectionResult` is the canonical example.

## Backend conventions

- Tauri command handlers stay thin; business logic goes in the dedicated module (`comments.rs`, `git.rs`, etc.).
- Errors exposed to the frontend use `thiserror` via `src-tauri/src/error.rs`. Commands return `Result<T, Error>`; never panic on user-facing paths.
- `claude.rs` is the heaviest module — PTY supervision, the hook HTTP server, and commit orchestration all live there. Adding a new hook handler means adding a route in `start_hook_server` plus a settings entry in the temp JSON.

## Design system

Minimal and technical. UI should feel like a developer tool, not a consumer app.

- **Dark mode only** — hardcoded `class="dark"` on `<html>`.
- **No border radius** — sharp corners (`rounded-none`, baked into the radix-lyra preset).
- **Monospace everywhere** — JetBrains Mono, including UI chrome.
- **Purple accent** — primary from the stone/lyra theme.
- **Semantic color tokens only** — `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-muted`, `border-border`. Never raw colors like `bg-zinc-800`.
- **shadcn-first** — reuse vendored shadcn/ui primitives (`Button`, `Item`, `Badge`, `ScrollArea`, etc.) before writing custom markup. Preset is `radix-lyra` (see `components.json`); new components added via the CLI inherit from it.

## Git conventions

- Branch names: `<author>/<short-description>` (e.g. `alex/add-review-panel`).
- Commit messages: prefix with branch name + `: ` (e.g. `alex/add-review-panel: add inline comment rendering`). Hook-generated auto-commits follow their own format and are not subject to this rule.
- Use `git add --all` when staging.
- Never commit unless explicitly asked.

## Non-goals

- Cloud / remote deployment — local dev tool only.
- Multi-user collaboration.
- Multiple agents in one window — one Claude per project window. (Multiple windows are fine.)
- Replacing Claude Code itself — orchestrate, don't reimplement.
