import { invoke } from "@tauri-apps/api/core"
import type { DiffStats, FileDiff, Project, PromptSnapshot } from "./types"

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

export type SpawnClaudeResult = {
  agent_id: string
}

export function spawnClaude(
  projectPath: string,
  projectId: string,
  resume: boolean,
): Promise<SpawnClaudeResult> {
  return invoke<SpawnClaudeResult>("spawn_claude", { projectPath, projectId, resume })
}

export function writeClaudeStdin(agentId: string, data: string): Promise<void> {
  return invoke("write_claude_stdin", { agentId, data })
}

export function resizeClaude(agentId: string, cols: number, rows: number): Promise<void> {
  return invoke("resize_claude", { agentId, cols, rows })
}

export function killClaude(agentId: string): Promise<void> {
  return invoke("kill_claude", { agentId })
}

export function listPromptSnapshots(projectId: string): Promise<PromptSnapshot[]> {
  return invoke<PromptSnapshot[]>("list_prompt_snapshots", { projectId })
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
