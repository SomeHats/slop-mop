# /woke2-audit

A branch-level review for circumspection: are specs complete, are changes careful, is anything rushed? Is the backlog accurate?

### Procedure

1. **Run mechanical checks.** Execute `npm run woke2:check` and report failures. A green check is necessary but not sufficient.

2. **Get the diff.**

- If the working tree is dirty, compare against `HEAD`. Otherwise compare `HEAD` against the default branch from the merge base:

  ```bash
  if [ -n "$(git status --porcelain)" ]; then
    git diff HEAD
  else
    git diff "$(git merge-base HEAD main)"...HEAD
  fi
  ```

- If the diff is empty ask the user for clarification before proceeding.

3. **Evaluate new behaviors in spec files**

- Look through the diff for new behaviors defined in spec files
- For each of these find the pragmas that reference them and the following code units that implement them.
- Check: does the described behavior match the referenced code?
- Think: was the pragma placed at a fine-grained enough level? It should target the smallest unit of code that implements the behavior.
- Think: looking at the code, does it implement nuanced behavior that isn't captured in the spec, and isn't captured in one the other behaviors listed in a pragma that targets the same code unit?
- Think: is this the best way to implement the behavior? Are there more idiomatic ways or more performant ways?

4. **Evaluate modified behaviors in spec files**

- Look through the diff for modified behaviors in spec files
- For each of these find the pragmas that reference them and the following code units that implement them.
- Check: does the updated behavior match the referenced code?
- Think: was the pragma placed at a fine-grained enough level? It should target the smallest unit of code that implements the behavior.
- Think: looking at the code, does it implement nuanced behavior that isn't captured in the spec, and isn't captured in one the other behaviors listed in a pragma that targets the same code unit?
- Think: is this the best way to implement the behavior? Are there more idiomatic ways or more performant ways?

5. **Evaluate removed behaviors in spec files**

- Look through the diff for removed behaviors in spec files
- For each of these look for a deletion of the behavior's pragma.
- Check: was any nuance of the behavior not deleted and now is not captured in the spec when it should be?

6. **Evaluate UNTESTABLE.md changes**

- Look through the diff for behaviors added to or modified in `UNTESTABLE.md`.
- For each added/modified entry, critically assess whether the behavior is **genuinely untestable** in automated CI, not merely inconvenient or difficult to test.
- Valid reasons: requires root/kernel access, requires a platform unavailable in CI, requires a running editor extension host.
- Invalid reasons: "it's hard to mock", "it would need integration test infrastructure we don't have yet", "the function is internal". These are testable — they just require effort.
- Check: does the justification text explain _why_ automated testing is infeasible, not just _what_ the behavior does?
- Flag any entries that look like the author avoided writing a test rather than genuinely being unable to.
- Cross-check: search for `// woke2 test` pragmas referencing each newly-added UNTESTABLE behavior. If a behavior already has a passing test pragma, it is contradictory to list it as untestable — flag and remove it.

7. **Evaluate meaningful code changes**

- Look through all code diff hunks (not spec file hunks) and identify the behaviors associated with each hunk, either because the behavior is referenced in the hunk or because the hunk is situated within a unit of code that is marked as implementing/testing the behavior.
- Check: did the diff change the behavior in a way that isn't captured in the associated pragmas? If so, why? Maybe the behavior definition isn't being referenced. Maybe there isn't a corresponding behavior definition.
- Check: find references to the associated pragmas from other parts of the file/codebase. Are their tagged code units still accurate or do they need to be updated to reflect the new behavior?
- Think: for added/moved pragmas, was the pragma placed at a fine-grained enough level? It should target the smallest unit of code that implements the behavior.
- Think: is this change dangerous or slow or unidiomatic or otherwise problematic?
- Check for deleted non-obvious comments. If the diff removes a comment that explains _why_ code works a certain way, documents a non-obvious invariant, or records a design decision, flag it. Comments that merely narrate what the code does ("increment counter") are fine to delete, but rationale comments are load-bearing context that should be preserved.

8. **Backlog: completed items.**

- List all files in `backlog/`. For each, determine whether the work it describes has been completed by the changes on this branch.
- A task is "completed" when the branch's diff fully implements what the task describes — not partially, not tangentially.
- For each completed item, tell the user it should be deleted and why you believe it's done.
- Check whether any other backlog items have a `## Depends on` reference to the completed task. If so, flag those dependents — the dependency line should be removed (or the entire `## Depends on` section if it was the only entry), and the dependent task may now be unblocked.
- If a task is partially completed, suggest updating the task file to reflect the new state.

9. **Backlog: follow-up work.**

- Consider the full scope of changes on the branch. Think about loose ends, natural next steps, edge cases punted on, performance work deferred, UX improvements implied but not done.
- Cross-reference against existing backlog items to avoid duplicates.
- Suggest new backlog items (with recommended priority and a one-line description) for anything worth capturing that isn't already tracked.
- For each suggested new item, consider whether it depends on any existing backlog task or whether any existing task depends on it. Suggest `## Depends on` entries where appropriate.

10. **Backlog: stale context.**

- Read every remaining (non-completed) backlog item.
- For each, consider whether the changes on this branch alter its assumptions, constraints, implementation sketch, or priority.
- Flag any items that need updating and describe what changed. Examples: a backlog item assumes an API that was just refactored; a P3 item is now trivial because infrastructure was just added; a task's approach is invalidated by a new design decision.

11. **Backlog: dependencies.**

- Read the `## Depends on` section of every backlog item (if present).
- For each declared dependency, assess whether it still holds. A dependency may be stale if: the depended-on task was completed in a prior branch but the reference wasn't cleaned up; the branch's changes removed the technical reason for the dependency; or the dependency was speculative and the implementation took a different path.
- Look for _missing_ dependencies: are there backlog tasks that clearly cannot start until another backlog task is done, but have no `## Depends on`? Common signals: task A's implementation sketch references infrastructure described in task B; task A's description says "after X lands"; two tasks touch the same subsystem and one's changes would conflict with or be invalidated by the other.
- Suggest additions, removals, or updates to `## Depends on` sections as needed.

12. **TODO/FIXME/HACK sweep.**

- Scan the diff for new `TODO`, `FIXME`, or `HACK` comments (lines added, not removed).
- For each, assess: is this a known deferral that should become a backlog item? Is it a shortcut that should block merge? Or is it benign and well-scoped?
- Suggest creating backlog items for any that represent real deferred work.

13. **Backlog priority sanity.**

- Review the priority of every backlog item in light of the current branch's changes.
- Flag items whose priority seems wrong given what just landed. Examples: a P3 that's now trivial because the branch added supporting infrastructure (bump up); a P0 that's been sitting untouched across many branches (is it actually blocking, or should it be deprioritized?).

14. **Spec file size and splitting.**

- Check spec files touched or created on this branch for size and structure.
- If a spec file is large and has clearly separable sections (distinct feature areas, independent subsystems), suggest splitting it into smaller files with cross-links.
- No hard line-count threshold — use judgment based on whether the file is hard to navigate or mixes unrelated concerns.

15. **Circumspection (general)** — short, actionable observations:

- Tests: is new/changed logic covered where it matters?
- Edge cases, errors, user-visible failure modes?
- API or protocol changes documented or spec'd?
- Anything that looks rushed: large refactors without tests/specs, commented-out code, TODOs that should block merge?

16. **Report format:**

- **Summary** (1–3 sentences, plus stats from woke2:check)
- **Wins** — describe the notable things that are good about the diff.
- **Suggestions** — prioritized list describing the problems found, ordered by severity, and the corresponding potential solutions space. Include clickable links to the relevant code units. Also list other suggestions from the audit, e.g. spec file splitting, new backlog items, etc.

Only include actionable suggestions. If a step found nothing (no completed backlog items, no stale context, no TODOs, no spec splitting needed, etc.), omit it from the report entirely — do not list "nothing found" or "no issues" entries.

Tone: neutral, professional. The name is the in-joke; the audit itself is serious.
