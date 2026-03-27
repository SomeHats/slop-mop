import type { RequestPermissionRequest, RequestPermissionResponse } from "@agentclientprotocol/sdk"
import { useCallback, useRef, useState } from "react"
import { parseCommandString } from "@/lib/command-parser"
import {
  type EvaluationResult,
  evaluateCommands,
  extractCommandString,
  type RuleWithFlags,
} from "@/lib/execute-permissions"
import { findAllowOnceOption } from "@/lib/permissions"
import {
  createExecuteFileRules,
  createExecuteFlagRules,
  createExecuteRule,
  getExecuteFileRules,
  getExecuteFlagRules,
  getExecuteRules,
} from "@/lib/tauri"
import type {
  NewExecuteFileRule,
  NewExecuteFlagRule,
  NewExecuteRule,
  PendingExecutePermission,
} from "@/lib/types"

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

function resolveFromResult(
  result: EvaluationResult,
  params: RequestPermissionRequest,
): RequestPermissionResponse | null {
  if (result.allResolved) {
    return { outcome: findAllowOnceOption(params) }
  }
  if (result.allDenied) {
    return { outcome: { outcome: "cancelled" } }
  }
  return null
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

      const autoResponse = resolveFromResult(result, params)
      if (autoResponse) {
        resolve(autoResponse)
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
