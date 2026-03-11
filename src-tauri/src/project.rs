use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;
use crate::error::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub opened_at: String,
}

/// Resolve a path to the root of its main git repository.
/// If the path is inside a worktree, follows `commondir` back to the main repo.
/// The result is canonicalized to ensure consistent paths regardless of symlinks
/// or trailing slashes.
pub fn resolve_repo_root(path: &Path) -> Result<PathBuf, Error> {
    let repo = git2::Repository::discover(path)
        .map_err(|_| Error::NotAGitRepo(path.display().to_string()))?;

    let root = if repo.is_worktree() {
        // commondir points to the main repo's .git directory
        let common_dir = repo.commondir().to_path_buf();
        common_dir
            .parent()
            .map(|p| p.to_path_buf())
            .ok_or_else(|| Error::InvalidPath(common_dir.display().to_string()))?
    } else {
        repo.workdir()
            .map(|p| p.to_path_buf())
            .ok_or_else(|| Error::NotAGitRepo("bare repository".to_string()))?
    };

    root.canonicalize()
        .map_err(|_| Error::InvalidPath(root.display().to_string()))
}

fn get_project_name(path: &Path) -> String {
    path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string()
}

#[tauri::command]
pub fn open_project(db: State<'_, Db>, path: String) -> Result<Project, Error> {
    let repo_root = resolve_repo_root(Path::new(&path))?;
    let repo_path = repo_root.to_string_lossy().to_string();
    let name = get_project_name(&repo_root);
    let id = uuid::Uuid::new_v4().to_string();

    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    conn.execute(
        "INSERT INTO projects (id, name, path, opened_at) VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(path) DO UPDATE SET opened_at = datetime('now'), name = excluded.name",
        rusqlite::params![id, name, repo_path],
    )
    .map_err(|e| Error::Database(e.to_string()))?;

    let project = conn
        .query_row(
            "SELECT id, name, path, opened_at FROM projects WHERE path = ?1",
            rusqlite::params![repo_path],
            |row| {
                Ok(Project {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    path: row.get(2)?,
                    opened_at: row.get(3)?,
                })
            },
        )
        .map_err(|e| Error::Database(e.to_string()))?;

    Ok(project)
}

#[tauri::command]
pub fn list_recent_projects(db: State<'_, Db>) -> Result<Vec<Project>, Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    let mut stmt = conn
        .prepare("SELECT id, name, path, opened_at FROM projects ORDER BY opened_at DESC LIMIT 10")
        .map_err(|e| Error::Database(e.to_string()))?;

    let projects = stmt
        .query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                opened_at: row.get(3)?,
            })
        })
        .map_err(|e| Error::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| Error::Database(e.to_string()))?;

    Ok(projects)
}

#[tauri::command]
pub fn remove_project(db: State<'_, Db>, id: String) -> Result<(), Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    conn.execute("DELETE FROM projects WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| Error::Database(e.to_string()))?;

    Ok(())
}
