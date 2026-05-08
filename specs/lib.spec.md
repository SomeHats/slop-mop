---
name: Library utilities (lang, utils, tauri bindings)
description: Path → language detection, classname merging, and the typed `invoke` wrappers for all Tauri commands
---

# Library utilities

## Tauri command bindings

`src/lib/tauri.ts` is a thin layer of typed `invoke` wrappers — no logic, but the canonical command names live here. The frontend should never call `invoke` directly anywhere else.

- !LIB-TA1 One exported function per backend command, named in camelCase, taking the same arguments as the backend command (with names from the Tauri convention: backend snake_case → JS camelCase)
- !LIB-TA2 Every exported wrapper returns a `Promise` of the typed result (never `unknown`)

## Language detection

`langFromPath` maps a file path to a Shiki language id. Used by the [diff viewer](diff-viewer.spec.md) to enable syntax highlighting.

- !LIB-LG1 Maps a fixed set of extensions (ts/tsx/js/jsx/rs/py/css/html/json/md/toml/yaml/yml/sh/bash/sql/go) to language ids
- !LIB-LG2 Extension match is case-insensitive
- !LIB-LG3 Uses only the trailing `.` segment — `foo.test.ts` resolves like `.ts`
- !LIB-LG4 Returns `undefined` for unknown extensions or paths without an extension

## Classname merging

`cn(...inputs)` combines `clsx` (truthy joining + objects/arrays) with `tailwind-merge` (last-of-conflicting-utility wins).

- !LIB-CN1 Joins truthy class names and skips `false`/`null`/`undefined`
- !LIB-CN2 Conflicting Tailwind utilities are merged so the last one wins
- !LIB-CN3 Supports clsx's object and array input shapes
