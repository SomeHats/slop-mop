// @ts-check
const fs = require("node:fs")
const path = require("node:path")
const os = require("node:os")

const extRoot = __dirname
const extId = "woke2.woke2-lsp"

const candidates = [
  path.join(os.homedir(), ".cursor", "extensions"),
  path.join(os.homedir(), ".vscode", "extensions"),
]

const extDir = candidates.find((d) => fs.existsSync(d))
if (!extDir) {
  console.error("woke2-lsp: no extensions directory found, skipping")
  process.exit(0)
}

const linkPath = path.join(extDir, extId)

const isWin = process.platform === "win32"

try {
  const target = isWin ? fs.readlinkSync(linkPath) : fs.readlinkSync(linkPath)
  if (target === extRoot) process.exit(0)
  // Remove stale link — fs.unlinkSync doesn't work for junctions on Windows
  if (isWin) fs.rmdirSync(linkPath)
  else fs.unlinkSync(linkPath)
} catch (e) {
  if (/** @type {NodeJS.ErrnoException} */ (e).code !== "ENOENT") {
    console.error(`woke2-lsp: ${linkPath} exists and is not a symlink/junction, skipping`)
    process.exit(0)
  }
}

if (isWin) {
  // Junctions need no special privileges, unlike symlinks on Windows
  const { execFileSync } = require("node:child_process")
  execFileSync("cmd.exe", ["/C", "mklink", "/J", linkPath, extRoot], { stdio: "ignore" })
} else {
  fs.symlinkSync(extRoot, linkPath)
}
console.log(`woke2-lsp: linked ${linkPath}`)
