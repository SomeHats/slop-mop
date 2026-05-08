// @ts-check

const { describe, it } = require("node:test")
const assert = require("node:assert/strict")
const { pathToFileURL } = require("node:url")
const { join } = require("node:path")
const { isPathInsideRoot, resolveRepoRoot, uriToRelPathWithinRoot } = require("./paths.js")

// woke2 test LSP-IX1, LSP-IX6
describe("repo-root path scoping", () => {
  it("resolves a git repo root that contains the starting directory", () => {
    const repoRoot = resolveRepoRoot(process.cwd())
    assert.equal(isPathInsideRoot(repoRoot, process.cwd()), true)
  })

  it("keeps files inside the repo root", () => {
    const root = "/repo"
    assert.equal(isPathInsideRoot(root, "/repo/specs/cli.spec.md"), true)
    assert.equal(
      uriToRelPathWithinRoot(root, pathToFileURL("/repo/specs/cli.spec.md").toString()),
      "specs/cli.spec.md",
    )
  })

  it("rejects sibling worktree paths outside the repo root", () => {
    const root = "/repo"
    const external = "/worktrees/repo/abc/specs/cli.spec.md"
    assert.equal(isPathInsideRoot(root, external), false)
    assert.equal(uriToRelPathWithinRoot(root, pathToFileURL(external).toString()), null)
  })

  it("rejects parent-traversal paths that resolve outside the repo root", () => {
    const root = "/repo"
    const external = join(root, "..", "other", "specs", "cli.spec.md")
    assert.equal(isPathInsideRoot(root, external), false)
  })
})
