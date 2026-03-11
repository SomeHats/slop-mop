# Claude Crèche

A Tauri v2 desktop app for managing multiple Claude Code agent instances working
on a shared codebase. Think of it as a "nursery" — you spin up agents in
isolated git worktrees, review their work through structured code review, and
track everything in git.

## Project Vision

### Problem

When running multiple Claude Code instances on the same project, coordination is
manual and fragile. There's no unified view of what each agent is doing, no
structured way to review their output, and no mechanism to send feedback back for
iteration.

### Solution

A native desktop app (Tauri v2) that provides:

- **Agent management** — Launch, monitor, and stop Claude Code instances, each
  operating in its own git worktree for isolation.
- **Code review** — Diff-based review UI where you can leave inline comments on
  agent-produced changes, similar to GitHub PR reviews but local and immediate.
- **Feedback loops** — Group review comments and send them back to an agent as
  structured instructions for improvement.
- **Git tracking** — All agent work happens in worktree branches. The app
  surfaces branch status, diffs, and commit history so you always know what's
  going on.

### Non-goals (for now)

- Remote/cloud deployment — this is a local dev tool.
- Multi-user collaboration — single operator assumed.
- Replacing Claude Code itself — we orchestrate it, not reimplement it.

## Tech Stack

| Layer          | Choice                        | Notes                                       |
| -------------- | ----------------------------- | ------------------------------------------- |
| Desktop        | Tauri v2                      | Rust backend, webview frontend              |
| Language (FE)  | TypeScript (strictest config) | `strict`, `noUncheckedIndexedAccess`, etc.   |
| Language (BE)  | Rust                          | Tauri commands for filesystem, git, process  |
| Framework      | React                         | Functional components, hooks only           |
| Styling        | Tailwind CSS v4               | Utility-first, no custom CSS unless needed  |
| Build          | Vite                          | SWC-based React plugin for speed            |
| Lint + Format  | Biome                         | Rust-based, replaces ESLint + Prettier      |
| Package mgr    | pnpm                          | Fast, strict, disk-efficient                |
| Testing        | Vitest                        | Vite-native, same config                    |

### Architecture

The app is split into two layers:

- **Frontend (TypeScript/React)** — UI rendered in a Tauri webview. Communicates
  with the backend exclusively via Tauri's `invoke` IPC bridge. No direct
  filesystem or process access from the frontend.
- **Backend (Rust)** — Tauri commands that handle git operations, worktree
  management, process spawning (Claude Code instances), and file system access.
  This is where all privileged operations live.

## Conventions

### Code Style

- Functional components only. No classes.
- Named exports only. No default exports.
- Explicit return types on all exported functions.
- Prefer `type` over `interface` unless extending.
- File names: `kebab-case.tsx` for components, `kebab-case.ts` for utilities.
- One component per file. Co-locate tests as `foo.test.ts` next to `foo.ts`.

### Git

- Branch names: `<author>/<short-description>` (e.g., `alex/add-review-panel`).
- Commit messages: prefix with branch name followed by `: `
  (e.g., `alex/add-review-panel: add inline comment rendering`).
- Use `git add --all` when staging changes.
- Keep commits small and focused.

### Project Structure

```
src/                             # Frontend (TypeScript/React)
  app.tsx                        # Root component
  main.tsx                       # Entry point
  components/                    # Shared UI components
  features/                      # Feature-specific modules (agents, review, etc.)
  lib/                           # Shared utilities and types
  hooks/                         # Shared React hooks

src-tauri/                       # Backend (Rust/Tauri)
  src/
    main.rs                      # Tauri app entry point
    lib.rs                       # Command registrations
  Cargo.toml
  tauri.conf.json                # Tauri configuration
  capabilities/                  # Tauri v2 permission capabilities
```

### TypeScript

- `strict: true` plus every additional strictness flag enabled.
- No `any`. Use `unknown` and narrow.
- No type assertions (`as`) unless genuinely unavoidable and commented.
- Prefer discriminated unions over optional fields for state modeling.

### Rust

- Use `thiserror` for error types exposed to the frontend.
- Tauri commands return `Result<T, E>` — never panic on user-facing paths.
- Keep command handlers thin; delegate to modules for business logic.

### Dependencies

- Minimize external dependencies. Justify each addition.
- Prefer standard platform APIs (Fetch, Web Streams, etc.) over wrappers.
- Pin exact versions in `package.json`.
