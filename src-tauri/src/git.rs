use std::path::Path;
use std::process::Command;

use crate::error::Error;

pub const SESSION_TRAILER_KEY: &str = "Creche-Session-Id";
pub const CHECKPOINT_SUBJECT: &str = "check point";

pub fn get_head_commit_hash(path: &Path) -> Result<String, Error> {
    let repo = git2::Repository::discover(path)
        .map_err(|_| Error::NotAGitRepo(path.display().to_string()))?;
    let head = repo.head().map_err(Error::Git)?;
    let commit = head.peel_to_commit().map_err(Error::Git)?;
    Ok(commit.id().to_string())
}

/// True when the working tree (after `git add --all`) has staged changes.
/// `git diff --cached --quiet` exits non-zero when the index differs from HEAD.
pub fn stage_all_and_check_dirty(cwd: &Path) -> Result<bool, String> {
    let add = Command::new("git")
        .args(["add", "--all"])
        .current_dir(cwd)
        .status()
        .map_err(|e| format!("git add: {e}"))?;
    if !add.success() {
        return Err(format!("git add --all exit={:?}", add.code()));
    }
    let diff = Command::new("git")
        .args(["diff", "--cached", "--quiet"])
        .current_dir(cwd)
        .status()
        .map_err(|e| format!("git diff --cached: {e}"))?;
    Ok(!diff.success())
}

/// Run `git commit --no-verify --no-gpg-sign --trailer "Creche-Session-Id=<id>" -m <subject>`.
/// Caller is responsible for staging beforehand and confirming there are changes.
pub fn commit_with_session_trailer(
    cwd: &Path,
    session_id: &str,
    subject: &str,
) -> Result<(), String> {
    let trailer_arg = format!("{SESSION_TRAILER_KEY}={session_id}");
    let out = Command::new("git")
        .args([
            "commit",
            "--no-verify",
            "--no-gpg-sign",
            "--trailer",
            &trailer_arg,
            "-m",
            subject,
        ])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("git commit: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "git commit failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(())
}
