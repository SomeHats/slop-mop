# Untestable behaviors

Behaviors listed here are excluded from the woke2-coverage "missing test" report.
Each entry must justify why the behavior cannot be tested in automated CI.

## woke2 LSP extension (VS Code extension host required)

The woke2 LSP is a VS Code extension exercised through the editor's extension
host. Testing LSP handlers (hover, definition, references, completions,
diagnostics) and editor decorations requires a running VS Code instance with the
extension loaded — not feasible in headless CI. Pure parsing functions
(LSP-IX4, LSP-IX5) are tested separately via `npm test` in `tools/woke2-lsp/`.

- !LSP-IX1 — full workspace index on startup
- !LSP-IX2 — re-index on content change
- !LSP-IX3 — re-index on watched file changes
- !LSP-HV1 — hover shows definition text and reference counts
- !LSP-HV3 — hovering on a spec definition shows only impl/test counts: requires VS Code extension host
- !LSP-HV2 — hover range covers full ID
- !LSP-DEF1 — definition: pragma to spec
- !LSP-DEF2 — definition: spec to references with peek
- !LSP-DEF3 — LocationLink with originSelectionRange
- !LSP-DL1 — document links for pragma IDs
- !LSP-DL2 — document link holistic range
- !LSP-DL3 — spec files excluded from document links
- !LSP-REF1 — find references lists pragma sites
- !LSP-REF2 — includeDeclaration adds spec definition
- !LSP-CMP1 — completion after pragma prefix
- !LSP-CMP2 — completion items show definition detail
- !LSP-DG1 — diagnostic: duplicate IDs in specs
- !LSP-DG2 — diagnostic: orphan pragma IDs
- !LSP-DG3 — diagnostic lifecycle (publish/clear)
- !LSP-DC1 — bold + dotted underline decoration
- !LSP-DC2 — spec definition decoration
- !LSP-DC3 — pragma ID decoration
- !LSP-DC4 — decoration updates on editor events
