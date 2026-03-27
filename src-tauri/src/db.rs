use std::sync::Mutex;

use rusqlite::Connection;

use crate::error::Error;

pub struct Db(pub Mutex<Connection>);

impl Db {
    pub fn open(path: &std::path::Path) -> Result<Self, Error> {
        let conn = Connection::open(path).map_err(|e| Error::Database(e.to_string()))?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| Error::Database(e.to_string()))?;
        let db = Self(Mutex::new(conn));
        db.migrate()?;
        Ok(db)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self, Error> {
        let conn =
            Connection::open_in_memory().map_err(|e| Error::Database(e.to_string()))?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| Error::Database(e.to_string()))?;
        let db = Self(Mutex::new(conn));
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<(), Error> {
        let conn = self.0.lock().map_err(|e| Error::Database(e.to_string()))?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL UNIQUE,
                opened_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS prompt_snapshots (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                message_id TEXT NOT NULL,
                prompt_text TEXT NOT NULL,
                commit_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_prompt_snapshots_session
                ON prompt_snapshots(session_id, created_at);
            CREATE TABLE IF NOT EXISTS permission_rules (
                id TEXT PRIMARY KEY,
                project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
                path_prefix TEXT NOT NULL,
                decision TEXT NOT NULL CHECK(decision IN ('allow', 'deny')),
                tool_kind TEXT NOT NULL CHECK(tool_kind IN ('read', 'edit')),
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_permission_rules_project
                ON permission_rules(project_id);
            CREATE TABLE IF NOT EXISTS execute_rules (
                id TEXT PRIMARY KEY,
                project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
                command TEXT NOT NULL,
                decision TEXT NOT NULL CHECK(decision IN ('allow', 'deny')),
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_execute_rules_project
                ON execute_rules(project_id);
            CREATE TABLE IF NOT EXISTS execute_flag_rules (
                id TEXT PRIMARY KEY,
                execute_rule_id TEXT NOT NULL REFERENCES execute_rules(id) ON DELETE CASCADE,
                flag TEXT NOT NULL,
                decision TEXT NOT NULL CHECK(decision IN ('allow', 'deny')),
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_execute_flag_rules_rule
                ON execute_flag_rules(execute_rule_id);
            CREATE TABLE IF NOT EXISTS execute_file_rules (
                id TEXT PRIMARY KEY,
                execute_rule_id TEXT NOT NULL REFERENCES execute_rules(id) ON DELETE CASCADE,
                path_prefix TEXT NOT NULL,
                decision TEXT NOT NULL CHECK(decision IN ('allow', 'deny')),
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_execute_file_rules_rule
                ON execute_file_rules(execute_rule_id);",
        )
        .map_err(|e| Error::Database(e.to_string()))?;
        Ok(())
    }
}
