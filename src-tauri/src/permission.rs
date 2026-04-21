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
pub fn delete_execute_flag_rule(db: State<'_, Db>, id: String) -> Result<(), Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    conn.execute(
        "DELETE FROM execute_flag_rules WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| Error::Database(e.to_string()))?;

    Ok(())
}

#[tauri::command]
pub fn delete_execute_file_rule(db: State<'_, Db>, id: String) -> Result<(), Error> {
    let conn = db.0.lock().map_err(|e| Error::Database(e.to_string()))?;

    conn.execute(
        "DELETE FROM execute_file_rules WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| Error::Database(e.to_string()))?;

    Ok(())
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

#[cfg(test)]
mod tests {
    use crate::db::Db;

    /// Helper: insert an execute rule and return its id.
    fn insert_execute_rule(
        conn: &rusqlite::Connection,
        id: &str,
        project_id: Option<&str>,
        command: &str,
        decision: &str,
    ) {
        conn.execute(
            "INSERT INTO execute_rules (id, project_id, command, decision) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![id, project_id, command, decision],
        )
        .unwrap();
    }

    fn insert_flag_rule(
        conn: &rusqlite::Connection,
        id: &str,
        execute_rule_id: &str,
        flag: &str,
        decision: &str,
    ) {
        conn.execute(
            "INSERT INTO execute_flag_rules (id, execute_rule_id, flag, decision) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![id, execute_rule_id, flag, decision],
        )
        .unwrap();
    }

    fn insert_file_rule(
        conn: &rusqlite::Connection,
        id: &str,
        execute_rule_id: &str,
        path_prefix: &str,
        decision: &str,
    ) {
        conn.execute(
            "INSERT INTO execute_file_rules (id, execute_rule_id, path_prefix, decision) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![id, execute_rule_id, path_prefix, decision],
        )
        .unwrap();
    }

    fn count_rows(conn: &rusqlite::Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn test_schema_creates_tables() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.0.lock().unwrap();

        // Verify tables exist by querying them
        assert_eq!(count_rows(&conn, "execute_rules"), 0);
        assert_eq!(count_rows(&conn, "execute_flag_rules"), 0);
        assert_eq!(count_rows(&conn, "execute_file_rules"), 0);
    }

    #[test]
    fn test_insert_and_query_execute_rule() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.0.lock().unwrap();

        // Need a project for the FK
        conn.execute(
            "INSERT INTO projects (id, name, path) VALUES ('p1', 'test', '/tmp/test')",
            [],
        )
        .unwrap();

        insert_execute_rule(&conn, "r1", Some("p1"), "git add", "allow");

        let (command, decision): (String, String) = conn
            .query_row(
                "SELECT command, decision FROM execute_rules WHERE id = 'r1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(command, "git add");
        assert_eq!(decision, "allow");
    }

    #[test]
    fn test_global_rule_has_null_project_id() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.0.lock().unwrap();

        insert_execute_rule(&conn, "r1", None, "docker compose up", "deny");

        let project_id: Option<String> = conn
            .query_row(
                "SELECT project_id FROM execute_rules WHERE id = 'r1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(project_id, None);
    }

    #[test]
    fn test_query_returns_project_and_global_rules() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.0.lock().unwrap();

        conn.execute(
            "INSERT INTO projects (id, name, path) VALUES ('p1', 'test', '/tmp/test')",
            [],
        )
        .unwrap();

        insert_execute_rule(&conn, "r1", Some("p1"), "git add", "allow");
        insert_execute_rule(&conn, "r2", None, "npm test", "allow");
        insert_execute_rule(&conn, "r3", Some("p1"), "cargo build", "deny");

        // Query for project p1 should return r1, r2 (global), r3
        let mut stmt = conn
            .prepare(
                "SELECT id FROM execute_rules WHERE project_id = ?1 OR project_id IS NULL ORDER BY id",
            )
            .unwrap();
        let ids: Vec<String> = stmt
            .query_map(rusqlite::params!["p1"], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(ids, vec!["r1", "r2", "r3"]);
    }

    #[test]
    fn test_flag_rules_linked_to_execute_rule() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.0.lock().unwrap();

        insert_execute_rule(&conn, "r1", None, "git add", "allow");
        insert_flag_rule(&conn, "f1", "r1", "--all", "allow");
        insert_flag_rule(&conn, "f2", "r1", "-p", "deny");

        let mut stmt = conn
            .prepare("SELECT flag, decision FROM execute_flag_rules WHERE execute_rule_id = 'r1' ORDER BY flag")
            .unwrap();
        let flags: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(flags, vec![
            ("--all".to_string(), "allow".to_string()),
            ("-p".to_string(), "deny".to_string()),
        ]);
    }

    #[test]
    fn test_file_rules_linked_to_execute_rule() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.0.lock().unwrap();

        insert_execute_rule(&conn, "r1", None, "cat", "allow");
        insert_file_rule(&conn, "fr1", "r1", "/etc", "allow");
        insert_file_rule(&conn, "fr2", "r1", "/etc/ssh", "deny");

        let mut stmt = conn
            .prepare("SELECT path_prefix, decision FROM execute_file_rules WHERE execute_rule_id = 'r1' ORDER BY path_prefix")
            .unwrap();
        let files: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(files, vec![
            ("/etc".to_string(), "allow".to_string()),
            ("/etc/ssh".to_string(), "deny".to_string()),
        ]);
    }

    #[test]
    fn test_cascade_delete_removes_flag_and_file_rules() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.0.lock().unwrap();

        insert_execute_rule(&conn, "r1", None, "git add", "allow");
        insert_flag_rule(&conn, "f1", "r1", "--all", "allow");
        insert_flag_rule(&conn, "f2", "r1", "-p", "deny");
        insert_file_rule(&conn, "fr1", "r1", "/etc", "allow");

        assert_eq!(count_rows(&conn, "execute_flag_rules"), 2);
        assert_eq!(count_rows(&conn, "execute_file_rules"), 1);

        // Delete the parent execute rule
        conn.execute("DELETE FROM execute_rules WHERE id = 'r1'", [])
            .unwrap();

        // Flag and file rules should be cascade-deleted
        assert_eq!(count_rows(&conn, "execute_flag_rules"), 0);
        assert_eq!(count_rows(&conn, "execute_file_rules"), 0);
    }

    #[test]
    fn test_decision_check_constraint() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.0.lock().unwrap();

        // Invalid decision value should fail
        let result = conn.execute(
            "INSERT INTO execute_rules (id, command, decision) VALUES ('r1', 'ls', 'maybe')",
            [],
        );
        assert!(result.is_err());

        // Valid values should succeed
        insert_execute_rule(&conn, "r1", None, "ls", "allow");
        insert_execute_rule(&conn, "r2", None, "rm", "deny");
        assert_eq!(count_rows(&conn, "execute_rules"), 2);
    }

    #[test]
    fn test_flag_rule_fk_constraint() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.0.lock().unwrap();

        // Inserting a flag rule with non-existent execute_rule_id should fail
        let result = conn.execute(
            "INSERT INTO execute_flag_rules (id, execute_rule_id, flag, decision) VALUES ('f1', 'nonexistent', '--all', 'allow')",
            [],
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_upsert_semantics_for_execute_rules() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.0.lock().unwrap();

        // Simulate the upsert logic: delete existing, then insert
        insert_execute_rule(&conn, "r1", None, "git add", "allow");
        assert_eq!(count_rows(&conn, "execute_rules"), 1);

        // Upsert: delete matching, insert new
        conn.execute(
            "DELETE FROM execute_rules WHERE project_id IS NULL AND command = 'git add'",
            [],
        )
        .unwrap();
        insert_execute_rule(&conn, "r2", None, "git add", "deny");

        assert_eq!(count_rows(&conn, "execute_rules"), 1);

        let decision: String = conn
            .query_row(
                "SELECT decision FROM execute_rules WHERE command = 'git add'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(decision, "deny");
    }

    #[test]
    fn test_project_and_global_rules_coexist() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.0.lock().unwrap();

        conn.execute(
            "INSERT INTO projects (id, name, path) VALUES ('p1', 'test', '/tmp/test')",
            [],
        )
        .unwrap();

        // Same command, one project-specific and one global
        insert_execute_rule(&conn, "r1", Some("p1"), "git add", "allow");
        insert_execute_rule(&conn, "r2", None, "git add", "deny");

        // Both should exist
        assert_eq!(count_rows(&conn, "execute_rules"), 2);

        // Upsert for project-specific should not affect global
        conn.execute(
            "DELETE FROM execute_rules WHERE project_id = 'p1' AND command = 'git add'",
            [],
        )
        .unwrap();
        insert_execute_rule(&conn, "r3", Some("p1"), "git add", "deny");

        assert_eq!(count_rows(&conn, "execute_rules"), 2);

        // Global rule should still be "deny"
        let global_decision: String = conn
            .query_row(
                "SELECT decision FROM execute_rules WHERE project_id IS NULL AND command = 'git add'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(global_decision, "deny");
    }

    #[test]
    fn test_cascade_only_affects_own_children() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.0.lock().unwrap();

        insert_execute_rule(&conn, "r1", None, "git add", "allow");
        insert_execute_rule(&conn, "r2", None, "npm test", "allow");
        insert_flag_rule(&conn, "f1", "r1", "--all", "allow");
        insert_flag_rule(&conn, "f2", "r2", "--verbose", "allow");

        // Delete r1 — only f1 should be removed
        conn.execute("DELETE FROM execute_rules WHERE id = 'r1'", [])
            .unwrap();

        assert_eq!(count_rows(&conn, "execute_flag_rules"), 1);
        let remaining_flag: String = conn
            .query_row("SELECT flag FROM execute_flag_rules", [], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining_flag, "--verbose");
    }
}
