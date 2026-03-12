use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;
use crate::error::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptSnapshot {
    pub id: String,
    pub session_id: String,
    pub project_id: String,
    pub message_id: String,
    pub prompt_text: String,
    pub commit_hash: String,
    pub created_at: String,
}

fn get_head_commit_hash(path: &Path) -> Result<String, Error> {
    let repo = git2::Repository::discover(path)
        .map_err(|_| Error::NotAGitRepo(path.display().to_string()))?;
    let head = repo.head().map_err(|e| Error::Git(e))?;
    let commit = head.peel_to_commit().map_err(|e| Error::Git(e))?;
    Ok(commit.id().to_string())
}

#[tauri::command]
pub fn record_prompt_snapshot(
    db: State<'_, Db>,
    session_id: String,
    project_id: String,
    message_id: String,
    prompt_text: String,
    project_path: String,
) -> Result<PromptSnapshot, Error> {
    let commit_hash = get_head_commit_hash(Path::new(&project_path))?;
    let id = uuid::Uuid::new_v4().to_string();

    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    conn.execute(
        "INSERT INTO prompt_snapshots (id, session_id, project_id, message_id, prompt_text, commit_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, session_id, project_id, message_id, prompt_text, commit_hash],
    )
    .map_err(|e| Error::Database(e.to_string()))?;

    let snapshot = conn
        .query_row(
            "SELECT id, session_id, project_id, message_id, prompt_text, commit_hash, created_at
             FROM prompt_snapshots WHERE id = ?1",
            rusqlite::params![id],
            |row| {
                Ok(PromptSnapshot {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    project_id: row.get(2)?,
                    message_id: row.get(3)?,
                    prompt_text: row.get(4)?,
                    commit_hash: row.get(5)?,
                    created_at: row.get(6)?,
                })
            },
        )
        .map_err(|e| Error::Database(e.to_string()))?;

    Ok(snapshot)
}

#[tauri::command]
pub fn list_prompt_snapshots(
    db: State<'_, Db>,
    session_id: String,
) -> Result<Vec<PromptSnapshot>, Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, project_id, message_id, prompt_text, commit_hash, created_at
             FROM prompt_snapshots WHERE session_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| Error::Database(e.to_string()))?;

    let snapshots = stmt
        .query_map(rusqlite::params![session_id], |row| {
            Ok(PromptSnapshot {
                id: row.get(0)?,
                session_id: row.get(1)?,
                project_id: row.get(2)?,
                message_id: row.get(3)?,
                prompt_text: row.get(4)?,
                commit_hash: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| Error::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| Error::Database(e.to_string()))?;

    Ok(snapshots)
}
