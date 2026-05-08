use std::path::Path;

use git2::{Repository, message_trailers_strs};
use serde::Serialize;

use crate::error::Error;
use crate::git::{SESSION_TRAILER_KEY, SUBJECT_TRAILER_KEY};

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

        // Prefer the un-prefixed subject trailer (written when a branch
        // prefix was applied) so the sidebar shows the clean subject. Fall
        // back to the commit's first line for commits without the trailer.
        let subject = trailers
            .iter()
            .find(|(k, _)| *k == SUBJECT_TRAILER_KEY)
            .map(|(_, v)| v.to_string())
            .unwrap_or_else(|| message.lines().next().unwrap_or("").to_string());

        out.push(SessionCommit {
            commit_hash: oid.to_string(),
            session_id: session_id.clone(),
            prompt: subject,
            timestamp_unix: commit.time().seconds(),
        });
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use git2::{IndexAddOption, Repository, Signature};
    use std::fs;
    use tempfile::TempDir;

    use super::*;

    fn make_commit(repo: &Repository, file: &str, contents: &str, message: &str) -> git2::Oid {
        fs::write(repo.workdir().unwrap().join(file), contents).unwrap();
        let sig = Signature::now("test", "test@example.com").unwrap();
        let mut index = repo.index().unwrap();
        index
            .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
            .unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let parents: Vec<git2::Commit<'_>> = match repo.head() {
            Ok(h) => vec![h.peel_to_commit().unwrap()],
            Err(_) => vec![],
        };
        let parent_refs: Vec<&git2::Commit<'_>> = parents.iter().collect();
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parent_refs)
            .unwrap()
    }

    #[test]
    fn list_session_commits_prefers_subject_trailer_when_present() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();

        // Older: no subject trailer, sidebar should fall back to the first line.
        make_commit(
            &repo,
            "a.txt",
            "a",
            "subject A\n\nbody\n\nSlop-Mop-Session-Id: sess1\n",
        );

        // Newer: prefixed subject in first line, un-prefixed value in trailer.
        make_commit(
            &repo,
            "b.txt",
            "b",
            "alex/foo: subject B\n\nbody\n\nSlop-Mop-Session-Id: sess1\nSlop-Mop-Subject: subject B\n",
        );

        // A commit on a different session — should be filtered out entirely.
        make_commit(
            &repo,
            "c.txt",
            "c",
            "subject C\n\nbody\n\nSlop-Mop-Session-Id: other\n",
        );

        let out = list_session_commits(
            dir.path().to_string_lossy().to_string(),
            "sess1".to_string(),
        )
        .unwrap();

        assert_eq!(out.len(), 2, "should only include sess1 commits");
        // Newest first.
        assert_eq!(out[0].prompt, "subject B", "trailer wins over first line");
        assert_eq!(
            out[1].prompt, "subject A",
            "no trailer → falls back to first line",
        );
    }
}
