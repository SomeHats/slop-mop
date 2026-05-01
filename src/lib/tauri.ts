import { invoke } from "@tauri-apps/api/core"
import type { DiffStats, FileDiff, Project, SessionCommit } from "./types"

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

export function listSessionCommits(
  projectPath: string,
  sessionId: string,
): Promise<SessionCommit[]> {
  return invoke<SessionCommit[]>("list_session_commits", { projectPath, sessionId })
}

export function batchDiffStats(projectPath: string, commitHashes: string[]): Promise<DiffStats[]> {
  return invoke<DiffStats[]>("batch_diff_stats", { projectPath, commitHashes })
}

export function getRangeDiff(
  projectPath: string,
  olderHash: string | null,
  newerHash: string | null,
): Promise<FileDiff[]> {
  return invoke<FileDiff[]>("get_range_diff", { projectPath, olderHash, newerHash })
}

export function startWatching(projectPath: string): Promise<void> {
  return invoke("start_watching", { projectPath })
}

export function stopWatching(): Promise<void> {
  return invoke("stop_watching")
}
