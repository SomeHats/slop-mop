use std::path::Path;

use git2::{Repository, message_trailers_strs};
use rusqlite::OptionalExtension;
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
    /// The slop-mop session id this list belongs to — i.e. the primary the
    /// caller's input Claude session id resolves to via `session_aliases`.
    /// Equal to the input when the input is itself a primary (no row).
    pub primary_session_id: String,
}

/// Walk `git log` from HEAD and pull out commits carrying any of the given
/// session trailers. Pure: no DB access, no app state — call directly in
/// tests. The "primary" id is the one we surface on each returned row; the
/// trailer carries whichever claude id the commit was authored under (which
/// may be an alias).
// woke2 impl SCM-W1, SCM-W2, SCM-W3, SCM-W4, SCM-O1, SCM-O2, SCM-O3, SCM-AL1
fn walk_session_commits(
    project_path: &str,
    primary_session_id: &str,
    claude_session_ids: &[String],
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
            .any(|(k, v)| k == SESSION_TRAILER_KEY && claude_session_ids.iter().any(|s| s == v));
        if !matches {
            continue;
        }

        let subject = message.lines().next().unwrap_or("").to_string();

        out.push(SessionCommit {
            commit_hash: oid.to_string(),
            session_id: primary_session_id.to_string(),
            prompt: subject,
            message: message.to_string(),
            timestamp_unix: commit.time().seconds(),
        });
    }

    Ok(out)
}

/// Resolve any Claude session id to its slop-mop primary. Returns the input
/// unchanged when the id has no row in `session_aliases` — primaries don't
/// store self-rows.
// woke2 impl SCM-AL4
fn resolve_primary_session_id(db: &Db, claude_session_id: &str) -> Result<String, Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;
    let primary: Option<String> = conn
        .query_row(
            "SELECT primary_session_id FROM session_aliases WHERE claude_session_id = ?1",
            rusqlite::params![claude_session_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| Error::Database(e.to_string()))?;
    Ok(primary.unwrap_or_else(|| claude_session_id.to_string()))
}

/// Return every claude session id known to belong to a given primary
/// slop-mop session — the primary id itself plus any aliases recorded in the
/// `session_aliases` table.
// woke2 impl SCM-AL2
fn expand_session_ids(db: &Db, primary_session_id: &str) -> Result<Vec<String>, Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;
    let mut stmt = conn
        .prepare(
            "SELECT claude_session_id FROM session_aliases WHERE primary_session_id = ?1",
        )
        .map_err(|e| Error::Database(e.to_string()))?;
    let rows = stmt
        .query_map(rusqlite::params![primary_session_id], |row| row.get::<_, String>(0))
        .map_err(|e| Error::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| Error::Database(e.to_string()))?;

    let mut ids = vec![primary_session_id.to_string()];
    for r in rows {
        if !ids.contains(&r) {
            ids.push(r);
        }
    }
    Ok(ids)
}

// woke2 impl SCM-P1, SCM-P2, SCM-AL5
#[tauri::command]
pub fn list_session_commits(
    db: State<'_, Db>,
    project_id: String,
    project_path: String,
    session_id: String,
) -> Result<SessionCommitsResult, Error> {
    // Input may be either a primary or any aliased Claude id (e.g. the user
    // resumed an aliased session at startup); always anchor on the resolved
    // primary so the alias chain stays intact across restarts.
    let primary = resolve_primary_session_id(&db, &session_id)?;
    let claude_ids = expand_session_ids(&db, &primary)?;
    let commits = walk_session_commits(&project_path, &primary, &claude_ids)?;
    let prefix = current_prefix(&db, &project_id, Path::new(&project_path));
    Ok(SessionCommitsResult {
        commits,
        current_prefix: prefix,
        primary_session_id: primary,
    })
}

// woke2 impl SCM-AL3
fn add_session_alias_inner(
    db: &Db,
    claude_session_id: &str,
    primary_session_id: &str,
) -> Result<(), Error> {
    if claude_session_id == primary_session_id {
        // Self-alias is a no-op; the primary id is always implicitly part of
        // the set returned by `expand_session_ids`.
        return Ok(());
    }
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;
    conn.execute(
        "INSERT OR REPLACE INTO session_aliases (claude_session_id, primary_session_id) \
         VALUES (?1, ?2)",
        rusqlite::params![claude_session_id, primary_session_id],
    )
    .map_err(|e| Error::Database(e.to_string()))?;
    Ok(())
}

/// Mark `claude_session_id` as an alias of `primary_session_id`. Used when the
/// user picks "continue" after Claude issues a fresh session id mid-flow
/// (`/clear`, `/compact`, etc.) and the slop-mop session should still group
/// the commits under one primary.
#[tauri::command]
pub fn add_session_alias(
    db: State<'_, Db>,
    claude_session_id: String,
    primary_session_id: String,
) -> Result<(), Error> {
    add_session_alias_inner(&db, &claude_session_id, &primary_session_id)
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

        let out = walk_session_commits(
            &dir.path().to_string_lossy(),
            "sess1",
            &["sess1".to_string()],
        )
        .unwrap();

        assert_eq!(out.len(), 2);
        // Newest first.
        assert_eq!(out[0].prompt, "alex/foo: subject B");
        assert_eq!(out[0].message, msg_b);
        assert_eq!(out[1].prompt, "subject A");
        assert_eq!(out[1].message, msg_a);
    }

    // woke2 test SCM-AL1, SCM-AL2
    #[test]
    fn walk_session_commits_matches_any_aliased_id() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();

        // Three commits: one under the original claude session id, one under an
        // aliased id (e.g., the user picked "continue" after /clear), and one
        // under an unrelated session.
        make_commit(
            &repo,
            "a.txt",
            "a",
            "subject A\n\nSlop-Mop-Session-Id: original\n",
        );
        make_commit(
            &repo,
            "b.txt",
            "b",
            "subject B\n\nSlop-Mop-Session-Id: after-clear\n",
        );
        make_commit(
            &repo,
            "c.txt",
            "c",
            "subject C\n\nSlop-Mop-Session-Id: unrelated\n",
        );

        let out = walk_session_commits(
            &dir.path().to_string_lossy(),
            "original",
            &["original".to_string(), "after-clear".to_string()],
        )
        .unwrap();

        assert_eq!(out.len(), 2);
        // Newest first.
        assert_eq!(out[0].prompt, "subject B");
        assert_eq!(out[1].prompt, "subject A");
        // Both rows surface the primary id, regardless of the trailer that
        // matched.
        assert_eq!(out[0].session_id, "original");
        assert_eq!(out[1].session_id, "original");
    }

    // woke2 test SCM-AL4
    #[test]
    fn resolve_primary_session_id_follows_alias() {
        let db = Db::open_in_memory().unwrap();
        // Unaliased id resolves to itself.
        assert_eq!(
            resolve_primary_session_id(&db, "loner").unwrap(),
            "loner".to_string()
        );

        add_session_alias_inner(&db, "after-clear", "original").unwrap();

        // Aliased id resolves to its primary.
        assert_eq!(
            resolve_primary_session_id(&db, "after-clear").unwrap(),
            "original".to_string()
        );
        // The primary itself isn't in the table — it still resolves to itself.
        assert_eq!(
            resolve_primary_session_id(&db, "original").unwrap(),
            "original".to_string()
        );
    }

    // woke2 test SCM-AL2, SCM-AL3
    #[test]
    fn expand_and_alias_round_trip() {
        let db = Db::open_in_memory().unwrap();

        // No aliases yet → only the primary itself.
        let ids = expand_session_ids(&db, "primary").unwrap();
        assert_eq!(ids, vec!["primary".to_string()]);

        add_session_alias_inner(&db, "alias-a", "primary").unwrap();
        add_session_alias_inner(&db, "alias-b", "primary").unwrap();

        let mut ids = expand_session_ids(&db, "primary").unwrap();
        ids.sort();
        assert_eq!(
            ids,
            vec!["alias-a".to_string(), "alias-b".to_string(), "primary".to_string()]
        );

        // Self-alias is a no-op (no row inserted).
        add_session_alias_inner(&db, "primary", "primary").unwrap();
        let mut ids = expand_session_ids(&db, "primary").unwrap();
        ids.sort();
        assert_eq!(ids.len(), 3);
    }
}
