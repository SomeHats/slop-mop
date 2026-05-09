# /woke2-build

Take a vague feature idea and turn it into specs + working code, with the user fully in the loop on every design decision. Interview-driven. Spec-first. Implementation-second. Review-last.

The shape: **Survey → Interview → Spec → Implement → Reconcile.** Each phase has a hard gate before moving on.

## Phase 0 — Receive prompt

The user invokes `/woke2-build <prompt>` where `<prompt>` is a free-form description of a feature or change. It may be vague ("add auth"), partial ("make the comment panel collapsible"), or detailed ("add a SQLite-backed cache for projection results, invalidated on commit"). Treat it as a starting point, not a finished design.

If no prompt is supplied, ask the user what they want to build before doing anything else.

## Phase 1 — Survey existing specs

Before asking the user anything, ground yourself:

1. **Find specs in scope.** Grep `*.spec.md` files for keywords from the prompt. Read every plausibly-related spec end-to-end — not just snippets.
2. **Find related code.** Use the woke2 pragmas (`// woke2 impl`, `// woke2 test`) to walk from the relevant behaviors into the code that implements them.
3. **Find related backlog items.** Read `backlog/` for tasks that overlap the request. They may already capture half the design, or be invalidated by it.
4. **Identify the seam.** Is this a new spec file, a new section in an existing spec, or modifications to existing behaviors? Is it an _additive_ change, a _modification_, or a _replacement_? Form a working hypothesis.

Output a short orientation message to the user (3–6 lines): which specs/code/backlog items are in scope, and your initial read on what the change is. This grounds the interview.

## Phase 2 — Interview

This is the heart of `/woke2-build`. The goal: walk the design tree from root to leaves, resolving each decision before moving to the ones that depend on it.

### Rules of engagement

- **One question at a time.** Use the `AskUserQuestion` tool. Do not batch multiple questions into one prompt. The user's answer to question N often reframes question N+1.
- **Always provide a recommended answer.** For every question, list it as the first option, marked `(Recommended)`, with a one-line rationale. Other options should be plausible alternatives, not strawmen. If the recommendation is non-obvious, briefly explain the trade-off in the question text.
- **Resolve dependencies in order.** Ask root decisions before leaf decisions. If question B's answer space depends on question A's answer, ask A first.
- **Walk every branch.** When an answer opens new sub-questions, explore them before returning to siblings. Depth-first.
- **Surface hidden assumptions.** If the prompt implies a choice the user may not have thought about (data model, concurrency, error semantics, UI placement, persistence, migration), ask. Do not silently assume.
- **Keep going until exhausted.** Do not stop after 2–3 questions because it "seems clear." A real interview is often 8–20 questions for a non-trivial change. Stop only when you genuinely cannot identify another decision worth resolving.
- **Track the tree.** Keep a running scratchpad (in your own working notes, not user-facing) of decisions made and branches still to explore. After each answer, update it.

### What to ask about

Cover these axes to the depth the change warrants. Not every change needs every axis — judgment.

- **Scope** — what is in/out? What's the smallest version that delivers the value?
- **Behavior** — what does it _do_, observably, from the user's or caller's perspective? Edge cases, error modes, empty states.
- **Data model** — new types, new fields, schema migrations, persistence shape.
- **Interfaces** — Tauri command signatures, React component props, event shapes, file formats.
- **Lifecycle** — when is it created, updated, destroyed? What triggers each?
- **Concurrency** — what happens under interleaved or repeated invocation? Does ordering matter?
- **Failure modes** — what can go wrong? How is it surfaced, recovered, reported?
- **Testing** — what's the smallest test that proves it works? What's untestable?
- **Compatibility** — does this break existing behavior, specs, or code? Is migration needed?
- **Naming** — names for new behaviors (woke2 IDs), files, types, commands. The first name proposed often sticks; pick deliberately.

### When the user pushes back or course-corrects

- Treat any "no", "actually", or "instead" as a re-rooting of the tree. Re-evaluate which branches are still live.
- If the user gives an answer that contradicts an earlier one, surface the conflict explicitly and ask which one stands.
- If the user says "you decide" or "your call", make the call, **state it clearly**, and continue. Don't keep re-asking.

### Closing the interview

When the design tree is exhausted, output a structured **Design summary** to the user before writing any spec changes:

- What you understood the change to be (1–2 sentences).
- A bulleted list of every decision made in the interview, in tree order.
- The list of behaviors you intend to add/modify/remove, with proposed IDs and one-line descriptions each.
- The list of files you intend to touch (specs and code).

Ask the user to confirm before proceeding. If they push back, return to the interview. Do not proceed to Phase 3 without explicit confirmation.

## Phase 3 — Write specs

Once the user confirms the design summary:

1. **Write or update `*.spec.md` files** following the conventions in [SKILL.md](SKILL.md):
   - New behaviors as `- !ID …` list items, never on headings.
   - Fully-qualified IDs everywhere.
   - Each ID defined exactly once across all specs.
   - Group related behaviors under plain headings.
   - Aim for spec files under ~200 lines; split with cross-links if larger.
2. **Choose IDs carefully.** Use existing prefixes for additions to existing features. Mint new prefixes (3–4 uppercase letters) for genuinely new feature areas.
3. **Build a TodoWrite list.** For every behavior added or modified, create one todo entry: "Implement !ID — \<short description\>". For removed behaviors, add a todo: "Remove implementation of !ID and clean up pragmas". Do not skip this step — the todos are how Phase 4 stays organized.
4. **Run `npm run woke2:check`.** It will fail because the new behaviors lack `// woke2 impl` pragmas — that's expected and proves the specs are wired up. Do not try to silence the failure; it's the next phase's job.

## Phase 4 — Implement

Work the todo list top to bottom. For each todo:

1. **Edit code** to implement the behavior.
2. **Add the pragma** (`// woke2 impl <ID>`) at the finest-grained location that genuinely implements that behavior. Use judgment — variable usage sites usually beat definition sites.
3. **Add a test and `// woke2 test <ID>` pragma** if the behavior is testable. If genuinely untestable in CI, add to `UNTESTABLE.md` with a real justification (see [SKILL.md](SKILL.md) for what counts as genuinely untestable — "hard to test" does not).
4. **Mark the todo complete** as soon as the behavior is implemented and tested. Do not batch completions.

After every few todos, run `npm run woke2:check` to catch drift early. After the last todo, run it once more — it must pass before moving to Phase 5.

If during implementation you discover the spec is wrong or incomplete, **stop and update the spec first**, then resume. Do not let the code and spec drift apart silently. Add a new todo for any new behavior surfaced this way.

## Phase 5 — Reconcile

A final pass to catch what slipped through:

1. **Re-read every spec file you touched.** For each behavior in those files, find the `// woke2 impl` pragma(s) and read the code they annotate. Ask:
   - Does the code actually implement what the spec describes?
   - Is the pragma at a fine-grained enough location?
   - Does the code implement nuance the spec doesn't capture? If so, that nuance is either (a) already covered by another behavior whose pragma also targets this code, or (b) a missing behavior that should be added to the spec.
2. **Re-read every code change.** For each meaningful hunk, identify the behaviors it's associated with (via pragmas in or around the hunk). Ask:
   - Is there behavior here that isn't traced by any pragma? If so, either add a pragma to an existing behavior or add a new behavior to the spec.
3. **Surface the gaps.** If you found new behaviors during reconciliation, add them to the appropriate spec, add the pragmas, and (if applicable) the tests. Then re-run `npm run woke2:check`.
4. **Final report to the user.** Output a short summary:
   - The behaviors added/modified/removed.
   - Any specs that grew during reconciliation (i.e. design details surfaced only while coding).
   - The state of `woke2:check` (must be green).
   - Anything punted to backlog (with a one-line description of each new backlog item written).

## Anti-patterns

- **Don't skip the survey.** Asking the user about a behavior that already exists in a spec wastes their time and signals you didn't read.
- **Don't ask compound questions.** "Should we add a cache, and if so, should it be in-memory or on-disk?" is two questions. Ask the first; ask the second only if the answer to the first is yes.
- **Don't list four equally-weighted options when you actually have an opinion.** State your recommendation. The user can always pick a different option.
- **Don't silently expand scope.** If during implementation you find yourself touching code unrelated to any behavior on the todo list, stop and either (a) add a behavior + todo, or (b) revert the unrelated change.
- **Don't declare done without `npm run woke2:check` passing.** A green checker is a hard gate.
- **Don't write planning documents.** All design state lives in the spec files (durable) and the todo list (ephemeral). No `PLAN.md`, no `DESIGN.md`, no scratch files committed.
