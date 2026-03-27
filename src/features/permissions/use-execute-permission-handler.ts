import type { RequestPermissionRequest, RequestPermissionResponse } from "@agentclientprotocol/sdk"
import { useCallback, useRef, useState } from "react"
import { parseCommandString } from "@/lib/command-parser"
import { findAllowOnceOption, pathMatchesPrefix } from "@/lib/permissions"
import {
  createExecuteFileRules,
  createExecuteFlagRules,
  createExecuteRule,
  getExecuteFileRules,
  getExecuteFlagRules,
  getExecuteRules,
} from "@/lib/tauri"
import type {
  DeniedCommand,
  ExecuteFileRule,
  ExecuteFlagRule,
  ExecuteRule,
  NewExecuteFileRule,
  NewExecuteFlagRule,
  NewExecuteRule,
  ParsedCommand,
  PendingExecutePermission,
  UnmatchedCommand,
} from "@/lib/types"

function extractCommandString(params: RequestPermissionRequest): string {
  const rawInput = params.toolCall.rawInput as { command?: string } | undefined
  if (rawInput && typeof rawInput.command === "string" && rawInput.command.length > 0) {
    return rawInput.command
  }
  return params.toolCall.title ?? ""
}

type RuleWithFlags = {
  rule: ExecuteRule
  flagRules: ExecuteFlagRule[]
  fileRules: ExecuteFileRule[]
}

/**
 * Find the matching execute rule for a command identity.
 * Exact match only. Project-specific wins over global.
 */
function findMatchingRule(
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
 * Evaluate a file arg against workspace and file rules.
 */
function evaluateFileArg(
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
function resolveFileArg(fileArg: string, workspacePath: string): string {
  if (fileArg.startsWith("/")) return fileArg
  if (fileArg.startsWith("~")) return fileArg
  // Join workspace + relative, normalizing double slashes
  const base = workspacePath.endsWith("/") ? workspacePath : `${workspacePath}/`
  return `${base}${fileArg}`
}

type EvaluationResult = {
  unmatchedCommands: UnmatchedCommand[]
  deniedCommands: DeniedCommand[]
  allResolved: boolean
  allDenied: boolean
}

function evaluateCommands(
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

export type ExecutePermissionHandler = {
  pendingExecutePermission: PendingExecutePermission | null
  handleExecutePermissionRequest: (
    params: RequestPermissionRequest,
    projectId: string,
    workspacePath: string,
  ) => Promise<RequestPermissionResponse>
  allowOnceExecutePermission: () => void
  denyOnceExecutePermission: () => void
  createExecutePermissionRules: (
    commandRules: NewExecuteRule[],
    flagRules: Map<number, NewExecuteFlagRule[]>,
    fileRules: Map<number, NewExecuteFileRule[]>,
  ) => void
}

async function fetchRulesWithDetails(projectId: string): Promise<RuleWithFlags[]> {
  const executeRules = await getExecuteRules(projectId)

  const results: RuleWithFlags[] = []
  for (const rule of executeRules) {
    const [flagRules, fileRules] = await Promise.all([
      getExecuteFlagRules(rule.id),
      getExecuteFileRules(rule.id),
    ])
    results.push({ rule, flagRules, fileRules })
  }
  return results
}

export function useExecutePermissionHandler(): ExecutePermissionHandler {
  const [pendingExecutePermission, setPendingExecutePermission] =
    useState<PendingExecutePermission | null>(null)
  const pendingRef = useRef<PendingExecutePermission | null>(null)

  const evaluateAndResolve = useCallback(
    async (
      params: RequestPermissionRequest,
      projectId: string,
      workspacePath: string,
      resolve: (response: RequestPermissionResponse) => void,
    ): Promise<void> => {
      const rawCommandString = extractCommandString(params)

      // Empty command — auto-approve
      if (!rawCommandString.trim()) {
        resolve({ outcome: findAllowOnceOption(params) })
        return
      }

      // Parse the command string
      const commands = await parseCommandString(rawCommandString)

      // Parse failure → dynamic fallback
      if (commands === null) {
        const pending: PendingExecutePermission = {
          request: params,
          rawCommandString,
          commands: [],
          unmatchedCommands: [],
          deniedCommands: [],
          isDynamic: true,
          projectId,
          workspacePath,
          resolve,
        }
        pendingRef.current = pending
        setPendingExecutePermission(pending)
        return
      }

      // Any dynamic command → dynamic fallback
      if (commands.some((c) => c.isDynamic)) {
        const pending: PendingExecutePermission = {
          request: params,
          rawCommandString,
          commands,
          unmatchedCommands: [],
          deniedCommands: [],
          isDynamic: true,
          projectId,
          workspacePath,
          resolve,
        }
        pendingRef.current = pending
        setPendingExecutePermission(pending)
        return
      }

      // No commands extracted (e.g. bare assignment) — auto-approve
      if (commands.length === 0) {
        resolve({ outcome: findAllowOnceOption(params) })
        return
      }

      // Fetch rules
      let rules: RuleWithFlags[]
      try {
        rules = await fetchRulesWithDetails(projectId)
      } catch {
        // If we can't fetch rules, auto-approve
        resolve({ outcome: findAllowOnceOption(params) })
        return
      }

      // Evaluate
      const result = evaluateCommands(commands, rules, projectId, workspacePath)

      if (result.allResolved) {
        resolve({ outcome: findAllowOnceOption(params) })
        return
      }

      if (result.allDenied) {
        resolve({ outcome: { outcome: "cancelled" } })
        return
      }

      // Show dialog
      const pending: PendingExecutePermission = {
        request: params,
        rawCommandString,
        commands,
        unmatchedCommands: result.unmatchedCommands,
        deniedCommands: result.deniedCommands,
        isDynamic: false,
        projectId,
        workspacePath,
        resolve,
      }
      pendingRef.current = pending
      setPendingExecutePermission(pending)
    },
    [],
  )

  const handleExecutePermissionRequest = useCallback(
    (
      params: RequestPermissionRequest,
      projectId: string,
      workspacePath: string,
    ): Promise<RequestPermissionResponse> => {
      return new Promise<RequestPermissionResponse>((resolve) => {
        void evaluateAndResolve(params, projectId, workspacePath, resolve)
      })
    },
    [evaluateAndResolve],
  )

  const allowOnceExecutePermission = useCallback((): void => {
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    setPendingExecutePermission(null)
    pending.resolve({ outcome: findAllowOnceOption(pending.request) })
  }, [])

  const denyOnceExecutePermission = useCallback((): void => {
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    setPendingExecutePermission(null)
    pending.resolve({ outcome: { outcome: "cancelled" } })
  }, [])

  const createExecutePermissionRules = useCallback(
    (
      commandRules: NewExecuteRule[],
      flagRules: Map<number, NewExecuteFlagRule[]>,
      fileRules: Map<number, NewExecuteFileRule[]>,
    ): void => {
      const pending = pendingRef.current
      if (!pending) return

      void (async () => {
        try {
          // Create command rules and their associated flag/file rules
          for (let i = 0; i < commandRules.length; i++) {
            const cmdRule = commandRules[i]
            if (!cmdRule) continue

            const created = await createExecuteRule(cmdRule)
            const cmdFlagRules = flagRules.get(i)
            const cmdFileRules = fileRules.get(i)

            if (cmdFlagRules && cmdFlagRules.length > 0) {
              await createExecuteFlagRules(
                created.id,
                cmdFlagRules.map((f) => ({ ...f, execute_rule_id: created.id })),
              )
            }

            if (cmdFileRules && cmdFileRules.length > 0) {
              await createExecuteFileRules(
                created.id,
                cmdFileRules.map((f) => ({ ...f, execute_rule_id: created.id })),
              )
            }
          }
        } catch (e) {
          console.error("[execute-permissions] failed to create rules:", e)
          return
        }

        // Re-fetch and re-evaluate
        const { projectId, workspacePath, commands } = pending
        let rules: RuleWithFlags[]
        try {
          rules = await fetchRulesWithDetails(projectId)
        } catch {
          pendingRef.current = null
          setPendingExecutePermission(null)
          pending.resolve({ outcome: findAllowOnceOption(pending.request) })
          return
        }

        const result = evaluateCommands(commands, rules, projectId, workspacePath)

        if (result.unmatchedCommands.length === 0) {
          pendingRef.current = null
          setPendingExecutePermission(null)
          if (result.deniedCommands.length > 0) {
            pending.resolve({ outcome: { outcome: "cancelled" } })
          } else {
            pending.resolve({ outcome: findAllowOnceOption(pending.request) })
          }
          return
        }

        // Still unmatched — update dialog
        const updated: PendingExecutePermission = {
          ...pending,
          unmatchedCommands: result.unmatchedCommands,
          deniedCommands: result.deniedCommands,
        }
        pendingRef.current = updated
        setPendingExecutePermission(updated)
      })()
    },
    [],
  )

  return {
    pendingExecutePermission,
    handleExecutePermissionRequest,
    allowOnceExecutePermission,
    denyOnceExecutePermission,
    createExecutePermissionRules,
  }
}
