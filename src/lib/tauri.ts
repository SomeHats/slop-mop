import { invoke } from "@tauri-apps/api/core"
import type { Project, PromptSnapshot } from "./types"

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
