use std::path::Path;

use git2::{Delta, DiffFindOptions, DiffOptions, Repository, Tree};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;
use crate::error::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comment {
    pub id: String,
    pub session_id: String,
    pub commit_hash: String,
    pub file_path: String,
    pub range_start: u32,
    pub range_end: Option<u32>,
    pub contents: String,
    pub created_at: String,
}

/// One normalized diff hunk for projection. `deletions` lists the old-side line
/// numbers removed by this hunk (each value is in `[old_start, old_start + old_lines)`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HunkRange {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub deletions: Vec<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FileChange {
    Unchanged,
    Modified { hunks: Vec<HunkRange> },
    Renamed { new_path: String, hunks: Vec<HunkRange> },
    Deleted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrphanReason {
    LineDeleted,
    FileDeleted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ProjectionResult {
    Located {
        /// Set when the file was renamed; otherwise None (path is unchanged).
        path: Option<String>,
        start: u32,
        end: Option<u32>,
    },
    Orphaned {
        reason: OrphanReason,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectedComment {
    pub comment_id: String,
    pub result: ProjectionResult,
}

/// Result of resolving a workdir line range against HEAD. Workdir-mode comments
/// must anchor against an immutable commit; HEAD is the most recent one
/// containing the line. Lines added since HEAD (uncommitted) have no anchor and
/// are rejected.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AnchorForWorkdir {
    Anchored {
        commit_hash: String,
        line_start: u32,
        line_end: Option<u32>,
    },
    Uncommittable,
}

// ─── Pure projection ──────────────────────────────────────────────────────────

/// Project a 1-based line range from the anchor file's coordinate system into
/// the target's. Pure: no I/O. The caller is responsible for producing
/// `FileChange` from a real diff.
///
/// Range semantics: `end == None` is a single-line comment. When `end` is set,
/// it's strictly greater than `start` (enforced at the storage layer). Any
/// deletion anywhere in `[start, end]` orphans the whole range — a comment
/// that no longer covers what the user marked is no longer locatable.
pub fn project_range(change: &FileChange, start: u32, end: Option<u32>) -> ProjectionResult {
    let (hunks, renamed_path): (&[HunkRange], Option<String>) = match change {
        FileChange::Deleted => {
            return ProjectionResult::Orphaned {
                reason: OrphanReason::FileDeleted,
            }
        }
        FileChange::Unchanged => (&[], None),
        FileChange::Modified { hunks } => (hunks.as_slice(), None),
        FileChange::Renamed { hunks, new_path } => (hunks.as_slice(), Some(new_path.clone())),
    };

    let high = end.unwrap_or(start);
    for line in start..=high {
        if hunks.iter().any(|h| h.deletions.contains(&line)) {
            return ProjectionResult::Orphaned {
                reason: OrphanReason::LineDeleted,
            };
        }
    }

    let new_start = project_line(hunks, start);
    let new_end = end.map(|e| project_line(hunks, e));

    ProjectionResult::Located {
        path: renamed_path,
        start: new_start,
        end: new_end,
    }
}

/// Project a single line number through the hunks. Caller has already
/// verified the line isn't deleted.
fn project_line(hunks: &[HunkRange], line: u32) -> u32 {
    let mut offset: i64 = 0;
    for h in hunks {
        if h.old_lines == 0 {
            // Pure insertion at "after old line `old_start`" (or at the top when
            // old_start == 0). Lines ≤ old_start are not shifted by this hunk.
            if line <= h.old_start {
                return apply_offset(line, offset);
            }
            offset += h.new_lines as i64;
            continue;
        }
        if line < h.old_start {
            return apply_offset(line, offset);
        }
        if line < h.old_start + h.old_lines {
            // Inside this hunk's old range. Map by counting surviving old
            // lines from `old_start` up to `line`, then offset from `new_start`.
            let surviving: u32 = (h.old_start..=line)
                .filter(|n| !h.deletions.contains(n))
                .count() as u32;
            // surviving >= 1 because `line` itself survived (verified above).
            return h.new_start + surviving - 1;
        }
        offset += h.new_lines as i64 - h.old_lines as i64;
    }
    apply_offset(line, offset)
}

fn apply_offset(line: u32, offset: i64) -> u32 {
    let v = line as i64 + offset;
    if v < 1 { 1 } else { v as u32 }
}

// ─── Git-backed diff → FileChange ─────────────────────────────────────────────

/// Compute the file-level change between `anchor_commit` and `target` (None =
/// workdir + index) for the file at `anchor_path` *as of* the anchor commit.
pub fn compute_file_change(
    repo: &Repository,
    anchor_commit: &str,
    anchor_path: &str,
    target_commit: Option<&str>,
) -> Result<FileChange, Error> {
    let anchor_tree = commit_tree(repo, anchor_commit)?;

    let mut opts = DiffOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .context_lines(0);

    let mut diff = match target_commit {
        Some(hash) => {
            let target_tree = commit_tree(repo, hash)?;
            repo.diff_tree_to_tree(Some(&anchor_tree), Some(&target_tree), Some(&mut opts))
                .map_err(Error::Git)?
        }
        None => repo
            .diff_tree_to_workdir_with_index(Some(&anchor_tree), Some(&mut opts))
            .map_err(Error::Git)?,
    };

    let mut find_opts = DiffFindOptions::new();
    find_opts.renames(true).copies(true);
    diff.find_similar(Some(&mut find_opts)).map_err(Error::Git)?;

    let mut found_status: Option<Delta> = None;
    let mut found_new_path: Option<String> = None;
    let mut found_delta_idx: Option<usize> = None;

    for (idx, delta) in diff.deltas().enumerate() {
        let old = delta
            .old_file()
            .path()
            .map(|p| p.to_string_lossy().into_owned());
        if old.as_deref() == Some(anchor_path) {
            found_status = Some(delta.status());
            found_new_path = delta
                .new_file()
                .path()
                .map(|p| p.to_string_lossy().into_owned());
            found_delta_idx = Some(idx);
            break;
        }
    }

    let Some(status) = found_status else {
        return Ok(FileChange::Unchanged);
    };

    if status == Delta::Deleted {
        return Ok(FileChange::Deleted);
    }

    let hunks = collect_hunks_for_delta(&diff, found_delta_idx.unwrap_or(0))?;

    if status == Delta::Renamed {
        let new_path =
            found_new_path.ok_or_else(|| Error::InvalidPath("renamed delta missing new path".into()))?;
        return Ok(FileChange::Renamed { new_path, hunks });
    }

    Ok(FileChange::Modified { hunks })
}

fn commit_tree<'a>(repo: &'a Repository, hash: &str) -> Result<Tree<'a>, Error> {
    let commit = repo
        .revparse_single(hash)
        .map_err(Error::Git)?
        .peel_to_commit()
        .map_err(Error::Git)?;
    commit.tree().map_err(Error::Git)
}

/// Walk the diff and collect the hunks for the file at `delta_idx`.
fn collect_hunks_for_delta(diff: &git2::Diff<'_>, delta_idx: usize) -> Result<Vec<HunkRange>, Error> {
    use std::cell::RefCell;

    let hunks: RefCell<Vec<HunkRange>> = RefCell::new(Vec::new());

    diff.foreach(
        &mut |_, _| true,
        None,
        Some(&mut |delta, hunk| {
            if delta.new_file().id().is_zero() && delta.old_file().id().is_zero() {
                return true;
            }
            let idx = matched_delta_idx(diff, &delta);
            if idx != Some(delta_idx) {
                return true;
            }
            hunks.borrow_mut().push(HunkRange {
                old_start: hunk.old_start(),
                old_lines: hunk.old_lines(),
                new_start: hunk.new_start(),
                new_lines: hunk.new_lines(),
                deletions: Vec::new(),
            });
            true
        }),
        Some(&mut |delta, _hunk_opt, line| {
            let idx = matched_delta_idx(diff, &delta);
            if idx != Some(delta_idx) {
                return true;
            }
            if line.origin() == '-' {
                if let Some(old_no) = line.old_lineno() {
                    if let Some(last) = hunks.borrow_mut().last_mut() {
                        last.deletions.push(old_no);
                    }
                }
            }
            true
        }),
    )
    .map_err(Error::Git)?;

    Ok(hunks.into_inner())
}

fn matched_delta_idx(diff: &git2::Diff<'_>, target: &git2::DiffDelta<'_>) -> Option<usize> {
    let target_old = target.old_file().path()?;
    let target_new = target.new_file().path();
    diff.deltas().position(|d| {
        d.old_file().path() == Some(target_old)
            && d.new_file().path() == target_new
    })
}

// ─── Workdir → HEAD line translation ──────────────────────────────────────────

/// One hunk of a `HEAD → workdir` diff for a single file. `new_to_old[i]` is the
/// HEAD line number for workdir line `new_start + i` when that line is context
/// (origin ' '), or `None` when the line was added in workdir (origin '+').
#[derive(Debug, Clone, PartialEq, Eq)]
struct WorkdirHunk {
    new_start: u32,
    new_lines: u32,
    old_lines: u32,
    new_to_old: Vec<Option<u32>>,
}

/// Coarse classification of a file in the `HEAD → workdir` diff. Used to short-
/// circuit the line-walk when the file is wholly new or unchanged.
#[derive(Debug, Clone, PartialEq, Eq)]
enum WorkdirFile {
    /// The file is unchanged from HEAD; workdir line == HEAD line.
    Identity,
    /// The file is new in workdir (untracked or staged-add) — every line is uncommitted.
    EntirelyAdded,
    /// Normal modified file with hunks.
    Modified(Vec<WorkdirHunk>),
}

fn collect_workdir_file(
    repo: &Repository,
    head_hash: &str,
    file_path: &str,
) -> Result<WorkdirFile, Error> {
    let head_tree = commit_tree(repo, head_hash)?;

    let mut opts = DiffOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .context_lines(0);

    let mut diff = repo
        .diff_tree_to_workdir_with_index(Some(&head_tree), Some(&mut opts))
        .map_err(Error::Git)?;

    let mut find_opts = DiffFindOptions::new();
    find_opts.renames(true).copies(true);
    diff.find_similar(Some(&mut find_opts)).map_err(Error::Git)?;

    let mut found_idx: Option<usize> = None;
    let mut found_status: Option<Delta> = None;
    for (idx, delta) in diff.deltas().enumerate() {
        let new_path = delta
            .new_file()
            .path()
            .map(|p| p.to_string_lossy().into_owned());
        if new_path.as_deref() == Some(file_path) {
            found_idx = Some(idx);
            found_status = Some(delta.status());
            break;
        }
    }

    let Some(target_idx) = found_idx else {
        return Ok(WorkdirFile::Identity);
    };

    match found_status {
        Some(Delta::Added) | Some(Delta::Untracked) => return Ok(WorkdirFile::EntirelyAdded),
        Some(Delta::Deleted) => {
            // The user can't be commenting on a workdir line of a file that
            // doesn't exist in workdir; surface as Uncommittable upstream.
            return Ok(WorkdirFile::EntirelyAdded);
        }
        _ => {}
    }

    use std::cell::RefCell;
    let hunks: RefCell<Vec<WorkdirHunk>> = RefCell::new(Vec::new());

    diff.foreach(
        &mut |_, _| true,
        None,
        Some(&mut |delta, hunk| {
            if matched_delta_idx(&diff, &delta) != Some(target_idx) {
                return true;
            }
            let new_lines = hunk.new_lines();
            hunks.borrow_mut().push(WorkdirHunk {
                new_start: hunk.new_start(),
                new_lines,
                old_lines: hunk.old_lines(),
                new_to_old: vec![None; new_lines as usize],
            });
            true
        }),
        Some(&mut |delta, _hunk_opt, line| {
            if matched_delta_idx(&diff, &delta) != Some(target_idx) {
                return true;
            }
            let origin = line.origin();
            if origin != ' ' && origin != '+' {
                return true;
            }
            let Some(new_no) = line.new_lineno() else {
                return true;
            };
            let mut hs = hunks.borrow_mut();
            let Some(last) = hs.last_mut() else {
                return true;
            };
            if new_no < last.new_start {
                return true;
            }
            let pos = (new_no - last.new_start) as usize;
            if pos >= last.new_to_old.len() {
                return true;
            }
            if origin == ' ' {
                last.new_to_old[pos] = line.old_lineno();
            }
            // origin '+' leaves new_to_old[pos] as None (uncommitted addition).
            true
        }),
    )
    .map_err(Error::Git)?;

    Ok(WorkdirFile::Modified(hunks.into_inner()))
}

/// Translate a workdir line number into its HEAD line number, or None if the
/// line was added in workdir (no HEAD counterpart).
fn workdir_to_head_line(file: &WorkdirFile, line: u32) -> Option<u32> {
    match file {
        WorkdirFile::Identity => Some(line),
        WorkdirFile::EntirelyAdded => None,
        WorkdirFile::Modified(hunks) => {
            // offset = workdir - head, accumulated from hunks fully before `line`.
            let mut offset: i64 = 0;
            for h in hunks {
                if line < h.new_start {
                    let v = line as i64 - offset;
                    return if v >= 1 { Some(v as u32) } else { None };
                }
                if line < h.new_start + h.new_lines {
                    let pos = (line - h.new_start) as usize;
                    return h.new_to_old[pos];
                }
                offset += h.new_lines as i64 - h.old_lines as i64;
            }
            let v = line as i64 - offset;
            if v >= 1 { Some(v as u32) } else { None }
        }
    }
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn create_comment(
    db: State<'_, Db>,
    session_id: String,
    commit_hash: String,
    file_path: String,
    range_start: u32,
    range_end: Option<u32>,
    contents: String,
) -> Result<Comment, Error> {
    if range_start < 1 {
        return Err(Error::InvalidPath(format!(
            "range_start must be >= 1, got {range_start}"
        )));
    }
    if let Some(end) = range_end {
        if end <= range_start {
            return Err(Error::InvalidPath(format!(
                "range_end ({end}) must be greater than range_start ({range_start})"
            )));
        }
    }

    let id = uuid::Uuid::new_v4().to_string();
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    conn.execute(
        "INSERT INTO comments (id, session_id, commit_hash, file_path, range_start, range_end, contents) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, session_id, commit_hash, file_path, range_start, range_end, contents],
    )
    .map_err(|e| Error::Database(e.to_string()))?;

    let comment = conn
        .query_row(
            "SELECT id, session_id, commit_hash, file_path, range_start, range_end, contents, created_at \
             FROM comments WHERE id = ?1",
            rusqlite::params![id],
            row_to_comment,
        )
        .map_err(|e| Error::Database(e.to_string()))?;
    Ok(comment)
}

#[tauri::command]
pub fn list_comments(db: State<'_, Db>, session_id: String) -> Result<Vec<Comment>, Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, commit_hash, file_path, range_start, range_end, contents, created_at \
             FROM comments WHERE session_id = ?1 ORDER BY created_at DESC",
        )
        .map_err(|e| Error::Database(e.to_string()))?;
    let rows = stmt
        .query_map(rusqlite::params![session_id], row_to_comment)
        .map_err(|e| Error::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| Error::Database(e.to_string()))?;
    Ok(rows)
}

#[tauri::command]
pub fn delete_comment(db: State<'_, Db>, id: String) -> Result<(), Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;
    conn.execute("DELETE FROM comments WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| Error::Database(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub fn project_comments(
    db: State<'_, Db>,
    project_path: String,
    comment_ids: Vec<String>,
    target_commit: Option<String>,
) -> Result<Vec<ProjectedComment>, Error> {
    let comments: Vec<Comment> = {
        let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;
        let mut out = Vec::with_capacity(comment_ids.len());
        for id in &comment_ids {
            let c = conn
                .query_row(
                    "SELECT id, session_id, commit_hash, file_path, range_start, range_end, contents, created_at \
                     FROM comments WHERE id = ?1",
                    rusqlite::params![id],
                    row_to_comment,
                )
                .map_err(|e| Error::Database(e.to_string()))?;
            out.push(c);
        }
        out
    };

    let repo = Repository::discover(Path::new(&project_path))
        .map_err(|_| Error::NotAGitRepo(project_path.clone()))?;

    let mut results = Vec::with_capacity(comments.len());
    for c in comments {
        let change = compute_file_change(
            &repo,
            &c.commit_hash,
            &c.file_path,
            target_commit.as_deref(),
        )?;
        let result = project_range(&change, c.range_start, c.range_end);
        results.push(ProjectedComment {
            comment_id: c.id,
            result,
        });
    }
    Ok(results)
}

/// Resolve a workdir line range to an immutable `(commit_hash, line_start, line_end)`
/// anchor by translating workdir lines back to their HEAD positions. Returns
/// `Uncommittable` if any line in the range was added in workdir (no HEAD
/// counterpart). Used by the frontend when opening the comment composer in a
/// workdir-inclusive view.
#[tauri::command]
pub fn anchor_for_workdir(
    project_path: String,
    file_path: String,
    workdir_start: u32,
    workdir_end: Option<u32>,
) -> Result<AnchorForWorkdir, Error> {
    if workdir_start < 1 {
        return Err(Error::InvalidPath(format!(
            "workdir_start must be >= 1, got {workdir_start}"
        )));
    }
    if let Some(end) = workdir_end {
        if end < workdir_start {
            return Err(Error::InvalidPath(format!(
                "workdir_end ({end}) must be >= workdir_start ({workdir_start})"
            )));
        }
    }

    let repo = Repository::discover(Path::new(&project_path))
        .map_err(|_| Error::NotAGitRepo(project_path.clone()))?;

    let head_commit = repo
        .head()
        .and_then(|h| h.peel_to_commit())
        .map_err(Error::Git)?;
    let head_hash = head_commit.id().to_string();

    let workdir_file = collect_workdir_file(&repo, &head_hash, &file_path)?;

    let high = workdir_end.unwrap_or(workdir_start);
    let mut head_start: Option<u32> = None;
    let mut head_end: Option<u32> = None;

    for line in workdir_start..=high {
        match workdir_to_head_line(&workdir_file, line) {
            Some(head_line) => {
                if line == workdir_start {
                    head_start = Some(head_line);
                }
                if line == high {
                    head_end = Some(head_line);
                }
            }
            None => return Ok(AnchorForWorkdir::Uncommittable),
        }
    }

    let line_start = head_start.expect("range has at least one line");
    let line_end = workdir_end.and(head_end);

    Ok(AnchorForWorkdir::Anchored {
        commit_hash: head_hash,
        line_start,
        line_end,
    })
}

fn row_to_comment(row: &rusqlite::Row<'_>) -> rusqlite::Result<Comment> {
    Ok(Comment {
        id: row.get(0)?,
        session_id: row.get(1)?,
        commit_hash: row.get(2)?,
        file_path: row.get(3)?,
        range_start: row.get(4)?,
        range_end: row.get(5)?,
        contents: row.get(6)?,
        created_at: row.get(7)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::{IndexAddOption, Signature};
    use std::fs;
    use tempfile::TempDir;

    // ─── Pure projection tests ────────────────────────────────────────────

    fn loc(start: u32, end: Option<u32>) -> ProjectionResult {
        ProjectionResult::Located {
            path: None,
            start,
            end,
        }
    }

    fn renamed_loc(path: &str, start: u32, end: Option<u32>) -> ProjectionResult {
        ProjectionResult::Located {
            path: Some(path.into()),
            start,
            end,
        }
    }

    fn modified(hunks: Vec<HunkRange>) -> FileChange {
        FileChange::Modified { hunks }
    }

    /// Pure-addition hunk: insert `n` lines after old line `old_after`.
    fn add_after(old_after: u32, new_start: u32, n: u32) -> HunkRange {
        HunkRange {
            old_start: old_after,
            old_lines: 0,
            new_start,
            new_lines: n,
            deletions: Vec::new(),
        }
    }

    /// Pure-deletion hunk: remove old lines `[start, start+n)`.
    fn del(old_start: u32, n: u32, new_start: u32) -> HunkRange {
        HunkRange {
            old_start,
            old_lines: n,
            new_start,
            new_lines: 0,
            deletions: (old_start..old_start + n).collect(),
        }
    }

    #[test]
    fn unchanged_single_line_is_identity() {
        assert_eq!(project_range(&FileChange::Unchanged, 7, None), loc(7, None));
    }

    #[test]
    fn unchanged_range_is_identity() {
        assert_eq!(
            project_range(&FileChange::Unchanged, 3, Some(8)),
            loc(3, Some(8))
        );
    }

    #[test]
    fn deleted_file_orphans() {
        assert_eq!(
            project_range(&FileChange::Deleted, 3, Some(8)),
            ProjectionResult::Orphaned {
                reason: OrphanReason::FileDeleted
            }
        );
    }

    #[test]
    fn rename_with_no_hunks_keeps_lines_changes_path() {
        let change = FileChange::Renamed {
            new_path: "new/path.rs".into(),
            hunks: vec![],
        };
        assert_eq!(
            project_range(&change, 5, Some(10)),
            renamed_loc("new/path.rs", 5, Some(10))
        );
    }

    #[test]
    fn pure_addition_before_line_shifts_down() {
        // Insert 3 lines after old line 2; line 5 → line 8.
        let change = modified(vec![add_after(2, 3, 3)]);
        assert_eq!(project_range(&change, 5, None), loc(8, None));
    }

    #[test]
    fn pure_addition_after_line_does_not_shift() {
        // Insert 3 lines after old line 5; line 5 stays at 5.
        let change = modified(vec![add_after(5, 6, 3)]);
        assert_eq!(project_range(&change, 5, None), loc(5, None));
    }

    #[test]
    fn pure_addition_at_top_shifts_everything() {
        // Insert 4 lines at top (old_start=0); line 1 shifts to 5.
        let change = modified(vec![add_after(0, 1, 4)]);
        assert_eq!(project_range(&change, 1, None), loc(5, None));
        assert_eq!(project_range(&change, 7, None), loc(11, None));
    }

    #[test]
    fn pure_deletion_before_line_shifts_up() {
        // Delete old lines 2..=4 (3 lines); line 10 → 7.
        let change = modified(vec![del(2, 3, 1)]);
        assert_eq!(project_range(&change, 10, None), loc(7, None));
    }

    #[test]
    fn pure_deletion_after_line_does_not_shift() {
        // Delete old lines 7..=9; line 3 stays at 3.
        let change = modified(vec![del(7, 3, 7)]);
        assert_eq!(project_range(&change, 3, None), loc(3, None));
    }

    #[test]
    fn mixed_add_then_delete_before_line_nets_offset() {
        // Add 5 before line 1, delete lines 8..=9 (2 dels); line 20 →
        // 20 + 5 - 2 = 23.
        let change = modified(vec![add_after(0, 1, 5), del(8, 2, 14)]);
        assert_eq!(project_range(&change, 20, None), loc(23, None));
    }

    #[test]
    fn context_line_inside_hunk_maps_via_surviving_count() {
        // Hunk: old [10..=14] (5 lines), 2 of them deleted (11, 13);
        // new starts at 10, 3 surviving lines.
        let change = modified(vec![HunkRange {
            old_start: 10,
            old_lines: 5,
            new_start: 10,
            new_lines: 3,
            deletions: vec![11, 13],
        }]);
        // line 10 is the 1st surviving line in [10..=10] → new_start + 0 = 10.
        assert_eq!(project_range(&change, 10, None), loc(10, None));
        // line 12: surviving in [10..=12] = {10, 12} = 2 → new_start + 1 = 11.
        assert_eq!(project_range(&change, 12, None), loc(11, None));
        // line 14: surviving in [10..=14] = {10, 12, 14} = 3 → new_start + 2 = 12.
        assert_eq!(project_range(&change, 14, None), loc(12, None));
    }

    #[test]
    fn deleted_line_is_orphaned() {
        let change = modified(vec![del(5, 1, 5)]);
        assert_eq!(
            project_range(&change, 5, None),
            ProjectionResult::Orphaned {
                reason: OrphanReason::LineDeleted
            }
        );
    }

    #[test]
    fn range_with_start_deleted_orphans() {
        let change = modified(vec![del(5, 1, 5)]);
        assert_eq!(
            project_range(&change, 5, Some(8)),
            ProjectionResult::Orphaned {
                reason: OrphanReason::LineDeleted
            }
        );
    }

    #[test]
    fn range_with_end_deleted_orphans() {
        let change = modified(vec![del(8, 1, 8)]);
        assert_eq!(
            project_range(&change, 5, Some(8)),
            ProjectionResult::Orphaned {
                reason: OrphanReason::LineDeleted
            }
        );
    }

    #[test]
    fn range_with_interior_deletion_orphans() {
        // Endpoints 5 and 9 survive; interior 7 deleted.
        let change = modified(vec![HunkRange {
            old_start: 5,
            old_lines: 5,
            new_start: 5,
            new_lines: 4,
            deletions: vec![7],
        }]);
        assert_eq!(
            project_range(&change, 5, Some(9)),
            ProjectionResult::Orphaned {
                reason: OrphanReason::LineDeleted
            }
        );
    }

    #[test]
    fn range_straddling_hunk_start_inside_end_outside() {
        // Hunk: insert 3 lines after old line 5. Range [3, 8] → [3, 11].
        let change = modified(vec![add_after(5, 6, 3)]);
        assert_eq!(project_range(&change, 3, Some(8)), loc(3, Some(11)));
    }

    #[test]
    fn range_straddling_hunk_start_outside_end_inside_context() {
        // Hunk old [10..=12] modified to single line; line 11 deleted.
        // Range [11, 12] would orphan due to line 11 deletion. Use [12, 12+] across hunk.
        // Use a hunk that adds 2 lines before line 10: range [5, 11] → [5, 13].
        let change = modified(vec![add_after(9, 10, 2)]);
        assert_eq!(project_range(&change, 5, Some(11)), loc(5, Some(13)));
    }

    #[test]
    fn multiple_hunks_shift_accumulates_after_all() {
        // Two pure-addition hunks before line 100.
        let change = modified(vec![add_after(10, 11, 2), add_after(40, 43, 5)]);
        // Cumulative offset before line 100 = 2 + 5 = 7.
        assert_eq!(project_range(&change, 100, None), loc(107, None));
    }

    #[test]
    fn comment_between_hunks_uses_only_preceding_offset() {
        let change = modified(vec![add_after(10, 11, 2), add_after(40, 43, 5)]);
        // Line 25 is past hunk 1 (offset +2) but before hunk 2.
        assert_eq!(project_range(&change, 25, None), loc(27, None));
    }

    #[test]
    fn adjacent_deletion_then_addition_shifts_by_net() {
        // Delete lines 5..=6 (2), insert 5 lines starting where they were.
        // Line 20 should shift by -2 + 5 = +3.
        let change = modified(vec![
            HunkRange {
                old_start: 5,
                old_lines: 2,
                new_start: 5,
                new_lines: 0,
                deletions: vec![5, 6],
            },
            add_after(6, 5, 5),
        ]);
        assert_eq!(project_range(&change, 20, None), loc(23, None));
    }

    #[test]
    fn boundary_first_line_of_hunk_inside_path() {
        // Hunk old [10..=12], 12 deleted, 10 and 11 survive.
        let change = modified(vec![HunkRange {
            old_start: 10,
            old_lines: 3,
            new_start: 10,
            new_lines: 2,
            deletions: vec![12],
        }]);
        assert_eq!(project_range(&change, 10, None), loc(10, None));
    }

    #[test]
    fn boundary_last_line_of_hunk_inside_path() {
        // Hunk old [10..=12], 10 deleted, 11 and 12 survive.
        let change = modified(vec![HunkRange {
            old_start: 10,
            old_lines: 3,
            new_start: 10,
            new_lines: 2,
            deletions: vec![10],
        }]);
        // line 12: surviving in [10..=12] = {11, 12} = 2 → new_start + 1 = 11.
        assert_eq!(project_range(&change, 12, None), loc(11, None));
    }

    #[test]
    fn smallest_legal_range_projects_both_endpoints() {
        let change = modified(vec![add_after(2, 3, 3)]);
        assert_eq!(project_range(&change, 5, Some(6)), loc(8, Some(9)));
    }

    // ─── Git-backed integration tests ─────────────────────────────────────

    fn make_commit(repo: &Repository, message: &str) -> git2::Oid {
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

    fn ten_lines() -> String {
        (1..=10).map(|i| format!("line {i}\n")).collect()
    }

    #[test]
    fn integration_addition_above_shifts_line() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();

        fs::write(dir.path().join("a.txt"), ten_lines()).unwrap();
        let c1 = make_commit(&repo, "c1");

        // Prepend 3 lines.
        let mut content = String::new();
        content.push_str("new1\nnew2\nnew3\n");
        content.push_str(&ten_lines());
        fs::write(dir.path().join("a.txt"), content).unwrap();
        let c2 = make_commit(&repo, "c2");

        let change = compute_file_change(&repo, &c1.to_string(), "a.txt", Some(&c2.to_string()))
            .unwrap();
        let result = project_range(&change, 5, None);
        assert_eq!(result, loc(8, None));
    }

    #[test]
    fn integration_deletion_orphans() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();

        fs::write(dir.path().join("a.txt"), ten_lines()).unwrap();
        let c1 = make_commit(&repo, "c1");

        // Delete line 5.
        let mut lines: Vec<String> = (1..=10).map(|i| format!("line {i}")).collect();
        lines.remove(4);
        fs::write(dir.path().join("a.txt"), lines.join("\n") + "\n").unwrap();
        let c2 = make_commit(&repo, "c2");

        let change = compute_file_change(&repo, &c1.to_string(), "a.txt", Some(&c2.to_string()))
            .unwrap();
        let result = project_range(&change, 5, None);
        assert!(matches!(
            result,
            ProjectionResult::Orphaned {
                reason: OrphanReason::LineDeleted
            }
        ));
    }

    #[test]
    fn integration_rename_follows_path() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();

        fs::write(dir.path().join("a.txt"), ten_lines()).unwrap();
        let c1 = make_commit(&repo, "c1");

        fs::remove_file(dir.path().join("a.txt")).unwrap();
        fs::write(dir.path().join("b.txt"), ten_lines()).unwrap();
        let c2 = make_commit(&repo, "c2");

        let change = compute_file_change(&repo, &c1.to_string(), "a.txt", Some(&c2.to_string()))
            .unwrap();
        match change {
            FileChange::Renamed { new_path, .. } => assert_eq!(new_path, "b.txt"),
            other => panic!("expected Renamed, got {other:?}"),
        }
    }

    #[test]
    fn integration_file_deletion_orphans() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();

        fs::write(dir.path().join("a.txt"), ten_lines()).unwrap();
        fs::write(dir.path().join("keep.txt"), "x\n").unwrap();
        let c1 = make_commit(&repo, "c1");

        fs::remove_file(dir.path().join("a.txt")).unwrap();
        fs::write(dir.path().join("keep.txt"), "y\n").unwrap();
        let c2 = make_commit(&repo, "c2");

        let change = compute_file_change(&repo, &c1.to_string(), "a.txt", Some(&c2.to_string()))
            .unwrap();
        assert_eq!(change, FileChange::Deleted);
        let result = project_range(&change, 3, Some(7));
        assert!(matches!(
            result,
            ProjectionResult::Orphaned {
                reason: OrphanReason::FileDeleted
            }
        ));
    }

    #[test]
    fn integration_workdir_target() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();

        fs::write(dir.path().join("a.txt"), ten_lines()).unwrap();
        let c1 = make_commit(&repo, "c1");

        // Modify workdir: prepend 2 lines, no commit.
        let mut content = String::new();
        content.push_str("w1\nw2\n");
        content.push_str(&ten_lines());
        fs::write(dir.path().join("a.txt"), content).unwrap();

        let change = compute_file_change(&repo, &c1.to_string(), "a.txt", None).unwrap();
        let result = project_range(&change, 3, None);
        assert_eq!(result, loc(5, None));
    }

    // ─── DB CRUD tests ────────────────────────────────────────────────────

    fn raw_insert(db: &Db, id: &str, range_start: u32, range_end: Option<u32>) -> rusqlite::Result<usize> {
        let conn = db.0.lock().unwrap();
        conn.execute(
            "INSERT INTO comments (id, session_id, commit_hash, file_path, range_start, range_end, contents) \
             VALUES (?1, 's', 'h', 'p', ?2, ?3, 'c')",
            rusqlite::params![id, range_start, range_end],
        )
    }

    // ─── Workdir → HEAD translation tests ─────────────────────────────────

    fn workdir_hunk(
        new_start: u32,
        new_lines: u32,
        old_lines: u32,
        new_to_old: Vec<Option<u32>>,
    ) -> WorkdirHunk {
        WorkdirHunk {
            new_start,
            new_lines,
            old_lines,
            new_to_old,
        }
    }

    #[test]
    fn workdir_to_head_identity_returns_input() {
        assert_eq!(workdir_to_head_line(&WorkdirFile::Identity, 7), Some(7));
    }

    #[test]
    fn workdir_to_head_entirely_added_is_uncommittable() {
        assert_eq!(workdir_to_head_line(&WorkdirFile::EntirelyAdded, 1), None);
        assert_eq!(workdir_to_head_line(&WorkdirFile::EntirelyAdded, 99), None);
    }

    #[test]
    fn workdir_to_head_outside_hunk_uses_offset() {
        // 3 lines added at the top: workdir 10 → head 7.
        let file = WorkdirFile::Modified(vec![workdir_hunk(1, 3, 0, vec![None, None, None])]);
        assert_eq!(workdir_to_head_line(&file, 10), Some(7));
    }

    #[test]
    fn workdir_to_head_addition_inside_hunk_returns_none() {
        // Hunk: workdir lines 5..=7 are all additions.
        let file = WorkdirFile::Modified(vec![workdir_hunk(5, 3, 0, vec![None, None, None])]);
        assert_eq!(workdir_to_head_line(&file, 6), None);
    }

    #[test]
    fn workdir_to_head_context_inside_hunk_uses_recorded_old() {
        // workdir [5..=7]: position 0 is addition, position 1 is context (head 5),
        // position 2 is addition.
        let file = WorkdirFile::Modified(vec![workdir_hunk(5, 3, 1, vec![None, Some(5), None])]);
        assert_eq!(workdir_to_head_line(&file, 6), Some(5));
        assert_eq!(workdir_to_head_line(&file, 5), None);
        assert_eq!(workdir_to_head_line(&file, 7), None);
    }

    #[test]
    fn workdir_to_head_after_pure_deletion_shifts_up() {
        // Pure deletion in HEAD→workdir: 2 lines removed at head [5..=6].
        // new_lines = 0, old_lines = 2, no entries.
        let file = WorkdirFile::Modified(vec![workdir_hunk(5, 0, 2, vec![])]);
        // workdir line 10 → head 12.
        assert_eq!(workdir_to_head_line(&file, 10), Some(12));
    }

    #[test]
    fn integration_anchor_workdir_context_line() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        fs::write(dir.path().join("a.txt"), ten_lines()).unwrap();
        let _c1 = make_commit(&repo, "c1");

        // Modify workdir: prepend 2 lines (uncommitted).
        let mut content = String::new();
        content.push_str("w1\nw2\n");
        content.push_str(&ten_lines());
        fs::write(dir.path().join("a.txt"), content).unwrap();

        // Comment on workdir line 5 ("line 3" in HEAD).
        let r = anchor_for_workdir(
            dir.path().to_string_lossy().into_owned(),
            "a.txt".into(),
            5,
            None,
        )
        .unwrap();
        match r {
            AnchorForWorkdir::Anchored {
                line_start,
                line_end,
                ..
            } => {
                assert_eq!(line_start, 3);
                assert_eq!(line_end, None);
            }
            AnchorForWorkdir::Uncommittable => panic!("expected Anchored"),
        }
    }

    #[test]
    fn integration_anchor_workdir_addition_is_uncommittable() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        fs::write(dir.path().join("a.txt"), ten_lines()).unwrap();
        let _c1 = make_commit(&repo, "c1");

        // Prepend 2 lines uncommitted.
        let mut content = String::new();
        content.push_str("w1\nw2\n");
        content.push_str(&ten_lines());
        fs::write(dir.path().join("a.txt"), content).unwrap();

        // workdir line 1 is an uncommitted addition ("w1").
        let r = anchor_for_workdir(
            dir.path().to_string_lossy().into_owned(),
            "a.txt".into(),
            1,
            None,
        )
        .unwrap();
        assert_eq!(r, AnchorForWorkdir::Uncommittable);
    }

    #[test]
    fn integration_anchor_workdir_range_crossing_addition_is_uncommittable() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        fs::write(dir.path().join("a.txt"), ten_lines()).unwrap();
        let _c1 = make_commit(&repo, "c1");

        let mut content = String::new();
        content.push_str("w1\nw2\n");
        content.push_str(&ten_lines());
        fs::write(dir.path().join("a.txt"), content).unwrap();

        // Range [1, 5] spans both additions and a context line.
        let r = anchor_for_workdir(
            dir.path().to_string_lossy().into_owned(),
            "a.txt".into(),
            1,
            Some(5),
        )
        .unwrap();
        assert_eq!(r, AnchorForWorkdir::Uncommittable);
    }

    #[test]
    fn integration_anchor_workdir_unchanged_file_is_identity() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        fs::write(dir.path().join("a.txt"), ten_lines()).unwrap();
        let _c1 = make_commit(&repo, "c1");

        // No workdir changes — file is identical to HEAD.
        let r = anchor_for_workdir(
            dir.path().to_string_lossy().into_owned(),
            "a.txt".into(),
            7,
            None,
        )
        .unwrap();
        match r {
            AnchorForWorkdir::Anchored {
                line_start,
                line_end,
                ..
            } => {
                assert_eq!(line_start, 7);
                assert_eq!(line_end, None);
            }
            AnchorForWorkdir::Uncommittable => panic!("expected Anchored"),
        }
    }

    #[test]
    fn integration_anchor_workdir_untracked_file_is_uncommittable() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        fs::write(dir.path().join("seed.txt"), "x\n").unwrap();
        let _c1 = make_commit(&repo, "c1");

        fs::write(dir.path().join("new.txt"), "hello\nworld\n").unwrap();
        let r = anchor_for_workdir(
            dir.path().to_string_lossy().into_owned(),
            "new.txt".into(),
            1,
            None,
        )
        .unwrap();
        assert_eq!(r, AnchorForWorkdir::Uncommittable);
    }

    #[test]
    fn db_check_constraints_reject_invalid_ranges() {
        let db = Db::open_in_memory().unwrap();

        // range_start >= 1 enforced.
        assert!(raw_insert(&db, "a", 0, None).is_err());

        // range_end > range_start enforced.
        assert!(raw_insert(&db, "b", 5, Some(5)).is_err());
        assert!(raw_insert(&db, "c", 5, Some(4)).is_err());

        // Valid: NULL end and strictly greater end accepted.
        assert!(raw_insert(&db, "d", 5, None).is_ok());
        assert!(raw_insert(&db, "e", 5, Some(6)).is_ok());
    }
}
