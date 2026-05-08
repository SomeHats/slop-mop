// @ts-check

const {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  TextDocumentSyncKind,
  CompletionItemKind,
  DiagnosticSeverity,
  FileChangeType,
  MarkupKind,
  Range,
  LocationLink,
  Location,
} = require("vscode-languageserver/node")
const { TextDocument } = require("vscode-languageserver-textdocument")
const { readFileSync } = require("node:fs")
const { execSync } = require("node:child_process")
const { join, extname } = require("node:path")
const { fileURLToPath, pathToFileURL } = require("node:url")
const { PRAGMA_RE, extractDefinitions, extractPragmas, idAtPosition } = require("./parsing.js")
const { resolveRepoRoot, uriToRelPathWithinRoot } = require("./paths.js")

/** @typedef {import("./parsing.js").BehaviorDef} BehaviorDef */
/** @typedef {import("./parsing.js").PragmaRef} PragmaRef */

// ---------- config ----------

const PRAGMA_EXTENSIONS = new Set([
  ".rs",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".sh",
  ".bash",
  ".zsh",
])

// ---------- gitignore-aware file listing ----------

/**
 * @param {string} root
 * @returns {string[]}
 */
function listWorkspaceFiles(root) {
  try {
    const output = execSync("git ls-files --cached --others --exclude-standard -z", {
      cwd: root,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    })
    return output.split("\0").filter(Boolean)
  } catch {
    connection.console.warn("woke2-lsp: git ls-files failed, falling back to empty index")
    return []
  }
}

// ---------- workspace index ----------

class WorkspaceIndex {
  /** @type {Map<string, BehaviorDef>} */
  defs = new Map()
  /** @type {Map<string, BehaviorDef[]>} */
  defsByFile = new Map()
  /** @type {Map<string, PragmaRef[]>} */
  pragmasByFile = new Map()
  /** @type {Map<string, PragmaRef[]>} */
  pragmasById = new Map()

  /** @param {string} rootPath */
  constructor(rootPath) {
    /** @type {string} */
    this.rootPath = rootPath
  }

  /** @returns {IterableIterator<BehaviorDef>} */
  getAllDefinitions() {
    return this.defs.values()
  }

  /**
   * @param {string} id
   * @returns {BehaviorDef | undefined}
   */
  getDefinition(id) {
    return this.defs.get(id)
  }

  /**
   * @param {string} relFile
   * @returns {BehaviorDef[]}
   */
  getDefinitionsInFile(relFile) {
    return this.defsByFile.get(relFile) ?? []
  }

  /**
   * @param {string} id
   * @returns {PragmaRef[]}
   */
  getPragmasForId(id) {
    return this.pragmasById.get(id) ?? []
  }

  /**
   * @param {string} relFile
   * @returns {PragmaRef[]}
   */
  getPragmasInFile(relFile) {
    return this.pragmasByFile.get(relFile) ?? []
  }

  // woke2 impl LSP-IX1
  fullIndex() {
    this.defs.clear()
    this.defsByFile.clear()
    this.pragmasByFile.clear()
    this.pragmasById.clear()

    const allFiles = listWorkspaceFiles(this.rootPath)

    for (const f of allFiles) {
      if (f.endsWith(".spec.md")) {
        this.indexSpecFile(f)
      } else if (PRAGMA_EXTENSIONS.has(extname(f))) {
        this.indexSourceFile(f)
      }
    }
  }

  // woke2 impl LSP-IX3
  /** @param {string} relFile */
  reindexFile(relFile) {
    if (relFile.endsWith(".spec.md")) {
      this.removeSpecFile(relFile)
      this.indexSpecFile(relFile)
    } else if (PRAGMA_EXTENSIONS.has(extname(relFile))) {
      this.removeSourceFile(relFile)
      this.indexSourceFile(relFile)
    }
  }

  // woke2 impl LSP-IX2
  /**
   * @param {string} relFile
   * @param {string} content
   */
  reindexFileContent(relFile, content) {
    if (relFile.endsWith(".spec.md")) {
      this.removeSpecFile(relFile)
      const fileDefs = extractDefinitions(content, relFile)
      this.defsByFile.set(relFile, fileDefs)
      for (const def of fileDefs) {
        this.defs.set(def.id, def)
      }
    } else if (PRAGMA_EXTENSIONS.has(extname(relFile))) {
      this.removeSourceFile(relFile)
      const pragmas = extractPragmas(content, relFile)
      this.pragmasByFile.set(relFile, pragmas)
      for (const p of pragmas) {
        const arr = this.pragmasById.get(p.id) ?? []
        arr.push(p)
        this.pragmasById.set(p.id, arr)
      }
    }
  }

  /** @param {string} relFile */
  removeFile(relFile) {
    if (relFile.endsWith(".spec.md")) {
      this.removeSpecFile(relFile)
    } else {
      this.removeSourceFile(relFile)
    }
  }

  /** @param {string} relFile */
  indexSpecFile(relFile) {
    /** @type {string} */
    let content
    try {
      content = readFileSync(join(this.rootPath, relFile), "utf-8")
    } catch {
      return
    }
    const fileDefs = extractDefinitions(content, relFile)
    this.defsByFile.set(relFile, fileDefs)
    for (const def of fileDefs) {
      this.defs.set(def.id, def)
    }
  }

  /** @param {string} relFile */
  indexSourceFile(relFile) {
    /** @type {string} */
    let content
    try {
      content = readFileSync(join(this.rootPath, relFile), "utf-8")
    } catch {
      return
    }
    const pragmas = extractPragmas(content, relFile)
    this.pragmasByFile.set(relFile, pragmas)
    for (const p of pragmas) {
      const arr = this.pragmasById.get(p.id) ?? []
      arr.push(p)
      this.pragmasById.set(p.id, arr)
    }
  }

  /** @param {string} relFile */
  removeSpecFile(relFile) {
    const old = this.defsByFile.get(relFile) ?? []
    for (const def of old) {
      if (this.defs.get(def.id)?.file === relFile) {
        this.defs.delete(def.id)
      }
    }
    this.defsByFile.delete(relFile)
  }

  /** @param {string} relFile */
  removeSourceFile(relFile) {
    const old = this.pragmasByFile.get(relFile) ?? []
    for (const p of old) {
      const arr = this.pragmasById.get(p.id)
      if (arr) {
        const filtered = arr.filter((r) => r.file !== relFile)
        if (filtered.length === 0) {
          this.pragmasById.delete(p.id)
        } else {
          this.pragmasById.set(p.id, filtered)
        }
      }
    }
    this.pragmasByFile.delete(relFile)
  }
}

// ---------- LSP server ----------

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)

/** @type {WorkspaceIndex} */
let index
/** @type {string} */
let rootPath

/** @param {string} uri */
function uriToRelPath(uri) {
  return uriToRelPathWithinRoot(rootPath, uri)
}

/** @param {string} relFile */
function relPathToUri(relFile) {
  return pathToFileURL(join(rootPath, relFile)).toString()
}

connection.onInitialize((params) => {
  const folders = params.workspaceFolders
  const workspacePath = folders?.[0]
    ? fileURLToPath(folders[0].uri)
    : params.rootUri
      ? fileURLToPath(params.rootUri)
      : process.cwd()
  rootPath = resolveRepoRoot(workspacePath)

  index = new WorkspaceIndex(rootPath)
  index.fullIndex()

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      completionProvider: {
        triggerCharacters: [" ", ","],
      },
      documentLinkProvider: {
        resolveProvider: false,
      },
    },
  }
})

// ---------- hover ----------

// woke2 impl LSP-HV1, LSP-HV2, LSP-HV3
connection.onHover((params) => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return null

  const relFile = uriToRelPath(doc.uri)
  if (!relFile) return null

  const lineText = doc
    .getText(Range.create(params.position.line, 0, params.position.line + 1, 0))
    .replace(/\n$/, "")

  const hit = idAtPosition(lineText, params.position.character)
  if (!hit) return null

  const def = index.getDefinition(hit.id)
  if (!def) return null

  const pragmas = index.getPragmasForId(hit.id)
  const implCount = pragmas.filter((p) => p.kind === "impl").length
  const testCount = pragmas.filter((p) => p.kind === "test").length

  const isSpecDef =
    relFile.endsWith(".spec.md") && def.file === relFile && def.line === params.position.line
  /** @type {string} */
  let value
  // woke2 impl LSP-HV3
  if (isSpecDef) {
    value = `${implCount} impl, ${testCount} test`
  } else {
    value = [
      def.text
        .replace(/^#+\s*/, "")
        .replace(/^[-*]\s*/, "")
        .replace(/^![A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\s*/, ""),
      "",
      `${hit.id} *${def.file}:${def.line + 1}* — ${implCount} impl, ${testCount} test`,
    ].join("\n")
  }

  return {
    contents: { kind: MarkupKind.Markdown, value },
    range: Range.create(params.position.line, hit.col, params.position.line, hit.endCol),
  }
})

// ---------- go to definition ----------

// woke2 impl LSP-DEF1, LSP-DEF2, LSP-DEF3
connection.onDefinition((params) => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return null

  const relFile = uriToRelPath(params.textDocument.uri)
  if (!relFile) return null

  const lineText = doc
    .getText(Range.create(params.position.line, 0, params.position.line + 1, 0))
    .replace(/\n$/, "")

  const hit = idAtPosition(lineText, params.position.character)
  if (!hit) return null

  const origin = Range.create(params.position.line, hit.col, params.position.line, hit.endCol)

  const def = index.getDefinition(hit.id)
  // woke2 impl LSP-DEF2
  if (def && def.file === relFile && def.line === params.position.line) {
    const pragmas = index.getPragmasForId(hit.id)
    if (pragmas.length === 0) return null
    return pragmas.map((p) =>
      LocationLink.create(
        relPathToUri(p.file),
        Range.create(p.line, 0, p.line + 1, 0),
        Range.create(p.line, p.col, p.line, p.endCol),
        origin,
      ),
    )
  }

  if (!def) return null

  return [
    LocationLink.create(
      relPathToUri(def.file),
      Range.create(def.line, 0, def.line, def.text.length),
      Range.create(def.line, 0, def.line, def.text.length),
      origin,
    ),
  ]
})

// ---------- document links ----------

// woke2 impl LSP-DL1, LSP-DL2, LSP-DL3
connection.onDocumentLinks((params) => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return []

  const relFile = uriToRelPath(doc.uri)
  if (!relFile) return []
  if (relFile.endsWith(".spec.md")) return []

  /** @type {import("vscode-languageserver/node").DocumentLink[]} */
  const links = []

  for (let i = 0; i < doc.lineCount; i++) {
    const lineText = doc.getText(Range.create(i, 0, i + 1, 0)).replace(/\n$/, "")

    const pragmaMatch = lineText.match(PRAGMA_RE)
    if (!pragmaMatch) continue

    const idsStr = pragmaMatch[2]
    const idsOffset = lineText.indexOf(idsStr, pragmaMatch[1].length)

    for (const m of idsStr.matchAll(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g)) {
      const id = m[0]
      const def = index.getDefinition(id)
      if (!def) continue

      const col = idsOffset + /** @type {number} */ (m.index)
      links.push({
        range: Range.create(i, col, i, col + id.length),
        target: `${relPathToUri(def.file)}#L${def.line + 1}`,
      })
    }
  }

  return links
})

// ---------- find references ----------

// woke2 impl LSP-REF1, LSP-REF2
connection.onReferences((params) => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return null
  if (!uriToRelPath(doc.uri)) return null

  const lineText = doc
    .getText(Range.create(params.position.line, 0, params.position.line + 1, 0))
    .replace(/\n$/, "")

  const hit = idAtPosition(lineText, params.position.character)
  if (!hit) return null

  const pragmas = index.getPragmasForId(hit.id)
  const results = pragmas.map((p) =>
    Location.create(relPathToUri(p.file), Range.create(p.line, p.col, p.line, p.endCol)),
  )

  // woke2 impl LSP-REF2
  if (params.context.includeDeclaration) {
    const def = index.getDefinition(hit.id)
    if (def) {
      results.unshift(
        Location.create(
          relPathToUri(def.file),
          Range.create(def.line, 0, def.line, def.text.length),
        ),
      )
    }
  }

  return results
})

// ---------- completions ----------

// woke2 impl LSP-CMP1, LSP-CMP2
connection.onCompletion((params) => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return []
  if (!uriToRelPath(doc.uri)) return []

  const lineText = doc
    .getText(Range.create(params.position.line, 0, params.position.line + 1, 0))
    .replace(/\n$/, "")

  const prefixMatch = lineText.match(/^[ \t]*(?:\/\/|#|\/\*)\s*woke2\s+(?:impl|test)\s+/)
  if (!prefixMatch) return []

  /** @type {import("vscode-languageserver/node").CompletionItem[]} */
  const items = []
  for (const def of index.getAllDefinitions()) {
    items.push({
      label: def.id,
      kind: CompletionItemKind.Reference,
      detail: def.text.replace(/^#+\s*!/, "!").replace(/^[-*]\s*!/, "!"),
      documentation: {
        kind: MarkupKind.Markdown,
        value: `*${def.file}:${def.line + 1}*`,
      },
    })
  }
  return items
})

// ---------- diagnostics ----------

// woke2 impl LSP-DG1, LSP-DG2, LSP-DG3
/**
 * @param {string} uri
 * @param {string} content
 */
function publishDiagnostics(uri, content) {
  const relFile = uriToRelPath(uri)
  if (!relFile) {
    connection.sendDiagnostics({ uri, diagnostics: [] })
    return
  }
  /** @type {import("vscode-languageserver/node").Diagnostic[]} */
  const diagnostics = []

  if (relFile.endsWith(".spec.md")) {
    const fileDefs = extractDefinitions(content, relFile)

    /** @type {Map<string, number>} */
    const seen = new Map()
    for (const def of fileDefs) {
      const prev = seen.get(def.id)
      if (prev !== undefined) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: Range.create(def.line, 0, def.line, def.text.length),
          message: `Duplicate behavior ID "${def.id}" — also defined on line ${
            prev + 1
          } in this file`,
          source: "woke2",
        })
      }
      seen.set(def.id, def.line)

      for (const [otherFile, otherDefs] of index.defsByFile) {
        if (otherFile === relFile) continue
        const dup = otherDefs.find((d) => d.id === def.id)
        if (dup) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: Range.create(def.line, 0, def.line, def.text.length),
            message: `Duplicate behavior ID "${def.id}" — also defined in ${otherFile}:${dup.line + 1}`,
            source: "woke2",
          })
          break
        }
      }
    }
  } else {
    const pragmas = extractPragmas(content, relFile)
    for (const p of pragmas) {
      const def = index.getDefinition(p.id)
      if (!def) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: Range.create(p.line, p.col, p.line, p.endCol),
          message: `Undefined behavior ID "${p.id}" — not defined in any *.spec.md file`,
          source: "woke2",
        })
      }
    }
  }

  connection.sendDiagnostics({ uri, diagnostics })
}

// ---------- document lifecycle ----------

// woke2 impl LSP-IX2, LSP-DG3
documents.onDidChangeContent((change) => {
  const relFile = uriToRelPath(change.document.uri)
  if (!relFile) {
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics: [] })
    return
  }
  index.reindexFileContent(relFile, change.document.getText())
  publishDiagnostics(change.document.uri, change.document.getText())
})

// woke2 impl LSP-DG3
documents.onDidClose((event) => {
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] })
})

// woke2 impl LSP-IX3
connection.onDidChangeWatchedFiles((params) => {
  for (const change of params.changes) {
    const relFile = uriToRelPath(change.uri)
    if (!relFile) continue
    if (change.type === FileChangeType.Deleted) {
      index.removeFile(relFile)
    } else {
      if (!documents.get(change.uri)) {
        index.reindexFile(relFile)
      }
    }
  }

  for (const doc of documents.all()) {
    publishDiagnostics(doc.uri, doc.getText())
  }
})

documents.listen(connection)
connection.listen()
