// @ts-check

const { execSync } = require("node:child_process")
const { readFileSync, existsSync } = require("node:fs")
const { join } = require("node:path")
const {
  extractDefinitions: extractDefsZeroBased,
  extractPragmas: extractPragmasZeroBased,
} = require("./woke2-lsp/src/parsing.js")

// ---------- types ----------

/**
 * @typedef {{ file: string, line: number }} Location
 * @typedef {Location & { id: string, isHeading: boolean }} BehaviorDef
 * @typedef {Location & { kind: string, ids: string[] }} PragmaRef
 */

// ---------- config ----------

const PRAGMA_EXTENSIONS = new Set([
  "rs",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "sh",
  "bash",
  "zsh",
])

const BEHAVIOR_ID_RE = /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/

// ---------- file listing ----------

/** @param {string} root */
function listFiles(root) {
  try {
    const output = execSync("git ls-files --cached --others --exclude-standard -z", {
      cwd: root,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    })
    return output.split("\0").filter(Boolean)
  } catch {
    console.error("woke2-check: git ls-files failed")
    process.exit(1)
  }
}

// ---------- parsing (delegates to shared woke2-lsp/src/parsing.js) ----------

/**
 * @param {string} content
 * @param {string} file
 * @returns {BehaviorDef[]}
 */
function extractDefinitions(content, file) {
  return extractDefsZeroBased(content, file).map((d) => ({
    id: d.id,
    file: d.file,
    line: d.line + 1,
    isHeading: d.isHeading,
  }))
}

/**
 * @param {string} content
 * @param {string} file
 * @returns {PragmaRef[]}
 */
function extractPragmas(content, file) {
  /** @type {Map<number, { kind: string, ids: string[] }>} */
  const byLine = new Map()
  for (const p of extractPragmasZeroBased(content, file)) {
    const line1 = p.line + 1
    const existing = byLine.get(line1)
    if (existing) {
      existing.ids.push(p.id)
    } else {
      byLine.set(line1, { kind: p.kind, ids: [p.id] })
    }
  }
  return [...byLine.entries()].map(([line, { kind, ids }]) => ({
    kind,
    ids,
    file,
    line,
  }))
}

// ---------- UNTESTABLE.md parsing ----------

const UNTESTABLE_ID_RE = /^\s*[-*]\s+!([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)\b/

/** @param {string} root */
function loadUntestableIds(root) {
  /** @type {Set<string>} */
  const ids = new Set()
  const untestable = join(root, "UNTESTABLE.md")
  if (!existsSync(untestable)) return ids

  const lines = readFileSync(untestable, "utf-8").split("\n")
  let inFencedBlock = false

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inFencedBlock = !inFencedBlock
      continue
    }
    if (inFencedBlock) continue

    const m = line.match(UNTESTABLE_ID_RE)
    if (m) ids.add(m[1])
  }
  return ids
}

// ---------- backlog dependency checking ----------

const BACKLOG_DEP_RE = /^\s*[-*]\s+(\S+\.md)\b/

/**
 * Parse "## Depends on" sections from backlog task files.
 * @param {string} root
 * @param {string[]} backlogFiles - paths relative to root (e.g. "backlog/P1_Foo.md")
 * @returns {{ deps: Map<string, string[]>, broken: { file: string, target: string }[] }}
 */
function parseBacklogDeps(root, backlogFiles) {
  /** @type {Map<string, string[]>} */
  const deps = new Map()
  /** @type {{ file: string, target: string }[]} */
  const broken = []
  const backlogNames = new Set(backlogFiles.map((f) => f.split("/").pop()))

  for (const f of backlogFiles) {
    const content = readFileSync(join(root, f), "utf-8")
    const lines = content.split("\n")
    const name = f.split("/").pop() ?? f
    const fileDeps = []
    let inDependsSection = false
    let inFencedBlock = false

    for (const line of lines) {
      if (line.trimStart().startsWith("```")) {
        inFencedBlock = !inFencedBlock
        continue
      }
      if (inFencedBlock) continue

      if (/^##\s+Depends\s+on\b/i.test(line)) {
        inDependsSection = true
        continue
      }
      if (/^##\s/.test(line) && inDependsSection) {
        inDependsSection = false
        continue
      }

      if (inDependsSection) {
        const m = line.match(BACKLOG_DEP_RE)
        if (m) {
          const target = m[1]
          if (backlogNames.has(target)) {
            fileDeps.push(target)
          } else {
            broken.push({ file: f, target })
          }
        }
      }
    }
    deps.set(name, fileDeps)
  }
  return { deps, broken }
}

/**
 * Detect cycles in a dependency graph using DFS.
 * @param {Map<string, string[]>} deps
 * @returns {string[] | null} cycle path if found, null otherwise
 */
function detectCycle(deps) {
  /** @type {Set<string>} */
  const visited = new Set()
  /** @type {Set<string>} */
  const inStack = new Set()
  /** @type {Map<string, string>} */
  const parent = new Map()

  /**
   * @param {string} node
   * @returns {string[] | null}
   */
  function dfs(node) {
    visited.add(node)
    inStack.add(node)
    for (const dep of deps.get(node) ?? []) {
      if (!visited.has(dep)) {
        parent.set(dep, node)
        const cycle = dfs(dep)
        if (cycle) return cycle
      } else if (inStack.has(dep)) {
        const path = [dep]
        let cur = node
        while (cur !== dep) {
          path.push(cur)
          cur = parent.get(cur) ?? dep
        }
        path.push(dep)
        path.reverse()
        return path
      }
    }
    inStack.delete(node)
    return null
  }

  for (const node of deps.keys()) {
    if (!visited.has(node)) {
      const cycle = dfs(node)
      if (cycle) return cycle
    }
  }
  return null
}

// ---------- cross-spec link checking ----------

const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(([^)]+\.spec\.md)(?:#[^)]*)?\)/g

/**
 * @param {string} root
 * @param {{ file: string, content: string }[]} specEntries
 * @returns {{ file: string, line: number, target: string }[]}
 */
function checkSpecLinks(root, specEntries) {
  /** @type {{ file: string, line: number, target: string }[]} */
  const broken = []
  for (const { file: f, content } of specEntries) {
    const lines = content.split("\n")
    const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "."
    let inFencedBlock = false
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trimStart().startsWith("```")) {
        inFencedBlock = !inFencedBlock
        continue
      }
      if (inFencedBlock) continue
      let m
      MARKDOWN_LINK_RE.lastIndex = 0
      while ((m = MARKDOWN_LINK_RE.exec(lines[i])) !== null) {
        const target = m[2]
        const resolved = dir === "." ? target : join(dir, target)
        if (!existsSync(join(root, resolved))) {
          broken.push({ file: f, line: i + 1, target })
        }
      }
    }
  }
  return broken
}

// ---------- main ----------

function main() {
  const root = process.cwd()
  const allFiles = listFiles(root).filter((f) => existsSync(join(root, f)))

  const specFiles = allFiles.filter((f) => f.endsWith(".spec.md"))
  const sourceFiles = allFiles.filter((f) => {
    const ext = f.split(".").pop() ?? ""
    return PRAGMA_EXTENSIONS.has(ext)
  })

  /** @type {{ file: string, content: string }[]} */
  const specEntries = specFiles.map((f) => ({
    file: f,
    content: readFileSync(join(root, f), "utf-8"),
  }))

  /** @type {BehaviorDef[]} */
  const allDefs = []
  for (const { file, content } of specEntries) {
    allDefs.push(...extractDefinitions(content, file))
  }

  /** @type {Map<string, Location[]>} */
  const defMap = new Map()
  for (const def of allDefs) {
    const locs = defMap.get(def.id) ?? []
    locs.push({ file: def.file, line: def.line })
    defMap.set(def.id, locs)
  }

  const duplicates = [...defMap.entries()].filter(([, locs]) => locs.length > 1)

  const headingDefs = allDefs.filter((def) => def.isHeading)

  /** @type {PragmaRef[]} */
  const allPragmas = []
  for (const f of sourceFiles) {
    const content = readFileSync(join(root, f), "utf-8")
    allPragmas.push(...extractPragmas(content, f))
  }

  const definedIds = new Set(defMap.keys())
  /** @type {{ id: string, file: string, line: number }[]} */
  const orphans = []

  for (const pragma of allPragmas) {
    for (const id of pragma.ids) {
      if (!BEHAVIOR_ID_RE.test(id)) {
        orphans.push({ id: `${id} (malformed ID)`, file: pragma.file, line: pragma.line })
      } else if (!definedIds.has(id)) {
        orphans.push({ id, file: pragma.file, line: pragma.line })
      }
    }
  }

  /** @type {Set<string>} */
  const implIds = new Set()
  /** @type {Set<string>} */
  const testedIds = new Set()
  for (const pragma of allPragmas) {
    for (const id of pragma.ids) {
      if (pragma.kind === "impl") implIds.add(id)
      if (pragma.kind === "test") testedIds.add(id)
    }
  }

  const untestableIds = loadUntestableIds(root)

  const unimplemented = allDefs.filter((def) => !def.isHeading && !implIds.has(def.id))
  const untested = allDefs.filter((def) => !testedIds.has(def.id) && !untestableIds.has(def.id))
  const untestableCount = allDefs.filter((def) => untestableIds.has(def.id)).length

  const brokenLinks = checkSpecLinks(root, specEntries)

  const backlogFiles = allFiles.filter((f) => f.startsWith("backlog/") && f.endsWith(".md"))
  const { deps: backlogDeps, broken: brokenBacklogDeps } = parseBacklogDeps(root, backlogFiles)
  const backlogCycle = detectCycle(backlogDeps)

  let failed = false

  if (duplicates.length > 0) {
    failed = true
    console.error("\n  Duplicate behavior IDs:\n")
    for (const [id, locs] of duplicates) {
      console.error(`    ${id}`)
      for (const loc of locs) {
        console.error(`      ${loc.file}:${loc.line}`)
      }
    }
  }

  if (orphans.length > 0) {
    failed = true
    console.error("\n  Orphan pragma references (ID not defined in any spec):\n")
    for (const o of orphans) {
      console.error(`    ${o.id}  ${o.file}:${o.line}`)
    }
  }

  if (headingDefs.length > 0) {
    failed = true
    console.error("\n  Heading-level behavior IDs (move to list items or remove the !ID):\n")
    for (const def of headingDefs) {
      console.error(`    !${def.id}  ${def.file}:${def.line}`)
    }
  }

  if (brokenLinks.length > 0) {
    failed = true
    console.error("\n  Broken cross-spec links (target file does not exist):\n")
    for (const link of brokenLinks) {
      console.error(`    ${link.file}:${link.line} -> ${link.target}`)
    }
  }

  if (backlogCycle) {
    failed = true
    console.error("\n  Backlog dependency cycle detected:\n")
    console.error(`    ${backlogCycle.join(" -> ")}`)
  }

  if (brokenBacklogDeps.length > 0) {
    failed = true
    console.error("\n  Broken backlog dependencies (target file does not exist in backlog/):\n")
    for (const dep of brokenBacklogDeps) {
      console.error(`    ${dep.file} -> ${dep.target}`)
    }
  }

  if (unimplemented.length > 0) {
    failed = true
    console.error("\n  Behaviors without impl pragmas (add a pragma or move to backlog):\n")
    for (const def of unimplemented) {
      console.error(`    ${def.id}  ${def.file}:${def.line}`)
    }
  }

  if (failed) {
    console.error("")
    process.exit(1)
  }

  const pragmaCount = allPragmas.reduce((n, p) => n + p.ids.length, 0)
  const testable = allDefs.length - untestableCount
  const tested = testable - untested.length
  const pct = testable > 0 ? ((tested / testable) * 100).toFixed(0) : "–"
  console.log(
    `woke2: ${allDefs.length} behavior(s) defined, ${pragmaCount} pragma reference(s). All clear.`,
  )
  console.log(
    `woke2-coverage: ${tested}/${testable} testable behaviors have explicit tests (${pct}%).` +
      (untestableCount > 0 ? ` ${untestableCount} excluded via UNTESTABLE.md.` : ""),
  )

  if (untested.length > 0) {
    console.log("\n  Behaviors without test pragmas:\n")
    for (const def of untested) {
      console.log(`    ${def.id}  ${def.file}:${def.line}`)
    }
    console.log("")
  }
}

main()
