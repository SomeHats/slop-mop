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

/// Commit with a `Creche-Session-Id` trailer. Tries with the user's hooks
/// first (so pre-commit formatters etc. run normally), and falls back to
/// `--no-verify` if that fails — a hook is allowed to gate real commits but
/// shouldn't block our checkpoints. Always passes `--no-gpg-sign` to avoid
/// pinentry prompts we can't answer. Caller is responsible for staging.
pub fn commit_with_session_trailer(
    cwd: &Path,
    session_id: &str,
    subject: &str,
) -> Result<(), String> {
    let trailer_arg = format!("{SESSION_TRAILER_KEY}={session_id}");
    let base_args = [
        "commit",
        "--no-gpg-sign",
        "--trailer",
        &trailer_arg,
        "-m",
        subject,
    ];

    let first = Command::new("git")
        .args(base_args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("git commit: {e}"))?;
    if first.status.success() {
        return Ok(());
    }
    eprintln!(
        "[git] commit with hooks failed (exit={:?}), retrying --no-verify: {}",
        first.status.code(),
        String::from_utf8_lossy(&first.stderr).trim()
    );

    // Re-stage in case the hook left files in a modified state, then retry.
    let _ = Command::new("git")
        .args(["add", "--all"])
        .current_dir(cwd)
        .status();

    let mut retry_args: Vec<&str> = vec!["commit", "--no-verify"];
    retry_args.extend_from_slice(&base_args[1..]);
    let retry = Command::new("git")
        .args(&retry_args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("git commit (retry): {e}"))?;
    if !retry.status.success() {
        return Err(format!(
            "git commit failed even with --no-verify: {}",
            String::from_utf8_lossy(&retry.stderr)
        ));
    }
    Ok(())
}
