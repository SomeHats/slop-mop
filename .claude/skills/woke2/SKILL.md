---
name: woke2
description: "woke2: behavior spec system for defining, tracking, and verifying features via *.spec.md files and code pragmas. Use when implementing, modifying, or reviewing features — ensures specs exist before code. Also manages the project backlog, provides /wake for interview-driven feature design from a starting prompt, and /audit for branch-level circumspection review."
---

# woke2 — Behavior Specs, Backlog & Traceability

Define behaviors in `*.spec.md` files. Trace them to code with `woke2` pragmas. Verify integrity with `npm run woke2:check`. Manage upcoming work in the `backlog/` directory.

## Agent workflow

Before touching code for any feature change, **always do this first**:

1. **New feature** — write behaviors in a `*.spec.md` file before implementation.
2. **Modify feature** — update the relevant spec first. If no behaviors exist for the feature being changed, create them.
3. **Add pragmas** — annotate implementation and test code with `// woke2 impl <ID>` or `// woke2 test <ID>` as you go. Be as fine-grained as is tolerable.
4. **Run the checker** — execute `npm run woke2:check` before claiming work is done. Fix any failures.

## Spec file format (`*.spec.md`)

Spec files are small Markdown documents (aim for under ~200 lines). They can link to each other with normal Markdown links (`[see drag](drag.spec.md)`).

### Defining behaviors

Behaviors are defined as **list items** — a `- ` line starting with `!<ID>`:

```markdown
- !SKL-2 When it goes red it should flash
- !SKL-3 When it goes green it should fade in over 200ms
```

Group related behaviors under plain headings:

```markdown
## Drag and drop behavior

Describes the drag and drop system.

- !DRG-1 Dragging starts on mousedown + 5px movement
- !DRG-1-1 Dragging shows a ghost element at 50% opacity
- !DRG-1-2 Dragging applies `cursor: grabbing` to the body
- !DRG-2 Dropping onto a valid target triggers the onDrop callback
```

### Behavior ID format

IDs are one or more segments of uppercase letters/digits separated by single dashes: `DRG`, `SKL-2`, `DRG-1-3`.

Nesting is semantic via ID prefixes — `DRG-1` is conceptually nested under `DRG`, `DRG-1-3` under `DRG-1`. The markdown structure itself is free-form.

**IDs must always be fully qualified** everywhere they appear (specs, code pragmas, searches). This makes repo-wide find-in-files reliable.

### Headings are for grouping only

Spec headings (`##`–`######`) must **never** carry a `!ID`. They serve as meta descriptors that organize sets of behaviors — they are not behaviors themselves. Only list items define behaviors.

```markdown
## Delta model

- !LS-D1 `PackageDelta` holds `puts`, `deletes`, `dirs_created`
- !LS-D2 `DeltaPut` stores `disk_path`, `size`, `mode`
```

The checker enforces this: `npm run woke2:check` will fail if a heading contains a `!ID`.

### Rules

- Each ID may be defined **exactly once** across all spec files. The checker enforces this.
- Fenced code blocks (triple backticks) are ignored when extracting definitions, so examples don't create phantom behaviors.
- Keep spec files focused and small. Split into multiple files and link between them.

## Code pragmas

Annotate source code to trace which behaviors a given code unit implements or tests.

### Syntax

```
<comment-prefix> woke2 <kind> <id-list>
```

Where:

- `<comment-prefix>` is `//` or `#` (covers Rust, JS/TS, C, Python, shell).
- `<kind>` is `impl` or `test`.
- `<id-list>` is one or more fully-qualified behavior IDs separated by commas and/or spaces.

### Rules

1. **One pragma per comment line.** No stacking multiple pragmas on one line.
2. **IDs cannot span multiple lines.** The entire pragma must fit on a single line.
3. The pragma annotates the **next non-comment AST node** — the next function, struct, impl block, test, class, etc. Use judgment per language.
4. **Multiple references are fine** when accurate: `// woke2 impl DRG-1, DRG-2`.
5. A single behavior can be referenced from any number of places (impl and test sites).
6. Every ID referenced in a pragma **must** exist in a spec file. The checker enforces this.
7. **Be fine-grained in pragma placement**. Move and place pragmas inside of functions, annotating the exact line of code that implements or tests the behavior whenever possible. Position them like would position ordinary comments. **This is critical.** Variable usage sites take precedence over variable definition sites when it comes to pragma placement.

### Examples

```rust
// woke2 impl DRG-1
fn start_drag(event: &MouseEvent) -> DragState {
    // ...
    // woke2 impl DRG-1-1
    if event.buttons !== 1 {
        return DragState::None;
    }
}

// woke2 test DRG-1, DRG-1-1
#[test]
fn test_drag_starts_on_threshold() {
    // ...

    // woke2 test DRG-1-2
    assert_eq(drag_state, DragState::None);
}
```

```typescript
// woke2 impl BDA-1
const MIN_DRAG_DISTANCE = 5
```

```typescript
// woke2 test BDA-2, BDA-4
describe("boundary analysis", () => {
  // ...
})
```

## Validation (`npm run woke2:check`)

The checker (`tools/woke2-check.js`) performs these checks:

**Hard failures (exit 1):**

1. **No duplicate behavior IDs** — every `!ID` across all `*.spec.md` files must be unique. Reports file:line for each collision.
2. **No orphan pragma references** — every ID in a `// woke2 impl|test` pragma must match a defined behavior. Reports file:line for each missing ID.
3. **No heading-level behavior IDs** — headings in spec files must not carry `!ID`. Behaviors belong on list items only; headings are grouping labels. Reports file:line for each violation.
4. **No broken cross-spec links** — Markdown links to `*.spec.md` files (e.g. `[see drag](drag.spec.md)`) must resolve to an existing file. Reports file:line and target for each broken link.
5. **No backlog dependency cycles** — dependencies declared in `## Depends on` sections must form a DAG. Reports the cycle path if one is found.
6. **No broken backlog dependencies** — every filename referenced in a `## Depends on` section must exist in `backlog/`. Reports file and target for each broken reference.
7. **No unimplemented behaviors** — every behavior defined in a spec must have at least one `// woke2 impl <ID>` pragma in the codebase. If a behavior is aspirational or not yet built, it does not belong in the spec — track the work in `backlog/` instead and add the behavior to the spec when implementing it.

**Informational (does not fail):**

- **woke2-coverage** — lists every behavior that lacks an explicit `// woke2 test <ID>` pragma. Marking a parent behavior as tested does **not** cover its children; each must be marked individually. Central to identifying missing tests.

The checker respects `.gitignore` — gitignored paths are not scanned.

Run it manually or let the pre-commit hook catch issues:

```bash
npm run woke2:check
```

### Using woke2-coverage to identify missing tests

After running the checker, review the "Behaviors without test pragmas" list. For each untested behavior:

1. Determine if a test already exists but is missing a `// woke2 test <ID>` annotation — add the pragma.
2. If no test exists, write one and annotate it.
3. If a behavior is genuinely untestable in automated CI, add it to `UNTESTABLE.md` (see below).

### UNTESTABLE.md

`UNTESTABLE.md` at the repo root lists behavior IDs that are excluded from the coverage report. The checker parses `- !ID` list items from this file (same syntax as spec files) and omits them from the "Behaviors without test pragmas" output.

**When to add a behavior to UNTESTABLE.md:**

- **Privileged OS operations** — behaviors that require root access, kernel mounts, or `/etc/sudoers.d` writes.
- **Platform-specific code paths** — `#[cfg]`-gated behaviors that only run on a platform unavailable in CI (e.g., Linux FUSE adapter when CI is macOS-only).
- **End-to-end through live mounts** — behaviors explicitly defined as observable through a live NFS/FUSE mount.

**When NOT to add:**

- Behaviors that are merely _hard_ to test but possible with integration test infrastructure.
- Behaviors you haven't tried to test yet.

Each entry in `UNTESTABLE.md` must include a justification explaining why automated testing is infeasible. Group related behaviors under a shared rationale.

## Backlog

Project backlog lives in the `backlog/` directory. One file per task.

### File naming convention

Task files are named: `P<priority>_<Short_description>.md`

- **P0** — critical / blocking
- **P1** — high priority
- **P2** — medium priority
- **P3** — low priority
- **P4** — someday / nice to have

Examples: `P0_Runtime_writable_packages.md`, `P2_Multi_lockfile_support.md`

Use underscores for spaces. Keep names short but descriptive.

### Task file contents

Free-form markdown. Include enough context to pick up the work cold: what the feature is, why it matters, known constraints, and any implementation sketches. No required template — just be useful.

### Dependencies between tasks

A task file can declare dependencies on other backlog tasks using a `## Depends on` section containing list items that reference other task filenames (without the `backlog/` prefix):

```markdown
## Depends on

- P1_Private_registry_auth.md — need auth tokens before we can fetch from private registries
- P2_Performance.md
```

Each list item is `- <filename>` optionally followed by ` — <reason>`. The filename must match an existing file in `backlog/`. The reason is free-form and optional but encouraged — it explains _why_ the dependency exists, which helps when reassessing whether it still holds.

Dependencies form a DAG. The checker (`npm run woke2:check`) will fail if it detects a cycle. It will also fail if a dependency references a backlog file that doesn't exist (stale reference to a completed/deleted task — remove the dependency line or update it).

When completing a task that other tasks depend on, check whether the dependents are now unblocked or whether their dependency descriptions need updating.

### Completing a task

When a backlog task is finished, **delete** the task file from `backlog/`.

### Adding a new task

Create a file in `backlog/` following the naming convention. Choose the priority thoughtfully — P0 means "next up", not "important in the abstract."

## /wake

Take a starting prompt for a new feature or change and drive it from idea to working, spec-traced code. Surveys existing specs, interviews the user one decision at a time (always with a recommended answer), writes/updates specs, builds a todo list of behaviors to implement, works through them, and reconciles spec ↔ code at the end. Full procedure in [wake](wake.md).

## /audit

Perform the workflow exactly as described in [audit](audit.md).

## /hyperaudit

Perform the exhaustive audit as described in [hyperaudit](hyperaudit.md). Writes a full itemized report to `hyperaudit-report.md`.
