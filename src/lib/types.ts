export type Project = {
  id: string
  name: string
  path: string
  opened_at: string
}

export type SessionMessage = {
  id: string
  role: "user" | "agent"
  content: string
}

export type SessionToolCall = {
  id: string
  title: string
  status: string
}

export type PreviousSession = {
  sessionId: string
  title: string | null
  updatedAt: string | null
}
