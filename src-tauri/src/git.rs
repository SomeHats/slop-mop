use std::path::Path;
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::error::Error;

// woke2 impl GIT-TR1
pub const SESSION_TRAILER_KEY: &str = "Slop-Mop-Session-Id";

// woke2 impl GIT-BP6
#[derive(Default, Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BranchPrefixMode {
    #[default]
    None,
    Full,
    Feature,
}

// woke2 impl GIT-HD1, GIT-HD4
pub fn get_head_commit_hash(path: &Path) -> Result<String, Error> {
    let repo = git2::Repository::discover(path)
        .map_err(|_| Error::NotAGitRepo(path.display().to_string()))?;
    let head = repo.head().map_err(Error::Git)?;
    let commit = head.peel_to_commit().map_err(Error::Git)?;
    Ok(commit.id().to_string())
}

/// Read the full commit message of HEAD. Used to populate the realtime
/// `prompt-committed` event so the sidebar's hover-title has the same body
/// the historical seed gets via `list_session_commits`.
// woke2 impl GIT-HD2
pub fn get_head_commit_message(path: &Path) -> Result<String, Error> {
    let repo = git2::Repository::discover(path)
        .map_err(|_| Error::NotAGitRepo(path.display().to_string()))?;
    let head = repo.head().map_err(Error::Git)?;
    let commit = head.peel_to_commit().map_err(Error::Git)?;
    Ok(commit.message().unwrap_or("").to_string())
}

/// Resolve the current branch's short name (e.g. `alex/feature`). Returns
/// `None` for detached HEAD or any other state where there's no branch to
/// prefix with — callers treat `None` as "skip the prefix".
// woke2 impl GIT-HD3
pub fn get_head_branch_name(path: &Path) -> Option<String> {
    let repo = git2::Repository::discover(path).ok()?;
    let head = repo.head().ok()?;
    if !head.is_branch() {
        return None;
    }
    head.shorthand().map(|s| s.to_string())
}

/// Derive the prefix string to apply to a commit subject for a given branch
/// + mode. `None` means no prefix; the caller emits the subject as-is.
///
/// `feature` mode strips only the *first* `/`-segment so multi-slash branches
/// like `alex/feature/foo` keep `feature/foo` (matches the
/// `<author>/<short-description>` convention where the description may
/// itself contain slashes).
// woke2 impl GIT-BP1, GIT-BP2, GIT-BP3, GIT-BP4, GIT-BP5
pub fn derive_branch_prefix(branch: &str, mode: BranchPrefixMode) -> Option<String> {
    if branch.is_empty() {
        return None;
    }
    match mode {
        BranchPrefixMode::None => None,
        BranchPrefixMode::Full => Some(branch.to_string()),
        BranchPrefixMode::Feature => match branch.split_once('/') {
            Some((_, after)) if !after.is_empty() => Some(after.to_string()),
            _ => Some(branch.to_string()),
        },
    }
}

/// True when the working tree (after `git add --all`) has staged changes.
/// `git diff --cached --quiet` exits non-zero when the index differs from HEAD.
// woke2 impl GIT-ST1, GIT-ST2
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

/// Commit with a `Slop-Mop-Session-Id` trailer plus any `extra_trailers`
/// caller provides (e.g. the un-prefixed subject for sidebar display). Tries
/// with the user's hooks first (so pre-commit formatters etc. run normally),
/// and falls back to `--no-verify` if that fails — a hook is allowed to gate
/// real commits but shouldn't block our checkpoints. Always passes
/// `--no-gpg-sign` to avoid pinentry prompts we can't answer. Caller is
/// responsible for staging.
// woke2 impl GIT-CO1, GIT-CO2, GIT-CO3, GIT-CO4, GIT-CO5
pub fn commit_with_session_trailer(
    cwd: &Path,
    session_id: &str,
    message: &str,
    extra_trailers: &[(&str, &str)],
) -> Result<(), String> {
    let session_trailer = format!("{SESSION_TRAILER_KEY}={session_id}");
    let extra_trailer_strs: Vec<String> = extra_trailers
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect();

    let mut base_args: Vec<&str> = vec!["commit", "--no-gpg-sign"];
    base_args.extend(["--trailer", session_trailer.as_str()]);
    for t in &extra_trailer_strs {
        base_args.extend(["--trailer", t.as_str()]);
    }
    base_args.extend(["-m", message]);

    let first = Command::new("git")
        .args(&base_args)
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

#[cfg(test)]
mod tests {
    use super::*;

    // woke2 test GIT-BP1
    #[test]
    fn derive_branch_prefix_none_returns_none_for_any_branch() {
        assert_eq!(derive_branch_prefix("alex/foo", BranchPrefixMode::None), None);
        assert_eq!(derive_branch_prefix("main", BranchPrefixMode::None), None);
    }

    // woke2 test GIT-BP2
    #[test]
    fn derive_branch_prefix_full_returns_full_branch() {
        assert_eq!(
            derive_branch_prefix("alex/foo", BranchPrefixMode::Full).as_deref(),
            Some("alex/foo"),
        );
        assert_eq!(
            derive_branch_prefix("main", BranchPrefixMode::Full).as_deref(),
            Some("main"),
        );
    }

    // woke2 test GIT-BP3
    #[test]
    fn derive_branch_prefix_feature_strips_first_segment() {
        assert_eq!(
            derive_branch_prefix("alex/foo", BranchPrefixMode::Feature).as_deref(),
            Some("foo"),
        );
        // Multi-slash: keep everything after the first `/`.
        assert_eq!(
            derive_branch_prefix("alex/feature/foo", BranchPrefixMode::Feature).as_deref(),
            Some("feature/foo"),
        );
    }

    // woke2 test GIT-BP4
    #[test]
    fn derive_branch_prefix_feature_falls_back_to_full_for_no_slash() {
        assert_eq!(
            derive_branch_prefix("main", BranchPrefixMode::Feature).as_deref(),
            Some("main"),
        );
    }

    // woke2 test GIT-BP5
    #[test]
    fn derive_branch_prefix_returns_none_for_empty_branch() {
        for mode in [
            BranchPrefixMode::None,
            BranchPrefixMode::Full,
            BranchPrefixMode::Feature,
        ] {
            assert_eq!(derive_branch_prefix("", mode), None);
        }
    }

    // woke2 test GIT-HD3
    #[test]
    fn get_head_branch_name_returns_branch_in_normal_repo() {
        let dir = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(dir.path()).unwrap();
        // The default branch name varies by git config; rename to something
        // predictable so the assertion doesn't depend on the host's
        // `init.defaultBranch`. We have to create the branch before pointing
        // HEAD at it — `set_head` itself accepts non-existent refs.
        let sig = git2::Signature::now("test", "t@t").unwrap();
        let tree_id = {
            let mut idx = repo.index().unwrap();
            idx.write_tree().unwrap()
        };
        let tree = repo.find_tree(tree_id).unwrap();
        let head_commit_oid = repo
            .commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
            .unwrap();
        let head_commit = repo.find_commit(head_commit_oid).unwrap();
        repo.branch("alex/feature", &head_commit, true).unwrap();
        repo.set_head("refs/heads/alex/feature").unwrap();

        assert_eq!(
            get_head_branch_name(dir.path()).as_deref(),
            Some("alex/feature"),
        );
    }

    // woke2 test GIT-HD3
    #[test]
    fn get_head_branch_name_returns_none_when_detached() {
        let dir = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(dir.path()).unwrap();
        let sig = git2::Signature::now("test", "t@t").unwrap();
        let tree_id = {
            let mut idx = repo.index().unwrap();
            idx.write_tree().unwrap()
        };
        let tree = repo.find_tree(tree_id).unwrap();
        let oid = repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[]).unwrap();
        repo.set_head_detached(oid).unwrap();

        assert_eq!(get_head_branch_name(dir.path()), None);
    }
}
