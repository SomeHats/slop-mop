// @ts-check

const { execSync } = require("node:child_process")
const { realpathSync } = require("node:fs")
const { isAbsolute, relative, resolve } = require("node:path")
const { fileURLToPath } = require("node:url")

/**
 * @param {string} fsPath
 * @returns {string}
 */
function normalizePath(fsPath) {
  try {
    return realpathSync.native(fsPath)
  } catch {
    return resolve(fsPath)
  }
}

/**
 * @param {string} rootPath
 * @param {string} fsPath
 * @returns {boolean}
 */
function isPathInsideRoot(rootPath, fsPath) {
  const rel = relative(normalizePath(rootPath), normalizePath(fsPath))
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}

// woke2 impl LSP-IX1
/**
 * @param {string} startPath
 * @returns {string}
 */
function resolveRepoRoot(startPath) {
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      cwd: startPath,
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
    }).trim()
    // git returns forward slashes on Windows; resolve() normalizes to
    // native separators so relative() comparisons work consistently.
    return resolve(root)
  } catch {
    return resolve(startPath)
  }
}

// woke2 impl LSP-IX6
/**
 * @param {string} rootPath
 * @param {string} uri
 * @returns {string | null}
 */
function uriToRelPathWithinRoot(rootPath, uri) {
  try {
    const fsPath = fileURLToPath(uri)
    if (!isPathInsideRoot(rootPath, fsPath)) {
      return null
    }
    if (fsPath.includes("/.cursor/")) {
      return null
    }
    // Normalize to forward slashes so relative paths are consistent
    // regardless of whether rootPath came from git (forward slashes)
    // or the OS (backslashes on Windows).
    return relative(rootPath, fsPath).split("\\").join("/")
  } catch {
    return null
  }
}

module.exports = {
  isPathInsideRoot,
  resolveRepoRoot,
  uriToRelPathWithinRoot,
}
