# woke2 LSP

Language server and VS Code extension for woke2 behavior specs. See [woke2 checker](../tools/woke2-check.ts) for the CLI counterpart.

## Indexing

- !LSP-IX1 On startup, resolves the active workspace to its git repo root, respects `.gitignore`, and indexes all `*.spec.md` definitions and source file pragmas inside that repo
- !LSP-IX2 Re-indexes open documents on every content change (`didChangeContent`)
- !LSP-IX3 Re-indexes non-open files on disk changes (`didChangeWatchedFiles`); removes deleted files from the index
- !LSP-IX4 Spec file parsing extracts `!ID` from headings and list items, skipping fenced code blocks
- !LSP-IX5 Pragma parsing extracts IDs from `// woke2 impl|test` comments with column positions
- !LSP-IX6 Open or watched files whose URIs resolve outside the active git repo root are ignored for indexing and diagnostics

## Hover

- !LSP-HV1 Hovering on a pragma ID in source files shows the definition text, source file location, and impl/test reference counts
- !LSP-HV2 Hover range covers the full ID (including dashes) so the tooltip anchors to the whole token
- !LSP-HV3 Hovering on a behavior definition in a spec file shows only impl/test counts (no definition text, since the cursor is already on the definition)

## Go to definition

- !LSP-DEF1 From a pragma ID, navigates to the `!ID` definition line in the spec file
- !LSP-DEF2 From a spec definition, navigates to pragma references — jumps directly for one reference, shows peek overlay for multiple
- !LSP-DEF3 Returns `LocationLink` with `originSelectionRange` so Cmd+hover highlights the full ID as one unit

## Document links

- !LSP-DL1 Source file pragma IDs are registered as document links pointing to the spec definition
- !LSP-DL2 Document link ranges cover the full ID for holistic Cmd+hover highlighting
- !LSP-DL3 Spec files are excluded from document links so the definition handler controls Cmd+click behavior

## Find references

- !LSP-REF1 From any behavior ID, lists all `// woke2 impl` and `// woke2 test` pragma sites
- !LSP-REF2 Includes the spec definition itself when `includeDeclaration` is set

## Completions

- !LSP-CMP1 After `// woke2 impl ` or `// woke2 test `, suggests all known behavior IDs
- !LSP-CMP2 Each completion item shows the definition text as detail and source file as documentation

## Diagnostics

- !LSP-DG1 In spec files, reports duplicate behavior ID definitions (cross-file and within-file)
- !LSP-DG2 In source files, reports orphan pragma IDs that reference undefined behaviors
- !LSP-DG3 Diagnostics are published on file open/change and cleared on file close

## Decorations

- !LSP-DC1 Behavior IDs are rendered with bold font weight and dotted underline
- !LSP-DC2 In spec files, decorates the `!ID` token in heading and list item definitions
- !LSP-DC3 In source files, decorates each ID within pragma comments
- !LSP-DC4 Decorations update on editor change, visibility change, and document edit
