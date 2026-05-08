// @ts-check

const path = require("node:path")
const vscode = require("vscode")
const { LanguageClient, TransportKind } = require("vscode-languageclient/node")

/** @type {LanguageClient | undefined} */
let client

const HEADING_DEF_RE = /^(#{2,6}\s+)(![A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)\b/
const LIST_DEF_RE = /^(\s*[-*]\s+)(![A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)\b/
const PRAGMA_RE = /^([ \t]*(?:\/\/|#|\/\*)\s*woke2\s+(?:impl|test)\s+)(.+?)(?:\s*\*\/)?$/
const ID_IN_PRAGMA_RE = /[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g

// woke2 impl LSP-DC1, LSP-DC2, LSP-DC3
/**
 * @param {vscode.TextEditor} editor
 * @param {vscode.TextEditorDecorationType} decoration
 */
function decorateEditor(editor, decoration) {
  const doc = editor.document
  /** @type {vscode.Range[]} */
  const ranges = []
  const isSpec = doc.fileName.endsWith(".spec.md")

  let inFencedBlock = false
  for (let i = 0; i < doc.lineCount; i++) {
    const lineText = doc.lineAt(i).text

    if (isSpec) {
      if (lineText.trimStart().startsWith("```")) {
        inFencedBlock = !inFencedBlock
        continue
      }
      if (inFencedBlock) continue

      const headingMatch = lineText.match(HEADING_DEF_RE)
      if (headingMatch) {
        const start = headingMatch[1].length
        ranges.push(new vscode.Range(i, start, i, start + headingMatch[2].length))
        continue
      }
      const listMatch = lineText.match(LIST_DEF_RE)
      if (listMatch) {
        const start = listMatch[1].length
        ranges.push(new vscode.Range(i, start, i, start + listMatch[2].length))
      }
    } else {
      const pragmaMatch = lineText.match(PRAGMA_RE)
      if (!pragmaMatch) continue
      const idsStr = pragmaMatch[2]
      const idsOffset = lineText.indexOf(idsStr, pragmaMatch[1].length)
      for (const m of idsStr.matchAll(ID_IN_PRAGMA_RE)) {
        const col = idsOffset + /** @type {number} */ (m.index)
        ranges.push(new vscode.Range(i, col, i, col + m[0].length))
      }
    }
  }

  editor.setDecorations(decoration, ranges)
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // woke2 impl LSP-DC1
  const boldDecoration = vscode.window.createTextEditorDecorationType({
    fontWeight: "bold",
    textDecoration: "underline dotted",
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  })
  context.subscriptions.push(boldDecoration)

  function updateDecorations() {
    for (const editor of vscode.window.visibleTextEditors) {
      decorateEditor(editor, boldDecoration)
    }
  }

  // woke2 impl LSP-DC4
  updateDecorations()
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateDecorations),
    vscode.window.onDidChangeVisibleTextEditors(updateDecorations),
    vscode.workspace.onDidChangeTextDocument((e) => {
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document === e.document) {
          decorateEditor(editor, boldDecoration)
        }
      }
    }),
  )

  // --- language server ---
  const serverModule = context.asAbsolutePath(path.join("src", "server.js"))

  /** @type {import("vscode-languageclient/node").ServerOptions} */
  const serverOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  }

  /** @type {import("vscode-languageclient/node").LanguageClientOptions} */
  const clientOptions = {
    documentSelector: [
      { scheme: "file", language: "rust" },
      { scheme: "file", language: "typescript" },
      { scheme: "file", language: "typescriptreact" },
      { scheme: "file", language: "javascript" },
      { scheme: "file", language: "javascriptreact" },
      { scheme: "file", language: "python" },
      { scheme: "file", language: "shellscript" },
      { scheme: "file", language: "markdown" },
    ],
    synchronize: {
      fileEvents: [
        vscode.workspace.createFileSystemWatcher("**/*.spec.md"),
        vscode.workspace.createFileSystemWatcher("**/*.{rs,ts,tsx,js,jsx,py,sh}"),
      ],
    },
  }

  client = new LanguageClient("woke2", "woke2 Language Server", serverOptions, clientOptions)

  client.start()
}

function deactivate() {
  return client?.stop()
}

module.exports = { activate, deactivate }
