import type { RequestPermissionRequest } from "@agentclientprotocol/sdk"
import { pathMatchesPrefix } from "./permissions"
import type {
  DeniedCommand,
  ExecuteFileRule,
  ExecuteFlagRule,
  ExecuteRule,
  ParsedCommand,
  UnmatchedCommand,
} from "./types"

export type RuleWithFlags = {
  rule: ExecuteRule
  flagRules: ExecuteFlagRule[]
  fileRules: ExecuteFileRule[]
}

export type EvaluationResult = {
  unmatchedCommands: UnmatchedCommand[]
  deniedCommands: DeniedCommand[]
  allResolved: boolean
  allDenied: boolean
}

/**
 * Extract the bash command string from a permission request.
 * Prefers `rawInput.command`, falls back to `title`.
 */
export function extractCommandString(params: RequestPermissionRequest): string {
  const rawInput = params.toolCall.rawInput as { command?: string } | undefined
  if (rawInput && typeof rawInput.command === "string" && rawInput.command.length > 0) {
    return rawInput.command
  }
  return params.toolCall.title ?? ""
}

/**
 * Find the matching execute rule for a command identity.
 * Exact match only. Project-specific wins over global.
 */
export function findMatchingRule(
  identity: string,
  rules: RuleWithFlags[],
  projectId: string,
): RuleWithFlags | null {
  const projectMatch = rules.find(
    (r) => r.rule.command === identity && r.rule.project_id === projectId,
  )
  if (projectMatch) return projectMatch

  const globalMatch = rules.find((r) => r.rule.command === identity && r.rule.project_id === null)
  return globalMatch ?? null
}

/**
 * Evaluate a file arg against workspace boundary and file rules.
 * Workspace files are auto-allowed. Outside-workspace files are matched
 * against file rules (longest prefix wins).
 */
export function evaluateFileArg(
  filePath: string,
  workspacePath: string,
  fileRules: ExecuteFileRule[],
): "allowed" | "denied" | "unmatched" {
  if (pathMatchesPrefix(filePath, workspacePath)) {
    return "allowed"
  }

  const matching = fileRules.filter((r) => pathMatchesPrefix(filePath, r.path_prefix))
  if (matching.length === 0) return "unmatched"

  // Longest prefix wins
  let best = matching[0]
  if (!best) return "unmatched"
  for (let i = 1; i < matching.length; i++) {
    const rule = matching[i]
    if (rule && rule.path_prefix.length > best.path_prefix.length) {
      best = rule
    }
  }

  return best.decision === "allow" ? "allowed" : "denied"
}

/**
 * Resolve a potentially relative file arg to an absolute path.
 * Simple string-based join — no Node.js `path` module in webview.
 */
export function resolveFileArg(fileArg: string, workspacePath: string): string {
  if (fileArg.startsWith("/")) return fileArg
  if (fileArg.startsWith("~")) return fileArg
  // Join workspace + relative, normalizing double slashes
  const base = workspacePath.endsWith("/") ? workspacePath : `${workspacePath}/`
  return `${base}${fileArg}`
}

/**
 * Evaluate a set of parsed commands against execute rules, flag rules, and file rules.
 *
 * For each command:
 * 1. Find matching rule (exact identity match, project > global)
 * 2. No rule → unmatched command
 * 3. Rule with decision="deny" → denied command
 * 4. Rule with decision="allow":
 *    a. Check each flag against flag rules → allow/deny/unmatched
 *    b. Check each file arg: workspace → auto-allow, else check file rules
 *    c. Collect unmatched/denied/matched results
 */
export function evaluateCommands(
  commands: ParsedCommand[],
  rules: RuleWithFlags[],
  projectId: string,
  workspacePath: string,
): EvaluationResult {
  const unmatched: UnmatchedCommand[] = []
  const denied: DeniedCommand[] = []
  let hasUnresolved = false

  for (const cmd of commands) {
    const match = findMatchingRule(cmd.identity, rules, projectId)

    if (!match) {
      // No rule for this command at all
      unmatched.push({
        command: cmd,
        unmatchedFlags: [...cmd.flags],
        deniedFlags: [],
        unmatchedFiles: cmd.fileArgs
          .map((f) => resolveFileArg(f, workspacePath))
          .filter((f) => !pathMatchesPrefix(f, workspacePath)),
        deniedFiles: [],
        existingRule: null,
      })
      hasUnresolved = true
      continue
    }

    if (match.rule.decision === "deny") {
      denied.push({
        command: cmd,
        reason: "command_denied",
        deniedFlags: [],
        deniedFiles: [],
      })
      continue
    }

    // Command is allowed — check flags
    const unmatchedFlags: string[] = []
    const deniedFlags: string[] = []

    for (const flag of cmd.flags) {
      const flagRule = match.flagRules.find((fr) => fr.flag === flag)
      if (!flagRule) {
        unmatchedFlags.push(flag)
      } else if (flagRule.decision === "deny") {
        deniedFlags.push(flag)
      }
      // allowed flags are fine
    }

    if (deniedFlags.length > 0 && unmatchedFlags.length === 0) {
      denied.push({
        command: cmd,
        reason: "flag_denied",
        deniedFlags,
        deniedFiles: [],
      })
      continue
    }

    // Check file args
    const unmatchedFiles: string[] = []
    const deniedFiles: string[] = []

    for (const fileArg of cmd.fileArgs) {
      const resolved = resolveFileArg(fileArg, workspacePath)
      const result = evaluateFileArg(resolved, workspacePath, match.fileRules)
      if (result === "unmatched") {
        unmatchedFiles.push(resolved)
      } else if (result === "denied") {
        deniedFiles.push(resolved)
      }
    }

    if (deniedFiles.length > 0 && unmatchedFiles.length === 0 && unmatchedFlags.length === 0) {
      denied.push({
        command: cmd,
        reason: "file_denied",
        deniedFlags,
        deniedFiles,
      })
      continue
    }

    if (unmatchedFlags.length > 0 || unmatchedFiles.length > 0) {
      unmatched.push({
        command: cmd,
        unmatchedFlags,
        deniedFlags,
        unmatchedFiles,
        deniedFiles,
        existingRule: match.rule,
      })
      hasUnresolved = true
    }

    // Fully matched and allowed — no action needed
  }

  return {
    unmatchedCommands: unmatched,
    deniedCommands: denied,
    allResolved: !hasUnresolved && denied.length === 0,
    allDenied: !hasUnresolved && denied.length > 0,
  }
}
