import type { RequestPermissionRequest } from "@agentclientprotocol/sdk"
import type { PermissionRule } from "./types"

/**
 * Segment-aware path prefix matching.
 * Matches if path equals prefix exactly, or path starts with prefix followed by "/".
 */
export function pathMatchesPrefix(path: string, prefix: string): boolean {
  if (prefix === "/") return path.startsWith("/")
  return path === prefix || path.startsWith(`${prefix}/`)
}

/**
 * Evaluate a single path against the workspace boundary and permission rules.
 *
 * Priority: workspace check first, then project-specific rules beat global rules,
 * and among rules at the same scope the longest prefix wins.
 */
export function evaluatePath(
  path: string,
  workspacePath: string,
  rules: PermissionRule[],
  projectId: string,
): "allowed" | "denied" | "unmatched" {
  // 1. Paths inside the workspace are always allowed
  if (pathMatchesPrefix(path, workspacePath)) {
    return "allowed"
  }

  // 2. Find all matching rules
  const matching = rules.filter((r) => pathMatchesPrefix(path, r.path_prefix))
  if (matching.length === 0) {
    return "unmatched"
  }

  // 3. Separate project-specific vs global
  const projectRules = matching.filter((r) => r.project_id === projectId)
  const globalRules = matching.filter((r) => r.project_id === null)

  // Project rules take priority over global rules
  const applicable = projectRules.length > 0 ? projectRules : globalRules

  // Longest prefix wins
  let best = applicable[0]
  if (!best) {
    return "unmatched"
  }
  for (let i = 1; i < applicable.length; i++) {
    const rule = applicable[i]
    if (rule && rule.path_prefix.length > best.path_prefix.length) {
      best = rule
    }
  }

  return best.decision === "allow" ? "allowed" : "denied"
}

/**
 * Find the "allow_once" option from a permission request, falling back to the
 * first option, or "cancelled" if no options exist.
 */
export function findAllowOnceOption(
  params: RequestPermissionRequest,
): { outcome: "selected"; optionId: string } | { outcome: "cancelled" } {
  const opt = params.options.find((o) => o.kind === "allow_once")
  if (opt) {
    return { outcome: "selected", optionId: opt.optionId }
  }
  const first = params.options[0]
  if (first) {
    return { outcome: "selected", optionId: first.optionId }
  }
  return { outcome: "cancelled" }
}
