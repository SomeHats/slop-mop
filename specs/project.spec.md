---
name: Project picker and per-project settings
description: Resolving paths to git repos, persisting recent projects, and per-project commit-prefix settings
---

# Projects

A "project" is a git repo workdir. Worktrees are first-class — opening a worktree means Claude runs in the worktree and commits to the worktree's branch.

## Workdir resolution

- !PRJ-WD1 `resolve_workdir` calls `Repository::discover` so any path inside a repo resolves to the repo root
- !PRJ-WD2 Worktrees resolve to the worktree's working directory, not the main repo's
- !PRJ-WD3 Bare repos return `NotAGitRepo("bare repository")` — Slop Mop has no use for them
- !PRJ-WD4 Result is canonicalized so symlinks and trailing slashes map to the same project row

## Upsert and listing

- !PRJ-UP1 `upsert_project` resolves the path, derives the project name from the workdir's basename, and `INSERT … ON CONFLICT(path) DO UPDATE` so re-opening bumps `opened_at` and refreshes the name
- !PRJ-UP2 Project ids are UUIDs, freshly minted on insert and preserved on conflict
- !PRJ-LS1 `list_projects` returns the 10 most recently opened projects, ordered by `opened_at DESC`
- !PRJ-RM1 `remove_project` deletes a single project row by id

## Settings

- !PRJ-ST1 Settings live in a JSON blob (`projects.settings_json`) so adding new options doesn't need a schema migration
- !PRJ-ST2 `read_project_settings` returns `ProjectSettings::default()` if the row is missing or the JSON is malformed — settings failures must never break commits
- !PRJ-ST3 `update_project_settings` serializes to JSON and updates the row
- !PRJ-ST4 The frontend sees `ProjectSettings` with camelCase keys; the Rust struct uses snake_case fields
- !PRJ-ST5 `ProjectSettings.ignore_whitespace` is a boolean (default `false`) persisted in the same JSON blob; missing-from-JSON deserializes to `false`

## Branch resolution

- !PRJ-BR1 `get_head_branch` exposes the current branch name to the frontend (None for detached HEAD)
- !PRJ-CP1 `current_prefix` is the single source of truth — combines the project's saved settings + current branch + prefix mode to produce the prefix that *new* commits would carry
- !PRJ-CP2 Returns `None` when settings aren't readable, when HEAD is detached, or when mode is `None`
