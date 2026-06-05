use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;
use crate::error::Error;
use crate::git::{BranchPrefixMode, derive_branch_prefix, get_head_branch_name};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub opened_at: String,
}

#[derive(Default, Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PromptFinishedNotification {
    #[default]
    None,
    Ding,
    Nag,
}

// woke2 impl PRJ-ST4, PRJ-ST5, PRJ-NT1, PRJ-NT2
#[derive(Default, Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ProjectSettings {
    pub branch_prefix_mode: BranchPrefixMode,
    pub ignore_whitespace: bool,
    pub prompt_finished_notification: PromptFinishedNotification,
    pub play_when_focused: bool,
}

/// Resolve a path to the working directory of its git repository — main repo
/// or worktree, whichever the user actually opened. Worktrees are first-class
/// projects in Slop Mop: opening a worktree means Claude runs in the worktree
/// and commits to the worktree's branch. Canonicalized so equivalent paths
/// (symlinks, trailing slashes) map to the same project row.
// woke2 impl PRJ-WD1, PRJ-WD2, PRJ-WD3, PRJ-WD4
pub fn resolve_workdir(path: &Path) -> Result<PathBuf, Error> {
    let repo = git2::Repository::discover(path)
        .map_err(|_| Error::NotAGitRepo(path.display().to_string()))?;

    let workdir = repo
        .workdir()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| Error::NotAGitRepo("bare repository".to_string()))?;

    workdir
        .canonicalize()
        .map_err(|_| Error::InvalidPath(workdir.display().to_string()))
}

fn get_project_name(path: &Path) -> String {
    path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string()
}

/// Resolve a directory path to a git repo root, upsert into the DB, and return the project.
/// Used by both the `open_project` command and `window::open_project_window`.
// woke2 impl PRJ-UP1, PRJ-UP2
pub fn upsert_project(db: &Db, path: &str) -> Result<Project, Error> {
    let workdir = resolve_workdir(Path::new(path))?;
    let workdir_path = workdir.to_string_lossy().to_string();
    let name = get_project_name(&workdir);
    let id = uuid::Uuid::new_v4().to_string();

    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    conn.execute(
        "INSERT INTO projects (id, name, path, opened_at) VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(path) DO UPDATE SET opened_at = datetime('now'), name = excluded.name",
        rusqlite::params![id, name, workdir_path],
    )
    .map_err(|e| Error::Database(e.to_string()))?;

    let project = conn
        .query_row(
            "SELECT id, name, path, opened_at FROM projects WHERE path = ?1",
            rusqlite::params![workdir_path],
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

// woke2 impl PRJ-LS1
pub fn list_projects(db: &Db) -> Result<Vec<Project>, Error> {
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
pub fn open_project(db: State<'_, Db>, path: String) -> Result<Project, Error> {
    upsert_project(&db, &path)
}

#[tauri::command]
pub fn list_recent_projects(db: State<'_, Db>) -> Result<Vec<Project>, Error> {
    list_projects(&db)
}

// woke2 impl PRJ-RM1
#[tauri::command]
pub fn remove_project(db: State<'_, Db>, id: String) -> Result<(), Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    conn.execute("DELETE FROM projects WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| Error::Database(e.to_string()))?;

    Ok(())
}

/// Read the per-project settings JSON blob, deserializing into `ProjectSettings`.
/// Returns the default settings if the row is missing or the JSON is malformed —
/// settings are non-essential and we never want a parse error to break commits.
// woke2 impl PRJ-ST1, PRJ-ST2
pub fn read_project_settings(db: &Db, project_id: &str) -> Result<ProjectSettings, Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;
    let json: Option<String> = conn
        .query_row(
            "SELECT settings_json FROM projects WHERE id = ?1",
            rusqlite::params![project_id],
            |row| row.get(0),
        )
        .ok();
    Ok(json
        .and_then(|s| serde_json::from_str::<ProjectSettings>(&s).ok())
        .unwrap_or_default())
}

#[tauri::command]
pub fn get_project_settings(
    db: State<'_, Db>,
    project_id: String,
) -> Result<ProjectSettings, Error> {
    read_project_settings(&db, &project_id)
}

// woke2 impl PRJ-ST3
#[tauri::command]
pub fn update_project_settings(
    db: State<'_, Db>,
    project_id: String,
    settings: ProjectSettings,
) -> Result<(), Error> {
    let json = serde_json::to_string(&settings)
        .map_err(|e| Error::Database(format!("serialize settings: {e}")))?;
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;
    conn.execute(
        "UPDATE projects SET settings_json = ?1 WHERE id = ?2",
        rusqlite::params![json, project_id],
    )
    .map_err(|e| Error::Database(e.to_string()))?;
    Ok(())
}

// woke2 impl PRJ-BR1
#[tauri::command]
pub fn get_head_branch(project_path: String) -> Option<String> {
    get_head_branch_name(Path::new(&project_path))
}

/// Compute the prefix that *new* commits would carry given the project's
/// current setting and current branch. Single source of truth for prefix
/// derivation; both the commit path (claude.rs) and the sidebar seed
/// (commits.rs) call this so they can't disagree.
// woke2 impl PRJ-CP1, PRJ-CP2
pub fn current_prefix(db: &Db, project_id: &str, path: &Path) -> Option<String> {
    let settings = read_project_settings(db, project_id).ok()?;
    let branch = get_head_branch_name(path)?;
    derive_branch_prefix(&branch, settings.branch_prefix_mode)
}
