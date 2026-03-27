import type { RequestPermissionRequest, RequestPermissionResponse } from "@agentclientprotocol/sdk"
import { useCallback, useRef, useState } from "react"
import { evaluatePath, findAllowOnceOption } from "@/lib/permissions"
import { createPermissionRules, getPermissionRules } from "@/lib/tauri"
import type { NewRule, PendingPermission, PermissionRule } from "@/lib/types"

type PermissionHandler = {
  pendingPermission: PendingPermission | null
  handlePermissionRequest: (
    params: RequestPermissionRequest,
    projectId: string,
    workspacePath: string,
  ) => Promise<RequestPermissionResponse>
  allowOnce: () => void
  denyOnce: () => void
  createRulesAndContinue: (rules: NewRule[]) => void
}

export function usePermissionHandler(): PermissionHandler {
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null)
  const pendingRef = useRef<PendingPermission | null>(null)

  const evaluateAndResolve = useCallback(
    async (
      params: RequestPermissionRequest,
      projectId: string,
      workspacePath: string,
      resolve: (response: RequestPermissionResponse) => void,
    ): Promise<void> => {
      const toolKind = params.toolCall.kind as "read" | "edit"
      const locations = params.toolCall.locations ?? []
      const paths = locations.map((loc) => loc.path)

      let rules: PermissionRule[]
      try {
        rules = await getPermissionRules(projectId, toolKind)
      } catch {
        // If we can't fetch rules, auto-approve
        resolve({ outcome: findAllowOnceOption(params) })
        return
      }

      const denied: string[] = []
      const unmatched: string[] = []

      for (const p of paths) {
        const result = evaluatePath(p, workspacePath, rules, projectId)
        if (result === "denied") {
          denied.push(p)
        } else if (result === "unmatched") {
          unmatched.push(p)
        }
      }

      if (unmatched.length === 0 && denied.length === 0) {
        resolve({ outcome: findAllowOnceOption(params) })
        return
      }

      if (unmatched.length === 0 && denied.length > 0) {
        resolve({ outcome: { outcome: "cancelled" } })
        return
      }

      const pending: PendingPermission = {
        request: params,
        unmatchedPaths: unmatched,
        deniedPaths: denied,
        toolKind,
        projectId,
        resolve,
      }
      pendingRef.current = pending
      setPendingPermission(pending)
    },
    [],
  )

  const handlePermissionRequest = useCallback(
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

  const allowOnce = useCallback((): void => {
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    setPendingPermission(null)
    pending.resolve({ outcome: findAllowOnceOption(pending.request) })
  }, [])

  const denyOnce = useCallback((): void => {
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    setPendingPermission(null)
    pending.resolve({ outcome: { outcome: "cancelled" } })
  }, [])

  const createRulesAndContinue = useCallback((rules: NewRule[]): void => {
    const pending = pendingRef.current
    if (!pending) return

    void (async () => {
      try {
        await createPermissionRules(rules)
      } catch (e) {
        console.error("[permissions] failed to create rules:", e)
        return
      }

      const { projectId } = pending

      // Re-fetch rules and re-evaluate only the paths that were in the dialog.
      // Workspace paths were already filtered as "allowed" before the dialog was shown,
      // so we use an empty string for workspacePath — it won't match anything.
      let fetchedRules: PermissionRule[]
      try {
        fetchedRules = await getPermissionRules(projectId, pending.toolKind)
      } catch {
        pendingRef.current = null
        setPendingPermission(null)
        pending.resolve({ outcome: findAllowOnceOption(pending.request) })
        return
      }

      const allPaths = [...pending.unmatchedPaths, ...pending.deniedPaths]
      const newDenied: string[] = []
      const newUnmatched: string[] = []

      for (const p of allPaths) {
        const result = evaluatePath(p, "", fetchedRules, projectId)
        if (result === "denied") {
          newDenied.push(p)
        } else if (result === "unmatched") {
          newUnmatched.push(p)
        }
        // "allowed" by rule → resolved
      }

      if (newUnmatched.length === 0) {
        pendingRef.current = null
        setPendingPermission(null)
        if (newDenied.length > 0) {
          pending.resolve({ outcome: { outcome: "cancelled" } })
        } else {
          pending.resolve({ outcome: findAllowOnceOption(pending.request) })
        }
        return
      }

      // Still unmatched — update dialog
      const updated: PendingPermission = {
        ...pending,
        unmatchedPaths: newUnmatched,
        deniedPaths: newDenied,
      }
      pendingRef.current = updated
      setPendingPermission(updated)
    })()
  }, [])

  return {
    pendingPermission,
    handlePermissionRequest,
    allowOnce,
    denyOnce,
    createRulesAndContinue,
  }
}
