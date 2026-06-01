use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LcuRawResult {
    pub lockfile_found: bool,
    pub lcu_reachable: bool,
    pub raw_session: Option<Value>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathProbe {
    pub path: String,
    pub exists: bool,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessProbe {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executable_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LcuDiagnosticResult {
    pub checked_paths: Vec<PathProbe>,
    pub detected_processes: Vec<ProcessProbe>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_path: Option<String>,
    pub lockfile_found: bool,
    pub lcu_reachable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct LockfileCandidate {
    pub path: PathBuf,
    pub source: String,
}

pub fn parse_lockfile(content: &str) -> Option<(u16, String)> {
    let line = content.lines().next()?.trim();
    let parts: Vec<&str> = line.split(':').collect();
    if parts.len() < 5 {
        return None;
    }
    let port = parts.get(2)?.parse::<u16>().ok()?;
    let password = parts.get(3)?.trim();
    if port == 0 || password.is_empty() {
        return None;
    }
    Some((port, password.to_string()))
}

pub fn redact_sensitive(value: &str) -> String {
    let mut redacted = value.to_string();
    for marker in ["authorization", "Authorization", "Basic "] {
        if let Some(idx) = redacted.find(marker) {
            redacted.truncate(idx);
            redacted.push_str(marker);
            redacted.push_str(" <redacted>");
            return redacted;
        }
    }
    redacted
}

pub fn process_lockfile_candidates(processes: &[ProcessProbe]) -> Vec<LockfileCandidate> {
    let mut candidates = Vec::new();
    for process in processes {
        let Some(path) = process.executable_path.as_ref().filter(|path| !path.trim().is_empty()) else {
            continue;
        };
        let exe = PathBuf::from(path);
        if let Some(parent) = exe.parent() {
            candidates.push(LockfileCandidate {
                path: parent.join("lockfile"),
                source: format!("process:{}", process.name),
            });
        }

        let components: Vec<String> = exe
            .components()
            .map(|part| part.as_os_str().to_string_lossy().to_string())
            .collect();
        if let Some(idx) = components
            .iter()
            .position(|part| part.eq_ignore_ascii_case("League of Legends"))
        {
            let mut root = PathBuf::new();
            for part in components.iter().take(idx + 1) {
                root.push(part);
            }
            candidates.push(LockfileCandidate {
                path: root.join("lockfile"),
                source: format!("process-root:{}", process.name),
            });
        }
    }
    candidates
}

pub fn build_lockfile_candidates(
    env: &BTreeMap<String, String>,
    processes: &[ProcessProbe],
) -> Vec<LockfileCandidate> {
    let mut candidates = Vec::new();
    if let Some(value) = env.get("LEAGUE_LOCKFILE").filter(|value| !value.trim().is_empty()) {
        candidates.push(LockfileCandidate {
            path: PathBuf::from(value.trim()),
            source: "env:LEAGUE_LOCKFILE".to_string(),
        });
    }
    if let Some(local_app_data) = env.get("LOCALAPPDATA") {
        candidates.push(LockfileCandidate {
            path: PathBuf::from(local_app_data)
                .join("Riot Games")
                .join("League of Legends")
                .join("lockfile"),
            source: "env:LOCALAPPDATA".to_string(),
        });
    }
    if let Some(program_files) = env.get("ProgramFiles") {
        candidates.push(LockfileCandidate {
            path: PathBuf::from(program_files)
                .join("Riot Games")
                .join("League of Legends")
                .join("lockfile"),
            source: "env:ProgramFiles".to_string(),
        });
    }
    if let Some(program_files_x86) = env.get("ProgramFiles(x86)") {
        candidates.push(LockfileCandidate {
            path: PathBuf::from(program_files_x86)
                .join("Riot Games")
                .join("League of Legends")
                .join("lockfile"),
            source: "env:ProgramFiles(x86)".to_string(),
        });
    }

    candidates.extend(process_lockfile_candidates(processes));
    candidates.extend([
        LockfileCandidate {
            path: PathBuf::from(r"C:\Riot Games\League of Legends\lockfile"),
            source: "standard:C".to_string(),
        },
        LockfileCandidate {
            path: PathBuf::from(r"C:\Riot Games\PBE\lockfile"),
            source: "standard:PBE".to_string(),
        },
        LockfileCandidate {
            path: PathBuf::from(r"D:\Riot Games\League of Legends\lockfile"),
            source: "standard:D".to_string(),
        },
        LockfileCandidate {
            path: PathBuf::from(r"E:\Riot Games\League of Legends\lockfile"),
            source: "standard:E".to_string(),
        },
    ]);

    let mut seen = BTreeSet::new();
    candidates
        .into_iter()
        .filter(|candidate| seen.insert(candidate.path.display().to_string().to_ascii_lowercase()))
        .collect()
}

fn current_env_map() -> BTreeMap<String, String> {
    ["LEAGUE_LOCKFILE", "LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"]
        .into_iter()
        .filter_map(|key| std::env::var(key).ok().map(|value| (key.to_string(), value)))
        .collect()
}

pub fn detect_riot_processes() -> Vec<ProcessProbe> {
    #[cfg(windows)]
    {
        let mut command = Command::new("powershell.exe");
        command
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-WindowStyle",
                "Hidden",
                "-Command",
                "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'League|Riot' } | Select-Object ProcessId,Name,ExecutablePath | ConvertTo-Json -Compress",
            ]);
        let output = command.output();
        let Ok(output) = output else {
            return Vec::new();
        };
        if !output.status.success() {
            return Vec::new();
        }
        let text = String::from_utf8_lossy(&output.stdout);
        parse_process_json(text.trim())
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

fn parse_process_json(text: &str) -> Vec<ProcessProbe> {
    if text.trim().is_empty() {
        return Vec::new();
    }
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return Vec::new();
    };
    let rows: Vec<Value> = match value {
        Value::Array(rows) => rows,
        Value::Object(_) => vec![value],
        _ => Vec::new(),
    };
    rows.into_iter()
        .filter_map(|row| {
            let name = row.get("Name").and_then(Value::as_str)?.to_string();
            Some(ProcessProbe {
                pid: row
                    .get("ProcessId")
                    .and_then(Value::as_u64)
                    .and_then(|pid| u32::try_from(pid).ok()),
                name,
                executable_path: row
                    .get("ExecutablePath")
                    .and_then(Value::as_str)
                    .map(|path| path.to_string()),
            })
        })
        .collect()
}

pub fn hot_poll_lockfile_candidates() -> Vec<LockfileCandidate> {
    build_lockfile_candidates(&current_env_map(), &[])
}

pub fn probe_paths(candidates: &[LockfileCandidate]) -> Vec<PathProbe> {
    candidates
        .iter()
        .map(|candidate| PathProbe {
            path: candidate.path.display().to_string(),
            exists: candidate.path.exists(),
            source: candidate.source.clone(),
        })
        .collect()
}

fn first_existing_path(candidates: &[LockfileCandidate]) -> Option<&Path> {
    candidates
        .iter()
        .map(|candidate| candidate.path.as_path())
        .find(|path| path.exists())
}

pub async fn fetch_lcu_raw() -> LcuRawResult {
    let candidates = hot_poll_lockfile_candidates();
    let Some(path) = first_existing_path(&candidates) else {
        return LcuRawResult {
            lockfile_found: false,
            lcu_reachable: false,
            raw_session: None,
            error: Some("League client lockfile not found. Start the League client.".to_string()),
        };
    };
    fetch_lcu_raw_from_path(path).await
}

async fn fetch_lcu_raw_from_path(path: &Path) -> LcuRawResult {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) => {
            return LcuRawResult {
                lockfile_found: true,
                lcu_reachable: false,
                raw_session: None,
                error: Some(redact_sensitive(&error.to_string())),
            }
        }
    };
    let Some((port, password)) = parse_lockfile(&content) else {
        return LcuRawResult {
            lockfile_found: true,
            lcu_reachable: false,
            raw_session: None,
            error: Some("Invalid lockfile format.".to_string()),
        };
    };
    fetch_lcu_raw_with_credentials(port, &password).await
}

async fn fetch_lcu_raw_with_credentials(port: u16, password: &str) -> LcuRawResult {
    let client = match reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            return LcuRawResult {
                lockfile_found: true,
                lcu_reachable: false,
                raw_session: None,
                error: Some(redact_sensitive(&error.to_string())),
            }
        }
    };
    let auth = BASE64.encode(format!("riot:{password}"));
    let url = format!("https://127.0.0.1:{port}/lol-champ-select/v1/session");
    let response = match client
        .get(url)
        .header("authorization", format!("Basic {auth}"))
        .header("accept", "application/json")
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            return LcuRawResult {
                lockfile_found: true,
                lcu_reachable: false,
                raw_session: None,
                error: Some(redact_sensitive(&error.to_string())),
            }
        }
    };
    let status = response.status().as_u16();
    if status == 404 {
        return LcuRawResult {
            lockfile_found: true,
            lcu_reachable: true,
            raw_session: None,
            error: None,
        };
    }
    if !(200..300).contains(&status) {
        return LcuRawResult {
            lockfile_found: true,
            lcu_reachable: true,
            raw_session: None,
            error: Some(format!("Champ select HTTP {status}")),
        };
    }
    match response.json::<Value>().await {
        Ok(raw_session) => LcuRawResult {
            lockfile_found: true,
            lcu_reachable: true,
            raw_session: Some(raw_session),
            error: None,
        },
        Err(_) => LcuRawResult {
            lockfile_found: true,
            lcu_reachable: true,
            raw_session: None,
            error: Some("Invalid JSON from LCU".to_string()),
        },
    }
}

pub async fn diagnostics() -> LcuDiagnosticResult {
    let processes = detect_riot_processes();
    diagnostics_from_processes(processes).await
}

async fn diagnostics_from_processes(processes: Vec<ProcessProbe>) -> LcuDiagnosticResult {
    let candidates = build_lockfile_candidates(&current_env_map(), &processes);
    let selected = first_existing_path(&candidates).map(|path| path.to_path_buf());
    let checked_paths = probe_paths(&candidates);
    let Some(path) = selected else {
        let riot_seen = processes
            .iter()
            .any(|process| process.name.to_ascii_lowercase().contains("riot"));
        return LcuDiagnosticResult {
            checked_paths,
            detected_processes: processes,
            selected_path: None,
            lockfile_found: false,
            lcu_reachable: false,
            error: Some(if riot_seen {
                "Riot Client is running, but the League lockfile is not available yet.".to_string()
            } else {
                "League client lockfile not found. Start the League client.".to_string()
            }),
        };
    };
    let raw = fetch_lcu_raw_from_path(&path).await;
    LcuDiagnosticResult {
        checked_paths,
        detected_processes: processes,
        selected_path: Some(path.display().to_string()),
        lockfile_found: raw.lockfile_found,
        lcu_reachable: raw.lcu_reachable,
        error: raw.error,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lockfile_parser_accepts_valid_lines() {
        assert_eq!(
            parse_lockfile("LeagueClient:1234:54999:secret:https\n").unwrap(),
            (54999, "secret".to_string())
        );
    }

    #[test]
    fn lockfile_parser_rejects_bad_lines() {
        assert!(parse_lockfile("").is_none());
        assert!(parse_lockfile("LeagueClient:1234:abc:secret:https").is_none());
        assert!(parse_lockfile("LeagueClient:1234:54999::https").is_none());
        assert!(parse_lockfile("too:few:parts").is_none());
    }

    #[test]
    fn candidates_include_env_standard_and_process_paths() {
        let mut env = BTreeMap::new();
        env.insert("LEAGUE_LOCKFILE".to_string(), r"C:\Custom\lockfile".to_string());
        env.insert("LOCALAPPDATA".to_string(), r"C:\Users\a\AppData\Local".to_string());
        let processes = vec![ProcessProbe {
            pid: Some(1),
            name: "LeagueClientUx.exe".to_string(),
            executable_path: Some(r"C:\Games\Riot Games\League of Legends\LeagueClientUx.exe".to_string()),
        }];
        let paths: Vec<String> = build_lockfile_candidates(&env, &processes)
            .into_iter()
            .map(|candidate| candidate.path.display().to_string())
            .collect();
        assert!(paths.iter().any(|path| path == r"C:\Custom\lockfile"));
        assert!(paths
            .iter()
            .any(|path| path.ends_with(r"Riot Games\League of Legends\lockfile")));
        assert!(paths.iter().any(|path| path == r"C:\Riot Games\League of Legends\lockfile"));
    }

    #[test]
    fn hot_poll_candidates_do_not_spawn_process_discovery_paths() {
        let paths: Vec<String> = hot_poll_lockfile_candidates()
            .into_iter()
            .map(|candidate| candidate.source)
            .collect();
        assert!(paths.iter().all(|source| !source.starts_with("process")));
    }

    #[test]
    fn redaction_removes_auth_payloads() {
        let redacted = redact_sensitive("request failed: Authorization: Basic abc123");
        assert!(redacted.contains("<redacted>"));
        assert!(!redacted.contains("abc123"));
    }
}
