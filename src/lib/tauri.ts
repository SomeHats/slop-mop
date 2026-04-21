import { invoke } from "@tauri-apps/api/core"
import type {
  DiffStats,
  ExecuteFileRule,
  ExecuteFlagRule,
  ExecuteRule,
  FileDiff,
  NewExecuteFileRule,
  NewExecuteFlagRule,
  NewExecuteRule,
  NewRule,
  PermissionRule,
  Project,
  PromptSnapshot,
} from "./types"

export function openProject(path: string): Promise<Project> {
  return invoke<Project>("open_project", { path })
}

export function openProjectWindow(path: string): Promise<void> {
  return invoke("open_project_window", { path })
}

export function listRecentProjects(): Promise<Project[]> {
  return invoke<Project[]>("list_recent_projects")
}

export function removeProject(id: string): Promise<void> {
  return invoke("remove_project", { id })
}

export function spawnAgent(projectPath: string): Promise<string> {
  return invoke<string>("spawn_agent", { projectPath })
}

export function writeAgentStdin(agentId: string, data: string): Promise<void> {
  return invoke("write_agent_stdin", { agentId, data })
}

export function killAgent(agentId: string): Promise<void> {
  return invoke("kill_agent", { agentId })
}

export function isWorktreeDirty(projectPath: string): Promise<boolean> {
  return invoke<boolean>("is_worktree_dirty", { projectPath })
}

export function recordPromptSnapshot(
  sessionId: string,
  projectId: string,
  messageId: string,
  promptText: string,
  projectPath: string,
): Promise<PromptSnapshot> {
  return invoke<PromptSnapshot>("record_prompt_snapshot", {
    sessionId,
    projectId,
    messageId,
    promptText,
    projectPath,
  })
}

export function listPromptSnapshots(sessionId: string): Promise<PromptSnapshot[]> {
  return invoke<PromptSnapshot[]>("list_prompt_snapshots", { sessionId })
}

export function batchDiffStats(
  projectPath: string,
  snapshotHashes: [string, string][],
): Promise<DiffStats[]> {
  return invoke<DiffStats[]>("batch_diff_stats", { projectPath, snapshotHashes })
}

export function getRepoDiff(projectPath: string, commitHash: string): Promise<FileDiff[]> {
  return invoke<FileDiff[]>("get_repo_diff", { projectPath, commitHash })
}

export function startWatching(projectPath: string): Promise<void> {
  return invoke("start_watching", { projectPath })
}

export function stopWatching(): Promise<void> {
  return invoke("stop_watching")
}

export function getPermissionRules(projectId: string, toolKind: string): Promise<PermissionRule[]> {
  return invoke<PermissionRule[]>("get_permission_rules", { projectId, toolKind })
}

export function createPermissionRules(rules: NewRule[]): Promise<PermissionRule[]> {
  return invoke<PermissionRule[]>("create_permission_rules", { rules })
}

export function deletePermissionRule(id: string): Promise<void> {
  return invoke("delete_permission_rule", { id })
}

// --- Execute rules ---

export function getExecuteRules(projectId: string): Promise<ExecuteRule[]> {
  return invoke<ExecuteRule[]>("get_execute_rules", { projectId })
}

export function getExecuteFlagRules(executeRuleId: string): Promise<ExecuteFlagRule[]> {
  return invoke<ExecuteFlagRule[]>("get_execute_flag_rules", { executeRuleId })
}

export function getExecuteFileRules(executeRuleId: string): Promise<ExecuteFileRule[]> {
  return invoke<ExecuteFileRule[]>("get_execute_file_rules", { executeRuleId })
}

export function createExecuteRule(rule: NewExecuteRule): Promise<ExecuteRule> {
  return invoke<ExecuteRule>("create_execute_rule", { rule })
}

export function createExecuteFlagRules(
  executeRuleId: string,
  flags: NewExecuteFlagRule[],
): Promise<ExecuteFlagRule[]> {
  return invoke<ExecuteFlagRule[]>("create_execute_flag_rules", { executeRuleId, flags })
}

export function createExecuteFileRules(
  executeRuleId: string,
  files: NewExecuteFileRule[],
): Promise<ExecuteFileRule[]> {
  return invoke<ExecuteFileRule[]>("create_execute_file_rules", { executeRuleId, files })
}

export function deleteExecuteRule(id: string): Promise<void> {
  return invoke("delete_execute_rule", { id })
}

export function deleteExecuteFlagRule(id: string): Promise<void> {
  return invoke("delete_execute_flag_rule", { id })
}

export function deleteExecuteFileRule(id: string): Promise<void> {
  return invoke("delete_execute_file_rule", { id })
}
