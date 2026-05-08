use std::path::Path;

use git2::{Repository, message_trailers_strs};
use serde::Serialize;
use tauri::State;

use crate::db::Db;
use crate::error::Error;
use crate::git::SESSION_TRAILER_KEY;
use crate::project::current_prefix;

#[derive(Debug, Clone, Serialize)]
pub struct SessionCommit {
    pub commit_hash: String,
    pub session_id: String,
    /// First line of the commit message — possibly carrying a branch prefix
    /// (e.g. `alex/foo: subject`). The sidebar strips the *current* prefix
    /// for display; the prefix-as-stored is preserved in `message`.
    pub prompt: String,
    /// The full commit message, body and trailers included. The sidebar
    /// surfaces this as the row's hover-title.
    pub message: String,
    /// Commit time, unix seconds (UTC).
    pub timestamp_unix: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionCommitsResult {
    pub commits: Vec<SessionCommit>,
    /// The branch-prefix that *new* commits would carry given the project's
    /// current setting and current branch. The sidebar uses this to strip
    /// matching prefixes off displayed subjects. `None` when no prefix
    /// applies (mode=`none`, detached HEAD, or settings unreadable).
    pub current_prefix: Option<String>,
}

/// Walk `git log` from HEAD and pull out commits carrying the given session
/// trailer. Pure: no DB access, no app state — call directly in tests.
// woke2 impl SCM-W1, SCM-W2, SCM-W3, SCM-W4, SCM-O1, SCM-O2, SCM-O3
fn walk_session_commits(
    project_path: &str,
    session_id: &str,
) -> Result<Vec<SessionCommit>, Error> {
    let repo = Repository::discover(Path::new(project_path))
        .map_err(|_| Error::NotAGitRepo(project_path.to_string()))?;

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

        out.push(SessionCommit {
            commit_hash: oid.to_string(),
            session_id: session_id.to_string(),
            prompt: subject,
            message: message.to_string(),
            timestamp_unix: commit.time().seconds(),
        });
    }

    Ok(out)
}

// woke2 impl SCM-P1, SCM-P2
#[tauri::command]
pub fn list_session_commits(
    db: State<'_, Db>,
    project_id: String,
    project_path: String,
    session_id: String,
) -> Result<SessionCommitsResult, Error> {
    let commits = walk_session_commits(&project_path, &session_id)?;
    let prefix = current_prefix(&db, &project_id, Path::new(&project_path));
    Ok(SessionCommitsResult {
        commits,
        current_prefix: prefix,
    })
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

    // woke2 test SCM-W2, SCM-O1, SCM-O2, SCM-O3
    #[test]
    fn list_session_commits_returns_subject_and_full_message() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();

        let msg_a = "subject A\n\nbody A\n\nSlop-Mop-Session-Id: sess1\n";
        make_commit(&repo, "a.txt", "a", msg_a);

        // A prefixed commit — the prefix stays in the prompt; runtime stripping
        // happens on the frontend.
        let msg_b = "alex/foo: subject B\n\nbody B\n\nSlop-Mop-Session-Id: sess1\n";
        make_commit(&repo, "b.txt", "b", msg_b);

        // Other-session commit, filtered out.
        make_commit(
            &repo,
            "c.txt",
            "c",
            "subject C\n\nbody\n\nSlop-Mop-Session-Id: other\n",
        );

        let out = walk_session_commits(&dir.path().to_string_lossy(), "sess1").unwrap();

        assert_eq!(out.len(), 2);
        // Newest first.
        assert_eq!(out[0].prompt, "alex/foo: subject B");
        assert_eq!(out[0].message, msg_b);
        assert_eq!(out[1].prompt, "subject A");
        assert_eq!(out[1].message, msg_a);
    }
}
