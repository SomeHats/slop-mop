use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;
use crate::error::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRule {
    pub id: String,
    pub project_id: Option<String>,
    pub path_prefix: String,
    pub decision: String,
    pub tool_kind: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewPermissionRule {
    pub project_id: Option<String>,
    pub path_prefix: String,
    pub decision: String,
    pub tool_kind: String,
}

#[tauri::command]
pub fn get_permission_rules(
    db: State<'_, Db>,
    project_id: String,
    tool_kind: String,
) -> Result<Vec<PermissionRule>, Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, path_prefix, decision, tool_kind, created_at
             FROM permission_rules
             WHERE tool_kind = ?1 AND (project_id = ?2 OR project_id IS NULL)
             ORDER BY created_at ASC",
        )
        .map_err(|e| Error::Database(e.to_string()))?;

    let rules = stmt
        .query_map(rusqlite::params![tool_kind, project_id], |row| {
            Ok(PermissionRule {
                id: row.get(0)?,
                project_id: row.get(1)?,
                path_prefix: row.get(2)?,
                decision: row.get(3)?,
                tool_kind: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| Error::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| Error::Database(e.to_string()))?;

    Ok(rules)
}

#[tauri::command]
pub fn create_permission_rules(
    db: State<'_, Db>,
    rules: Vec<NewPermissionRule>,
) -> Result<Vec<PermissionRule>, Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    let mut created = Vec::with_capacity(rules.len());

    for rule in &rules {
        // Delete any existing rule with the same (project_id, path_prefix, tool_kind)
        if let Some(ref pid) = rule.project_id {
            conn.execute(
                "DELETE FROM permission_rules
                 WHERE project_id = ?1 AND path_prefix = ?2 AND tool_kind = ?3",
                rusqlite::params![pid, rule.path_prefix, rule.tool_kind],
            )
            .map_err(|e| Error::Database(e.to_string()))?;
        } else {
            conn.execute(
                "DELETE FROM permission_rules
                 WHERE project_id IS NULL AND path_prefix = ?1 AND tool_kind = ?2",
                rusqlite::params![rule.path_prefix, rule.tool_kind],
            )
            .map_err(|e| Error::Database(e.to_string()))?;
        }

        let id = uuid::Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO permission_rules (id, project_id, path_prefix, decision, tool_kind)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![id, rule.project_id, rule.path_prefix, rule.decision, rule.tool_kind],
        )
        .map_err(|e| Error::Database(e.to_string()))?;

        let row = conn
            .query_row(
                "SELECT id, project_id, path_prefix, decision, tool_kind, created_at
                 FROM permission_rules WHERE id = ?1",
                rusqlite::params![id],
                |row| {
                    Ok(PermissionRule {
                        id: row.get(0)?,
                        project_id: row.get(1)?,
                        path_prefix: row.get(2)?,
                        decision: row.get(3)?,
                        tool_kind: row.get(4)?,
                        created_at: row.get(5)?,
                    })
                },
            )
            .map_err(|e| Error::Database(e.to_string()))?;

        created.push(row);
    }

    Ok(created)
}

#[tauri::command]
pub fn delete_permission_rule(db: State<'_, Db>, id: String) -> Result<(), Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    conn.execute(
        "DELETE FROM permission_rules WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| Error::Database(e.to_string()))?;

    Ok(())
}

// --- Execute rules ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecuteRule {
    pub id: String,
    pub project_id: Option<String>,
    pub command: String,
    pub decision: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecuteFlagRule {
    pub id: String,
    pub execute_rule_id: String,
    pub flag: String,
    pub decision: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecuteFileRule {
    pub id: String,
    pub execute_rule_id: String,
    pub path_prefix: String,
    pub decision: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewExecuteRule {
    pub project_id: Option<String>,
    pub command: String,
    pub decision: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewExecuteFlagRule {
    pub execute_rule_id: String,
    pub flag: String,
    pub decision: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewExecuteFileRule {
    pub execute_rule_id: String,
    pub path_prefix: String,
    pub decision: String,
}

#[tauri::command]
pub fn get_execute_rules(
    db: State<'_, Db>,
    project_id: String,
) -> Result<Vec<ExecuteRule>, Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, command, decision, created_at
             FROM execute_rules
             WHERE project_id = ?1 OR project_id IS NULL
             ORDER BY created_at ASC",
        )
        .map_err(|e| Error::Database(e.to_string()))?;

    let rules = stmt
        .query_map(rusqlite::params![project_id], |row| {
            Ok(ExecuteRule {
                id: row.get(0)?,
                project_id: row.get(1)?,
                command: row.get(2)?,
                decision: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| Error::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| Error::Database(e.to_string()))?;

    Ok(rules)
}

#[tauri::command]
pub fn get_execute_flag_rules(
    db: State<'_, Db>,
    execute_rule_id: String,
) -> Result<Vec<ExecuteFlagRule>, Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, execute_rule_id, flag, decision, created_at
             FROM execute_flag_rules
             WHERE execute_rule_id = ?1
             ORDER BY created_at ASC",
        )
        .map_err(|e| Error::Database(e.to_string()))?;

    let rules = stmt
        .query_map(rusqlite::params![execute_rule_id], |row| {
            Ok(ExecuteFlagRule {
                id: row.get(0)?,
                execute_rule_id: row.get(1)?,
                flag: row.get(2)?,
                decision: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| Error::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| Error::Database(e.to_string()))?;

    Ok(rules)
}

#[tauri::command]
pub fn get_execute_file_rules(
    db: State<'_, Db>,
    execute_rule_id: String,
) -> Result<Vec<ExecuteFileRule>, Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, execute_rule_id, path_prefix, decision, created_at
             FROM execute_file_rules
             WHERE execute_rule_id = ?1
             ORDER BY created_at ASC",
        )
        .map_err(|e| Error::Database(e.to_string()))?;

    let rules = stmt
        .query_map(rusqlite::params![execute_rule_id], |row| {
            Ok(ExecuteFileRule {
                id: row.get(0)?,
                execute_rule_id: row.get(1)?,
                path_prefix: row.get(2)?,
                decision: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| Error::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| Error::Database(e.to_string()))?;

    Ok(rules)
}

#[tauri::command]
pub fn create_execute_rule(
    db: State<'_, Db>,
    rule: NewExecuteRule,
) -> Result<ExecuteRule, Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    // Upsert: delete existing rule with same (project_id, command)
    if let Some(ref pid) = rule.project_id {
        conn.execute(
            "DELETE FROM execute_rules WHERE project_id = ?1 AND command = ?2",
            rusqlite::params![pid, rule.command],
        )
        .map_err(|e| Error::Database(e.to_string()))?;
    } else {
        conn.execute(
            "DELETE FROM execute_rules WHERE project_id IS NULL AND command = ?1",
            rusqlite::params![rule.command],
        )
        .map_err(|e| Error::Database(e.to_string()))?;
    }

    let id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO execute_rules (id, project_id, command, decision)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, rule.project_id, rule.command, rule.decision],
    )
    .map_err(|e| Error::Database(e.to_string()))?;

    let row = conn
        .query_row(
            "SELECT id, project_id, command, decision, created_at
             FROM execute_rules WHERE id = ?1",
            rusqlite::params![id],
            |row| {
                Ok(ExecuteRule {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    command: row.get(2)?,
                    decision: row.get(3)?,
                    created_at: row.get(4)?,
                })
            },
        )
        .map_err(|e| Error::Database(e.to_string()))?;

    Ok(row)
}

#[tauri::command]
pub fn create_execute_flag_rules(
    db: State<'_, Db>,
    execute_rule_id: String,
    flags: Vec<NewExecuteFlagRule>,
) -> Result<Vec<ExecuteFlagRule>, Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    let mut created = Vec::with_capacity(flags.len());

    for f in &flags {
        // Upsert: delete existing flag rule with same (execute_rule_id, flag)
        conn.execute(
            "DELETE FROM execute_flag_rules WHERE execute_rule_id = ?1 AND flag = ?2",
            rusqlite::params![execute_rule_id, f.flag],
        )
        .map_err(|e| Error::Database(e.to_string()))?;

        let id = uuid::Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO execute_flag_rules (id, execute_rule_id, flag, decision)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![id, execute_rule_id, f.flag, f.decision],
        )
        .map_err(|e| Error::Database(e.to_string()))?;

        let row = conn
            .query_row(
                "SELECT id, execute_rule_id, flag, decision, created_at
                 FROM execute_flag_rules WHERE id = ?1",
                rusqlite::params![id],
                |row| {
                    Ok(ExecuteFlagRule {
                        id: row.get(0)?,
                        execute_rule_id: row.get(1)?,
                        flag: row.get(2)?,
                        decision: row.get(3)?,
                        created_at: row.get(4)?,
                    })
                },
            )
            .map_err(|e| Error::Database(e.to_string()))?;

        created.push(row);
    }

    Ok(created)
}

#[tauri::command]
pub fn create_execute_file_rules(
    db: State<'_, Db>,
    execute_rule_id: String,
    files: Vec<NewExecuteFileRule>,
) -> Result<Vec<ExecuteFileRule>, Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    let mut created = Vec::with_capacity(files.len());

    for f in &files {
        // Upsert: delete existing file rule with same (execute_rule_id, path_prefix)
        conn.execute(
            "DELETE FROM execute_file_rules WHERE execute_rule_id = ?1 AND path_prefix = ?2",
            rusqlite::params![execute_rule_id, f.path_prefix],
        )
        .map_err(|e| Error::Database(e.to_string()))?;

        let id = uuid::Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO execute_file_rules (id, execute_rule_id, path_prefix, decision)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![id, execute_rule_id, f.path_prefix, f.decision],
        )
        .map_err(|e| Error::Database(e.to_string()))?;

        let row = conn
            .query_row(
                "SELECT id, execute_rule_id, path_prefix, decision, created_at
                 FROM execute_file_rules WHERE id = ?1",
                rusqlite::params![id],
                |row| {
                    Ok(ExecuteFileRule {
                        id: row.get(0)?,
                        execute_rule_id: row.get(1)?,
                        path_prefix: row.get(2)?,
                        decision: row.get(3)?,
                        created_at: row.get(4)?,
                    })
                },
            )
            .map_err(|e| Error::Database(e.to_string()))?;

        created.push(row);
    }

    Ok(created)
}

#[tauri::command]
pub fn delete_execute_rule(db: State<'_, Db>, id: String) -> Result<(), Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    // CASCADE will delete associated flag_rules and file_rules
    conn.execute(
        "DELETE FROM execute_rules WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| Error::Database(e.to_string()))?;

    Ok(())
}
