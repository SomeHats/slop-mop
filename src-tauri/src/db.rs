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
        // History is now sourced from git log (see commits.rs); the legacy
        // prompt_snapshots table from earlier builds is left in place if it
        // exists — harmless and avoids destructive DROP on first launch.
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL UNIQUE,
                opened_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )
        .map_err(|e| Error::Database(e.to_string()))?;
        Ok(())
    }
}
