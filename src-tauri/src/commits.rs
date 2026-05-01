use std::path::Path;

use git2::{Repository, message_trailers_strs};
use serde::Serialize;

use crate::error::Error;
use crate::git::{CHECKPOINT_SUBJECT, SESSION_TRAILER_KEY};

#[derive(Debug, Clone, Serialize)]
pub struct SessionCommit {
    pub commit_hash: String,
    pub session_id: String,
    /// First line of the commit message (the prompt).
    pub prompt: String,
    /// Commit time, unix seconds (UTC).
    pub timestamp_unix: i64,
}

#[tauri::command]
pub fn list_session_commits(
    project_path: String,
    session_id: String,
) -> Result<Vec<SessionCommit>, Error> {
    let repo = Repository::discover(Path::new(&project_path))
        .map_err(|_| Error::NotAGitRepo(project_path.clone()))?;

    let mut walk = repo.revwalk().map_err(Error::Git)?;
    // Default sort = topology order from HEAD; no time-based buffering.
    walk.push_head().map_err(Error::Git)?;

    let mut out: Vec<SessionCommit> = Vec::new();
    for oid in walk {
        let oid = oid.map_err(Error::Git)?;
        let commit = repo.find_commit(oid).map_err(Error::Git)?;
        let message = commit.message().unwrap_or("");

        let trailers = match message_trailers_strs(message) {
            Ok(t) => t,
            Err(_) => continue,
        };
        let matches = trailers
            .iter()
            .any(|(k, v)| k == SESSION_TRAILER_KEY && v == session_id);
        if !matches {
            continue;
        }

        let subject = message.lines().next().unwrap_or("").to_string();
        if subject == CHECKPOINT_SUBJECT {
            continue;
        }

        out.push(SessionCommit {
            commit_hash: oid.to_string(),
            session_id: session_id.clone(),
            prompt: subject,
            timestamp_unix: commit.time().seconds(),
        });
    }

    Ok(out)
}
