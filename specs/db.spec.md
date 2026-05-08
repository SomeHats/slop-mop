---
name: SQLite database
description: Database open, migrations, and the projects/comments schema
---

# SQLite database

The app stores project metadata and inline comments in a single SQLite file under the OS app-data dir. See [comments storage](comments.spec.md) for the comment schema details and [project picker](project.spec.md) for project upserts.

## Open and configuration

- !DB-O1 `Db::open(path)` opens (or creates) a connection at the given path
- !DB-O2 Sets `journal_mode=WAL` and `foreign_keys=ON` on every connection
- !DB-O3 Runs migrations on open; tests can use `open_in_memory` for an isolated DB

## Schema

- !DB-SC1 `projects(id PK, name, path UNIQUE, opened_at, settings_json)` — uniqueness on `path` lets the upsert use `ON CONFLICT(path)`
- !DB-SC2 `comments` schema enforces the line-range invariants described in [comments](comments.spec.md)
- !DB-SC3 `idx_comments_session` indexes `comments.session_id` for the listing query

## Migration strategy

- !DB-MG1 `CREATE TABLE IF NOT EXISTS` makes the migration idempotent on re-open
- !DB-MG2 `settings_json` is added to `projects` via `ALTER TABLE`; the duplicate-column error is swallowed on subsequent boots
- !DB-MG3 The legacy `prompt_snapshots` table from earlier builds is left in place if it exists — harmless and avoids destructive `DROP` on first launch
