use std::path::Path;

use git2::{Delta, DiffFormat, DiffOptions, Repository};
use serde::Serialize;

use crate::error::Error;

#[derive(Debug, Clone, Serialize)]
pub struct DiffStats {
    pub commit_hash: String,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct HunkLine {
    pub origin: char,
    pub content: String,
    pub old_line_no: Option<u32>,
    pub new_line_no: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiffHunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<HunkLine>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileDiff {
    pub path: String,
    pub status: String,
    pub old_path: Option<String>,
    pub hunks: Vec<DiffHunk>,
    pub additions: u32,
    pub deletions: u32,
}

fn delta_to_status(delta: Delta) -> &'static str {
    match delta {
        Delta::Added => "added",
        Delta::Deleted => "deleted",
        Delta::Modified => "modified",
        Delta::Renamed => "renamed",
        Delta::Copied => "copied",
        Delta::Typechange => "typechange",
        other => {
            eprintln!("[diff] unrecognised git delta variant: {:?}", other);
            "unknown"
        }
    }
}

/// Diff a commit against its first parent. For root commits (no parent),
/// returns a tree-to-empty diff so additions show up against nothing.
fn diff_commit_vs_parent<'a>(repo: &'a Repository, hash: &str) -> Result<git2::Diff<'a>, Error> {
    let commit = repo
        .revparse_single(hash)
        .map_err(Error::Git)?
        .peel_to_commit()
        .map_err(Error::Git)?;
    let new_tree = commit.tree().map_err(Error::Git)?;
    let parent_tree = match commit.parent(0) {
        Ok(parent) => Some(parent.tree().map_err(Error::Git)?),
        Err(_) => None, // root commit
    };

    let mut opts = DiffOptions::new();
    opts.include_untracked(true).context_lines(100_000);

    repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&new_tree), Some(&mut opts))
        .map_err(Error::Git)
}

fn stats_from_diff(diff: &git2::Diff<'_>) -> Result<(u32, u32), Error> {
    let stats = diff.stats().map_err(Error::Git)?;
    Ok((stats.insertions() as u32, stats.deletions() as u32))
}

#[tauri::command]
pub fn batch_diff_stats(
    project_path: String,
    commit_hashes: Vec<String>,
) -> Result<Vec<DiffStats>, Error> {
    let repo = Repository::discover(Path::new(&project_path))
        .map_err(|_| Error::NotAGitRepo(project_path.clone()))?;

    let mut results = Vec::with_capacity(commit_hashes.len());
    for commit_hash in &commit_hashes {
        let diff = diff_commit_vs_parent(&repo, commit_hash)?;
        let (additions, deletions) = stats_from_diff(&diff)?;
        results.push(DiffStats {
            commit_hash: commit_hash.clone(),
            additions,
            deletions,
        });
    }

    Ok(results)
}

#[tauri::command]
pub fn get_repo_diff(project_path: String, commit_hash: String) -> Result<Vec<FileDiff>, Error> {
    let repo = Repository::discover(Path::new(&project_path))
        .map_err(|_| Error::NotAGitRepo(project_path.clone()))?;

    let diff = diff_commit_vs_parent(&repo, &commit_hash)?;

    let mut file_diffs: Vec<FileDiff> = Vec::new();

    diff.print(
        DiffFormat::Patch,
        |delta: git2::DiffDelta<'_>,
         hunk: Option<git2::DiffHunk<'_>>,
         line: git2::DiffLine<'_>| {
            let path = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|p: &Path| p.to_string_lossy().to_string())
                .unwrap_or_default();

            let status = delta_to_status(delta.status());
            let old_path = if delta.status() == Delta::Renamed {
                delta
                    .old_file()
                    .path()
                    .map(|p: &Path| p.to_string_lossy().to_string())
            } else {
                None
            };

            // Find or create file entry
            let need_new =
                file_diffs.last().map_or(true, |last| last.path != path || last.status != status);
            if need_new {
                file_diffs.push(FileDiff {
                    path,
                    status: status.to_string(),
                    old_path,
                    hunks: Vec::new(),
                    additions: 0,
                    deletions: 0,
                });
            }
            let file_entry = file_diffs.last_mut().unwrap();

            // If this is a hunk header, start a new hunk
            if let Some(h) = hunk {
                let should_add = file_entry
                    .hunks
                    .last()
                    .map(|last| last.old_start != h.old_start() || last.new_start != h.new_start())
                    .unwrap_or(true);
                if should_add {
                    file_entry.hunks.push(DiffHunk {
                        old_start: h.old_start(),
                        old_lines: h.old_lines(),
                        new_start: h.new_start(),
                        new_lines: h.new_lines(),
                        lines: Vec::new(),
                    });
                }
            }

            // Add line to current hunk
            let origin = line.origin();
            if matches!(origin, '+' | '-' | ' ') {
                if let Some(current_hunk) = file_entry.hunks.last_mut() {
                    let content = std::str::from_utf8(line.content())
                        .unwrap_or("")
                        .trim_end_matches(['\n', '\r'])
                        .to_string();
                    current_hunk.lines.push(HunkLine {
                        origin,
                        content,
                        old_line_no: line.old_lineno(),
                        new_line_no: line.new_lineno(),
                    });

                    if origin == '+' {
                        file_entry.additions += 1;
                    } else if origin == '-' {
                        file_entry.deletions += 1;
                    }
                }
            }

            true
        },
    )
    .map_err(Error::Git)?;

    Ok(file_diffs)
}
