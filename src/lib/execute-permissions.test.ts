import type { RequestPermissionRequest } from "@agentclientprotocol/sdk"
import { describe, expect, it } from "vitest"
import {
  evaluateCommands,
  evaluateFileArg,
  extractCommandString,
  findMatchingRule,
  type RuleWithFlags,
  resolveFileArg,
} from "./execute-permissions"
import type { ExecuteFileRule, ExecuteRule, ParsedCommand } from "./types"

// --- Helpers ---

function makeRule(
  id: string,
  command: string,
  decision: "allow" | "deny",
  projectId: string | null = null,
): ExecuteRule {
  return { id, project_id: projectId, command, decision, created_at: "" }
}

function makeRuleWithFlags(
  rule: ExecuteRule,
  flagRules: RuleWithFlags["flagRules"] = [],
  fileRules: RuleWithFlags["fileRules"] = [],
): RuleWithFlags {
  return { rule, flagRules, fileRules }
}

function makeCmd(
  identity: string,
  flags: string[] = [],
  fileArgs: string[] = [],
  isDynamic = false,
): ParsedCommand {
  return { identity, flags, fileArgs, isDynamic }
}

// --- extractCommandString ---

describe("extractCommandString", () => {
  it("extracts from rawInput.command", () => {
    const params = {
      toolCall: { rawInput: { command: "git add --all" }, title: "fallback" },
    } as unknown as RequestPermissionRequest
    expect(extractCommandString(params)).toBe("git add --all")
  })

  it("falls back to title when rawInput.command is missing", () => {
    const params = {
      toolCall: { rawInput: {}, title: "npm test" },
    } as unknown as RequestPermissionRequest
    expect(extractCommandString(params)).toBe("npm test")
  })

  it("falls back to title when rawInput is undefined", () => {
    const params = {
      toolCall: { title: "cargo build" },
    } as unknown as RequestPermissionRequest
    expect(extractCommandString(params)).toBe("cargo build")
  })

  it("returns empty string when both are missing", () => {
    const params = {
      toolCall: {},
    } as unknown as RequestPermissionRequest
    expect(extractCommandString(params)).toBe("")
  })

  it("ignores empty rawInput.command", () => {
    const params = {
      toolCall: { rawInput: { command: "" }, title: "fallback" },
    } as unknown as RequestPermissionRequest
    expect(extractCommandString(params)).toBe("fallback")
  })
})

// --- findMatchingRule ---

describe("findMatchingRule", () => {
  it("returns null when no rules match", () => {
    const rules = [makeRuleWithFlags(makeRule("r1", "npm test", "allow"))]
    expect(findMatchingRule("git add", rules, "p1")).toBeNull()
  })

  it("matches exact command identity", () => {
    const rule = makeRule("r1", "git add", "allow")
    const rules = [makeRuleWithFlags(rule)]
    expect(findMatchingRule("git add", rules, "p1")?.rule).toBe(rule)
  })

  it("does NOT match partial command", () => {
    const rules = [makeRuleWithFlags(makeRule("r1", "git", "allow"))]
    expect(findMatchingRule("git add", rules, "p1")).toBeNull()
  })

  it("does NOT match super-command", () => {
    const rules = [makeRuleWithFlags(makeRule("r1", "git add", "allow"))]
    expect(findMatchingRule("git", rules, "p1")).toBeNull()
  })

  it("project-specific rule wins over global", () => {
    const globalRule = makeRule("r1", "git add", "deny")
    const projectRule = makeRule("r2", "git add", "allow", "p1")
    const rules = [makeRuleWithFlags(globalRule), makeRuleWithFlags(projectRule)]
    expect(findMatchingRule("git add", rules, "p1")?.rule).toBe(projectRule)
  })

  it("falls back to global when no project rule", () => {
    const globalRule = makeRule("r1", "git add", "allow")
    const rules = [makeRuleWithFlags(globalRule)]
    expect(findMatchingRule("git add", rules, "p1")?.rule).toBe(globalRule)
  })

  it("ignores other project's rules", () => {
    const otherProjectRule = makeRule("r1", "git add", "allow", "p2")
    const rules = [makeRuleWithFlags(otherProjectRule)]
    // Not a global rule and not for project p1 → no match
    expect(findMatchingRule("git add", rules, "p1")).toBeNull()
  })
})

// --- evaluateFileArg ---

describe("evaluateFileArg", () => {
  const workspace = "/home/user/project"

  it("auto-allows workspace files", () => {
    expect(evaluateFileArg("/home/user/project/src/foo.ts", workspace, [])).toBe("allowed")
  })

  it("returns unmatched for outside-workspace files with no rules", () => {
    expect(evaluateFileArg("/etc/passwd", workspace, [])).toBe("unmatched")
  })

  it("applies allow file rule", () => {
    const rules: ExecuteFileRule[] = [
      { id: "fr1", execute_rule_id: "r1", path_prefix: "/etc", decision: "allow", created_at: "" },
    ]
    expect(evaluateFileArg("/etc/passwd", workspace, rules)).toBe("allowed")
  })

  it("applies deny file rule", () => {
    const rules: ExecuteFileRule[] = [
      { id: "fr1", execute_rule_id: "r1", path_prefix: "/etc", decision: "deny", created_at: "" },
    ]
    expect(evaluateFileArg("/etc/passwd", workspace, rules)).toBe("denied")
  })

  it("longest prefix wins", () => {
    const rules: ExecuteFileRule[] = [
      { id: "fr1", execute_rule_id: "r1", path_prefix: "/etc", decision: "allow", created_at: "" },
      {
        id: "fr2",
        execute_rule_id: "r1",
        path_prefix: "/etc/ssh",
        decision: "deny",
        created_at: "",
      },
    ]
    expect(evaluateFileArg("/etc/ssh/config", workspace, rules)).toBe("denied")
    expect(evaluateFileArg("/etc/hosts", workspace, rules)).toBe("allowed")
  })
})

// --- resolveFileArg ---

describe("resolveFileArg", () => {
  it("returns absolute paths unchanged", () => {
    expect(resolveFileArg("/etc/passwd", "/home/user/project")).toBe("/etc/passwd")
  })

  it("returns tilde paths unchanged", () => {
    expect(resolveFileArg("~/.ssh/config", "/home/user/project")).toBe("~/.ssh/config")
  })

  it("resolves relative paths against workspace", () => {
    expect(resolveFileArg("./src/foo.ts", "/home/user/project")).toBe(
      "/home/user/project/./src/foo.ts",
    )
  })

  it("resolves bare relative paths", () => {
    expect(resolveFileArg("foo.txt", "/home/user/project")).toBe("/home/user/project/foo.txt")
  })

  it("handles workspace with trailing slash", () => {
    expect(resolveFileArg("foo.txt", "/home/user/project/")).toBe("/home/user/project/foo.txt")
  })
})

// --- evaluateCommands ---

describe("evaluateCommands", () => {
  const projectId = "p1"
  const workspace = "/home/user/project"

  it("returns allResolved when no commands", () => {
    const result = evaluateCommands([], [], projectId, workspace)
    expect(result.allResolved).toBe(true)
    expect(result.allDenied).toBe(false)
    expect(result.unmatchedCommands).toEqual([])
    expect(result.deniedCommands).toEqual([])
  })

  it("returns allResolved when all commands fully matched and allowed", () => {
    const rules: RuleWithFlags[] = [
      makeRuleWithFlags(makeRule("r1", "git add", "allow"), [
        { id: "f1", execute_rule_id: "r1", flag: "--all", decision: "allow", created_at: "" },
      ]),
    ]
    const commands = [makeCmd("git add", ["--all"], ["."])]
    const result = evaluateCommands(commands, rules, projectId, workspace)
    expect(result.allResolved).toBe(true)
  })

  it("unmatched when no rule exists for command", () => {
    const commands = [makeCmd("git add", ["--all"])]
    const result = evaluateCommands(commands, [], projectId, workspace)
    expect(result.unmatchedCommands).toHaveLength(1)
    expect(result.unmatchedCommands[0]?.command.identity).toBe("git add")
    expect(result.unmatchedCommands[0]?.existingRule).toBeNull()
    expect(result.allResolved).toBe(false)
  })

  it("denied when command rule is deny", () => {
    const rules: RuleWithFlags[] = [makeRuleWithFlags(makeRule("r1", "rm", "deny"))]
    const commands = [makeCmd("rm", ["-rf"], ["/"])]
    const result = evaluateCommands(commands, rules, projectId, workspace)
    expect(result.deniedCommands).toHaveLength(1)
    expect(result.deniedCommands[0]?.reason).toBe("command_denied")
    expect(result.unmatchedCommands).toHaveLength(0)
  })

  it("allDenied when all commands are denied with none unmatched", () => {
    const rules: RuleWithFlags[] = [makeRuleWithFlags(makeRule("r1", "rm", "deny"))]
    const commands = [makeCmd("rm", ["-rf"])]
    const result = evaluateCommands(commands, rules, projectId, workspace)
    expect(result.allDenied).toBe(true)
    expect(result.allResolved).toBe(false)
  })

  it("denied when allowed command has denied flag and no unmatched flags", () => {
    const rules: RuleWithFlags[] = [
      makeRuleWithFlags(makeRule("r1", "git add", "allow"), [
        { id: "f1", execute_rule_id: "r1", flag: "-p", decision: "deny", created_at: "" },
      ]),
    ]
    const commands = [makeCmd("git add", ["-p"])]
    const result = evaluateCommands(commands, rules, projectId, workspace)
    expect(result.deniedCommands).toHaveLength(1)
    expect(result.deniedCommands[0]?.reason).toBe("flag_denied")
    expect(result.deniedCommands[0]?.deniedFlags).toEqual(["-p"])
  })

  it("unmatched when allowed command has unmatched flag", () => {
    const rules: RuleWithFlags[] = [makeRuleWithFlags(makeRule("r1", "git add", "allow"))]
    const commands = [makeCmd("git add", ["--all"])]
    const result = evaluateCommands(commands, rules, projectId, workspace)
    expect(result.unmatchedCommands).toHaveLength(1)
    expect(result.unmatchedCommands[0]?.unmatchedFlags).toEqual(["--all"])
    expect(result.unmatchedCommands[0]?.existingRule?.id).toBe("r1")
  })

  it("workspace files are auto-allowed and don't cause unmatched", () => {
    const rules: RuleWithFlags[] = [makeRuleWithFlags(makeRule("r1", "cat", "allow"))]
    // File inside workspace
    const commands = [makeCmd("cat", [], ["/home/user/project/src/foo.ts"])]
    const result = evaluateCommands(commands, rules, projectId, workspace)
    expect(result.allResolved).toBe(true)
  })

  it("outside-workspace file with no file rule is unmatched", () => {
    const rules: RuleWithFlags[] = [makeRuleWithFlags(makeRule("r1", "cat", "allow"))]
    const commands = [makeCmd("cat", [], ["/etc/passwd"])]
    const result = evaluateCommands(commands, rules, projectId, workspace)
    expect(result.unmatchedCommands).toHaveLength(1)
    expect(result.unmatchedCommands[0]?.unmatchedFiles).toEqual(["/etc/passwd"])
  })

  it("outside-workspace file with deny file rule is denied", () => {
    const rules: RuleWithFlags[] = [
      makeRuleWithFlags(
        makeRule("r1", "cat", "allow"),
        [],
        [
          {
            id: "fr1",
            execute_rule_id: "r1",
            path_prefix: "/etc",
            decision: "deny",
            created_at: "",
          },
        ],
      ),
    ]
    const commands = [makeCmd("cat", [], ["/etc/passwd"])]
    const result = evaluateCommands(commands, rules, projectId, workspace)
    expect(result.deniedCommands).toHaveLength(1)
    expect(result.deniedCommands[0]?.reason).toBe("file_denied")
  })

  it("resolves relative file args against workspace", () => {
    const rules: RuleWithFlags[] = [makeRuleWithFlags(makeRule("r1", "cat", "allow"))]
    // Relative path resolves to workspace — should be auto-allowed
    const commands = [makeCmd("cat", [], ["./src/foo.ts"])]
    const result = evaluateCommands(commands, rules, projectId, workspace)
    expect(result.allResolved).toBe(true)
  })

  it("handles mixed: one allowed, one unmatched, one denied", () => {
    const rules: RuleWithFlags[] = [
      makeRuleWithFlags(makeRule("r1", "git add", "allow"), [
        { id: "f1", execute_rule_id: "r1", flag: "--all", decision: "allow", created_at: "" },
      ]),
      makeRuleWithFlags(makeRule("r2", "rm", "deny")),
    ]
    const commands = [
      makeCmd("git add", ["--all"], ["."]),
      makeCmd("npm test"),
      makeCmd("rm", ["-rf"]),
    ]
    const result = evaluateCommands(commands, rules, projectId, workspace)
    // git add → allowed, npm test → unmatched, rm → denied
    expect(result.allResolved).toBe(false)
    expect(result.allDenied).toBe(false)
    expect(result.unmatchedCommands).toHaveLength(1)
    expect(result.unmatchedCommands[0]?.command.identity).toBe("npm test")
    expect(result.deniedCommands).toHaveLength(1)
    expect(result.deniedCommands[0]?.command.identity).toBe("rm")
  })

  it("command with no flags and allow rule is fully resolved", () => {
    const rules: RuleWithFlags[] = [makeRuleWithFlags(makeRule("r1", "ls", "allow"))]
    const commands = [makeCmd("ls")]
    const result = evaluateCommands(commands, rules, projectId, workspace)
    expect(result.allResolved).toBe(true)
  })

  it("unmatched flag AND denied flag → unmatched (not denied)", () => {
    const rules: RuleWithFlags[] = [
      makeRuleWithFlags(makeRule("r1", "git add", "allow"), [
        { id: "f1", execute_rule_id: "r1", flag: "-p", decision: "deny", created_at: "" },
      ]),
    ]
    // Both -p (denied) and --all (unmatched) present
    const commands = [makeCmd("git add", ["-p", "--all"])]
    const result = evaluateCommands(commands, rules, projectId, workspace)
    // Should be unmatched since there are still unresolved flags
    expect(result.unmatchedCommands).toHaveLength(1)
    expect(result.unmatchedCommands[0]?.unmatchedFlags).toEqual(["--all"])
    expect(result.unmatchedCommands[0]?.deniedFlags).toEqual(["-p"])
    expect(result.deniedCommands).toHaveLength(0)
  })
})
