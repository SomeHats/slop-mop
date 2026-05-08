import { invoke } from "@tauri-apps/api/core"
import type {
  AnchorForWorkdir,
  Comment,
  DiffStats,
  FileDiff,
  Project,
  ProjectedComment,
  ProjectSettings,
  SessionCommitsResult,
} from "./types"

// woke2 impl LIB-TA1, LIB-TA2
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

export function getProjectSettings(projectId: string): Promise<ProjectSettings> {
  return invoke<ProjectSettings>("get_project_settings", { projectId })
}

export function updateProjectSettings(projectId: string, settings: ProjectSettings): Promise<void> {
  return invoke("update_project_settings", { projectId, settings })
}

export function getHeadBranch(projectPath: string): Promise<string | null> {
  return invoke<string | null>("get_head_branch", { projectPath })
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
  projectId: string,
  projectPath: string,
  sessionId: string,
): Promise<SessionCommitsResult> {
  return invoke<SessionCommitsResult>("list_session_commits", {
    projectId,
    projectPath,
    sessionId,
  })
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

export function createComment(args: {
  sessionId: string
  commitHash: string
  filePath: string
  rangeStart: number
  rangeEnd: number | null
  contents: string
}): Promise<Comment> {
  return invoke<Comment>("create_comment", args)
}

export function listComments(sessionId: string): Promise<Comment[]> {
  return invoke<Comment[]>("list_comments", { sessionId })
}

export function deleteComment(id: string): Promise<void> {
  return invoke("delete_comment", { id })
}

export function updateComment(id: string, contents: string): Promise<Comment> {
  return invoke<Comment>("update_comment", { id, contents })
}

export function projectComments(
  projectPath: string,
  commentIds: string[],
  targetCommit: string | null,
): Promise<ProjectedComment[]> {
  return invoke<ProjectedComment[]>("project_comments", {
    projectPath,
    commentIds,
    targetCommit,
  })
}

export function anchorForWorkdir(
  projectPath: string,
  filePath: string,
  workdirStart: number,
  workdirEnd: number | null,
): Promise<AnchorForWorkdir> {
  return invoke<AnchorForWorkdir>("anchor_for_workdir", {
    projectPath,
    filePath,
    workdirStart,
    workdirEnd,
  })
}
