import { describe, expect, it } from "vitest"
import { looksLikePath, parseCommandString } from "./command-parser"

describe("looksLikePath", () => {
  it("matches absolute paths", () => {
    expect(looksLikePath("/etc/passwd")).toBe(true)
    expect(looksLikePath("/usr/local/bin")).toBe(true)
  })

  it("matches relative paths", () => {
    expect(looksLikePath("./foo")).toBe(true)
    expect(looksLikePath("../bar")).toBe(true)
    expect(looksLikePath("src/lib/foo.ts")).toBe(true)
  })

  it("matches dot and dotdot", () => {
    expect(looksLikePath(".")).toBe(true)
    expect(looksLikePath("..")).toBe(true)
  })

  it("matches tilde paths", () => {
    expect(looksLikePath("~")).toBe(true)
    expect(looksLikePath("~/.ssh/config")).toBe(true)
  })

  it("rejects URLs", () => {
    expect(looksLikePath("https://example.com")).toBe(false)
    expect(looksLikePath("http://localhost:3000/api")).toBe(false)
    expect(looksLikePath("ftp://files.example.com/pub")).toBe(false)
  })

  it("rejects plain words", () => {
    expect(looksLikePath("foo")).toBe(false)
    expect(looksLikePath("add")).toBe(false)
    expect(looksLikePath("--all")).toBe(false)
  })
})

describe("parseCommandString", () => {
  it("parses simple command", async () => {
    const result = await parseCommandString("ls")
    expect(result).toEqual([{ identity: "ls", flags: [], fileArgs: [], isDynamic: false }])
  })

  it("extracts flags", async () => {
    const result = await parseCommandString("ls -la")
    expect(result).toEqual([{ identity: "ls", flags: ["-la"], fileArgs: [], isDynamic: false }])
  })

  it("extracts file args", async () => {
    const result = await parseCommandString("cat /etc/passwd")
    expect(result).toEqual([
      { identity: "cat", flags: [], fileArgs: ["/etc/passwd"], isDynamic: false },
    ])
  })

  it("extracts sub-commands from git", async () => {
    const result = await parseCommandString("git add --all .")
    expect(result).toEqual([
      { identity: "git add", flags: ["--all"], fileArgs: ["."], isDynamic: false },
    ])
  })

  it("extracts multi-level sub-commands", async () => {
    const result = await parseCommandString("docker compose up -d")
    expect(result).toEqual([
      { identity: "docker compose up", flags: ["-d"], fileArgs: [], isDynamic: false },
    ])
  })

  it("handles pipeline as separate commands", async () => {
    const result = await parseCommandString("cat /etc/hosts | grep localhost")
    expect(result).toHaveLength(2)
    expect(result?.[0]?.identity).toBe("cat")
    expect(result?.[0]?.fileArgs).toEqual(["/etc/hosts"])
    // "localhost" is a non-flag, non-path arg → consumed as sub-command identity
    expect(result?.[1]?.identity).toBe("grep localhost")
  })

  it("handles logical AND as separate commands", async () => {
    const result = await parseCommandString("git add . && npm test")
    expect(result).toHaveLength(2)
    expect(result?.[0]?.identity).toBe("git add")
    expect(result?.[0]?.fileArgs).toEqual(["."])
    expect(result?.[1]?.identity).toBe("npm test")
  })

  it("handles logical OR as separate commands", async () => {
    const result = await parseCommandString("test -f ./foo || echo missing")
    expect(result).toHaveLength(2)
    expect(result?.[0]?.identity).toBe("test")
    // "missing" is a non-flag, non-path arg → consumed as sub-command identity
    expect(result?.[1]?.identity).toBe("echo missing")
  })

  it("marks command expansion as dynamic", async () => {
    const result = await parseCommandString("echo $(whoami)")
    expect(result).not.toBeNull()
    expect(result?.[0]?.isDynamic).toBe(true)
  })

  it("marks backtick expansion as dynamic", async () => {
    const result = await parseCommandString("echo `date`")
    expect(result).not.toBeNull()
    expect(result?.[0]?.isDynamic).toBe(true)
  })

  it("returns null on parse failure", async () => {
    // Unclosed quote should fail to parse
    const result = await parseCommandString('echo "unterminated')
    expect(result).toBeNull()
  })

  it("returns empty array for bare assignment", async () => {
    const result = await parseCommandString("FOO=bar")
    expect(result).toEqual([])
  })

  it("handles relative file args", async () => {
    const result = await parseCommandString("cat ./relative/path.txt")
    expect(result?.[0]?.fileArgs).toEqual(["./relative/path.txt"])
  })

  it("treats git rule and git add rule as different identities", async () => {
    const gitResult = await parseCommandString("git status")
    const gitAddResult = await parseCommandString("git add --all")
    expect(gitResult?.[0]?.identity).toBe("git status")
    expect(gitAddResult?.[0]?.identity).toBe("git add")
    // "git status" !== "git add" — exact match semantics
    expect(gitResult?.[0]?.identity).not.toBe(gitAddResult?.[0]?.identity)
  })

  it("handles mixed flags and files", async () => {
    const result = await parseCommandString("rm -rf /tmp/foo ./bar")
    expect(result).toEqual([
      {
        identity: "rm",
        flags: ["-rf"],
        fileArgs: ["/tmp/foo", "./bar"],
        isDynamic: false,
      },
    ])
  })

  it("does not treat URLs as file args", async () => {
    const result = await parseCommandString("curl https://example.com/api")
    expect(result?.[0]?.identity).toBe("curl")
    expect(result?.[0]?.fileArgs).toEqual([])
  })

  it("handles empty string", async () => {
    const result = await parseCommandString("")
    // Empty string parses to empty script
    expect(result).toEqual([])
  })
})
