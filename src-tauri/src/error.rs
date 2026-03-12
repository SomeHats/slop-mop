use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Not a git repository: {0}")]
    NotAGitRepo(String),

    #[error("Git error: {0}")]
    Git(#[from] git2::Error),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("Agent spawn failed: {0}")]
    AgentSpawnFailed(String),

    #[error("Agent not found: {0}")]
    AgentNotFound(String),

    #[error("Agent stdin write failed: {0}")]
    AgentStdinWrite(String),

    #[error("Window error: {0}")]
    Window(String),
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
