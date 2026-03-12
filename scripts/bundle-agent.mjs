import { build } from "esbuild"
import { cpSync, mkdirSync } from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, "..")
const outDir = resolve(root, "src-tauri", "agent-bundle")

mkdirSync(outDir, { recursive: true })

// Patch the claudeCliPath function to resolve cli.js relative to the bundle
// instead of using import.meta.resolve on the SDK package
const patchCliResolution = {
  name: "patch-cli-resolution",
  setup(build) {
    build.onLoad({ filter: /acp-agent\.js$/ }, async (args) => {
      const fs = await import("fs")
      let contents = fs.readFileSync(args.path, "utf8")
      // Replace the import.meta.resolve(...) call with a dirname-relative path
      contents = contents.replace(
        `import.meta.resolve("@anthropic-ai/claude-agent-sdk").replace("sdk.mjs", "cli.js")`,
        `new URL("cli.js", import.meta.url).href`,
      )
      return { contents, loader: "js" }
    })
  },
}

await build({
  entryPoints: [
    resolve(
      root,
      "node_modules/@zed-industries/claude-agent-acp/dist/index.js",
    ),
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: resolve(outDir, "claude-agent-acp.mjs"),
  external: ["@anthropic-ai/claude-agent-sdk/embed"],
  plugins: [patchCliResolution],
})

// Copy cli.js next to the bundle — find it in pnpm's .pnpm store
import { globSync } from "fs"
const cliCandidates = globSync(
  resolve(root, "node_modules/.pnpm/@anthropic-ai+claude-agent-sdk*/node_modules/@anthropic-ai/claude-agent-sdk/cli.js"),
)
if (cliCandidates.length === 0) {
  throw new Error("Could not find @anthropic-ai/claude-agent-sdk/cli.js in node_modules")
}
cpSync(cliCandidates[0], resolve(outDir, "cli.js"))

console.log("Agent bundle created at:", outDir)
