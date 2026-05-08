// woke2 impl LIB-LG1
export const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  rs: "rust",
  py: "python",
  css: "css",
  html: "html",
  json: "json",
  md: "markdown",
  toml: "toml",
  yaml: "yaml",
  yml: "yaml",
  sh: "bash",
  bash: "bash",
  sql: "sql",
  go: "go",
}

// woke2 impl LIB-LG2, LIB-LG3, LIB-LG4
export function langFromPath(filePath: string): string | undefined {
  const ext = filePath.split(".").pop()?.toLowerCase()
  return ext ? EXT_TO_LANGUAGE[ext] : undefined
}
