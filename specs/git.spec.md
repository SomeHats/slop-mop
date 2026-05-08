---
name: Git plumbing for auto-commits
description: Branch-prefix derivation, commit-with-trailer, and HEAD inspection used by the auto-commit pipeline
---

# Git plumbing

Helpers used by the [auto-commit hooks](claude.spec.md). The session trailer key (`Slop-Mop-Session-Id`) is the only linkage between Claude sessions and their commits — see [session commit log](commits.spec.md).

## HEAD inspection

- !GIT-HD1 `get_head_commit_hash` resolves HEAD via `git2::Repository::discover` and returns the OID as a string
- !GIT-HD2 `get_head_commit_message` returns the full message of the HEAD commit (subject + body + trailers)
- !GIT-HD3 `get_head_branch_name` returns the branch shortname for normal HEADs, or `None` for detached HEAD
- !GIT-HD4 Non-repo paths return `Error::NotAGitRepo` (HEAD lookup) or `None` (branch lookup)

## Branch-prefix derivation

`derive_branch_prefix(branch, mode)` is the single source of truth for prefix derivation. Both the commit path (claude.rs) and the sidebar seed (commits.rs) call it so they can't disagree.

- !GIT-BP1 `BranchPrefixMode::None` returns `None` for any branch (no prefix applied)
- !GIT-BP2 `BranchPrefixMode::Full` returns the entire branch name as the prefix
- !GIT-BP3 `BranchPrefixMode::Feature` returns everything after the first `/`, preserving multi-slash tails (`alex/feature/foo` → `feature/foo`)
- !GIT-BP4 `Feature` mode falls back to the full branch when there's no `/` (e.g. `main` → `main`)
- !GIT-BP5 Empty branch name returns `None` regardless of mode
- !GIT-BP6 `BranchPrefixMode` defaults to `None` and serializes as kebab-case for storage in project settings

## Staging and dirty check

- !GIT-ST1 `stage_all_and_check_dirty` runs `git add --all` then `git diff --cached --quiet`; non-zero diff exit means staged changes exist
- !GIT-ST2 Returns `Err` if either `git add` or `git diff` fails to spawn

## Commit with session trailer

`commit_with_session_trailer` is the commit primitive shared by the checkpoint and post-prompt commits.

- !GIT-CO1 Always passes `--no-gpg-sign` to avoid pinentry prompts the app can't answer
- !GIT-CO2 Adds a `Slop-Mop-Session-Id=<session_id>` trailer plus any caller-supplied extras
- !GIT-CO3 Tries first with the user's hooks active so pre-commit formatters run normally
- !GIT-CO4 If the first attempt fails, re-stages (in case the hook touched files) and retries with `--no-verify` — a hook can gate real commits but should not block our checkpoints
- !GIT-CO5 Returns `Err` only when even `--no-verify` fails

## SESSION_TRAILER_KEY

- !GIT-TR1 `SESSION_TRAILER_KEY = "Slop-Mop-Session-Id"` is the public constant; commits.rs filters by it and claude.rs writes it
