# Slop Mop

A Tauri v2 desktop app for managing multiple Claude Code agent instances working
on a shared codebase.

## Prerequisites

- [Node.js](https://nodejs.org/) v22+ (managed via `nodenv`)
- [pnpm](https://pnpm.io/) v8+
- [Rust](https://rustup.rs/) stable (1.85+)
- macOS system dependencies are bundled via Tauri/Xcode — no extra steps needed

## Setup

```sh
pnpm install
```

## Development

Run the full Tauri desktop app (starts Vite dev server + native window):

```sh
pnpm dev
```

Run the frontend only in a browser (no Rust backend):

```sh
pnpm dev:vite
```

## Scripts

| Script            | What it does                              |
| ----------------- | ----------------------------------------- |
| `pnpm dev`        | Launch Tauri app in development mode      |
| `pnpm dev:vite`   | Start Vite dev server (frontend only)     |
| `pnpm build`      | TypeScript check + Vite production build  |
| `pnpm tauri:build` | Build distributable Tauri app            |
| `pnpm typecheck`  | Run TypeScript compiler (no emit)         |
| `pnpm check`      | Run Biome linter + formatter              |
| `pnpm check:fix`  | Run Biome with auto-fix                   |

## Tech Stack

- **Desktop**: Tauri v2 (Rust backend, webview frontend)
- **Frontend**: React 19, TypeScript 5.9 (strictest config), Tailwind CSS v4
- **Build**: Vite 7 + SWC
- **Lint/Format**: Biome 2
- **Package manager**: pnpm

## Project Structure

```
src/                         # Frontend (TypeScript/React)
  app.tsx                    # Root component
  main.tsx                   # Entry point
  index.css                  # Tailwind import

src-tauri/                   # Backend (Rust/Tauri)
  src/
    main.rs                  # Desktop entry point
    lib.rs                   # Tauri app setup + commands
  Cargo.toml
  tauri.conf.json            # Tauri configuration
  capabilities/              # Tauri v2 permissions
  icons/                     # App icons (all platforms)
```

See [CLAUDE.md](./CLAUDE.md) for architecture details, conventions, and coding
standards.
