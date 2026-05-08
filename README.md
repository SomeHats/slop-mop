# 🪣🧹 Slop Mop

**An agentic programming tool for engineers who still care about the code.**

Slop Mop is a code review tool for working synchronously (ish) with agents, rather than asynchronously with colleagues. It's a small wrapper around Claude Code, that implements a specific workflow:

1. **🪣 The slop:** the robot does the robot thing.
2. Automatically make a git commit after each prompt
3. View a diff of the last prompt, or a range of prompts (it's just git, after all).
4. Review the diff, and leave comments as you go.
5. **🧹 The mop:** Send your comments all at once or in smaller batches, depending on how your agent works best.
6. goto 1

![A screenshot of slop mop](screenshot.png)

For now, this only supports Claude Code. Getting the robot to add support for other agent harnesses is probably pretty doable though. Also fair warning: this thing is _pure slop_. It has not been mopped. It's entirely unreviewed agent produced nonsense and might do something horrible. I've been finding it pretty useful though!

## Install

If you just want to use Slop Mop (not hack on it), clone the repo, then:

```sh
pnpm install-mac-app
```

That installs dependencies, builds a macOS bundle, and copies `Slop Mop.app` to your `/Applications` folder. If a copy is already installed it'll prompt before overwriting. Open it like any other app.

Re-run `pnpm install-mac-app` whenever you pull new changes to upgrade. (No auto-update yet — see the warning above.)

## Prerequisites

- [Node.js](https://nodejs.org/) v22+
- [pnpm](https://pnpm.io/) v9+
- [Rust](https://rustup.rs/) stable (1.85+)
- macOS — the only platform that's been tested. The Tauri layer is portable, but nobody's tried Linux or Windows yet.

## Setup

```sh
pnpm install
```

The first `pnpm dev` will also pull and compile the Rust dependencies, which takes a few minutes. Subsequent runs are fast.

## Development

Run the full app (Vite dev server + native Tauri window):

```sh
pnpm dev
```

## Scripts

| Script                  | What it does                                                 |
| ----------------------- | ------------------------------------------------------------ |
| `pnpm dev`              | Launch the full Tauri app in development mode                |
| `pnpm dev:vite`         | Vite dev server only (no Rust)                               |
| `pnpm build`            | Build a distributable Tauri app (`tauri build`)              |
| `pnpm build:frontend`   | Frontend-only build (`tsc -b && vite build`)                 |
| `pnpm preview`          | Serve the built frontend locally                             |
| `pnpm test`             | Run TS + Rust tests                                          |
| `pnpm test:ts`          | Vitest (frontend)                                            |
| `pnpm test:rs`          | `cargo test` (backend)                                       |
| `pnpm test:watch`       | Vitest in watch mode (frontend only — there's no Rust equivalent) |
| `pnpm typecheck`        | `tsc -b` (no emit)                                           |
| `pnpm check`            | Biome lint + format check                                    |
| `pnpm check:fix`        | Biome with auto-fix                                          |
| `pnpm tauri`            | Passthrough to the Tauri CLI (e.g. `pnpm tauri info`)        |

## Tech Stack

- **Desktop**: Tauri v2 — Rust backend, system webview frontend
- **Frontend**: React 19, TypeScript 5.9 (strictest config), Tailwind CSS v4, shadcn/ui
- **Build**: Vite 7 + SWC
- **Lint / format**: Biome 2
- **Testing**: Vitest (frontend), `cargo test` (backend)
- **Storage**: SQLite via `rusqlite` (bundled), git itself for everything diff-shaped
- **Package manager**: pnpm

## Project Structure

```
src/                       # Frontend (TypeScript / React)
  app.tsx                  # Root component
  main.tsx                 # Entry point
  index.css                # Tailwind + theme tokens
  components/ui/           # shadcn/ui primitives (vendored)
  features/                # Feature modules — one folder per surface
    chat/                  #   sidebar listing each prompt's commit
    comments/              #   inline review comments + staging + send-back
    diff/                  #   side-by-side diff renderer
    projects/              #   project picker + repo discovery
    terminal/              #   embedded xterm wired to the Claude PTY
  hooks/                   # Shared React hooks (session, range-diff, etc.)
  lib/                     # Tauri IPC bindings, types, syntax highlighting

src-tauri/                 # Backend (Rust / Tauri)
  src/
    main.rs                # Desktop entry point
    lib.rs                 # Tauri app setup + command registration
    claude.rs              # Claude Code process supervision + hook HTTP server
    git.rs                 # Git plumbing (commits, session trailers)
    diff.rs                # Diff calculation
    comments.rs            # Comment storage + line projection across commits
    commits.rs             # Session commit log queries
    project.rs             # Project picker + repo discovery
    watcher.rs             # Filesystem watcher
    db.rs                  # SQLite open + migrations
    menu.rs, window.rs     # Native menu + window construction
    error.rs               # Error type exposed via IPC
  capabilities/            # Tauri v2 permissions
  icons/                   # App icons
```

See [CLAUDE.md](./CLAUDE.md) for the architecture, conventions, and coding standards the codebase tries to hold itself to.
