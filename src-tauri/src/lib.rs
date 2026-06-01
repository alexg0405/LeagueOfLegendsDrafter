mod lcu;
mod overlay;

use overlay::{
    overlay_toggle_error, overlay_toggle_result, shortcut_labels, OverlayBounds,
    OverlayShortcutStatusResult, OverlayStatusResult, OverlayToggleResult, OVERLAY_INIT_SCRIPT,
    OVERLAY_LABEL, OVERLAY_ROUTE, OVERLAY_TITLE,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const PUBLIC_DATA_BASE_URL: &str = "https://nexusdraft.lol/data/";

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SettingsFile {
    capture_source_id: Option<String>,
}

#[derive(Default)]
struct DesktopState {
    latest_draft_update: Mutex<Option<Value>>,
    shortcut_status: Mutex<OverlayShortcutStatusResult>,
}

#[tauri::command]
fn recommend_picks_native(input_json: String) -> String {
    nexus_draft_core::recommend_picks_json(&input_json)
}

#[tauri::command]
fn score_champion_native(input_json: String) -> String {
    nexus_draft_core::score_champion_json(&input_json)
}

#[tauri::command]
fn build_draft_intel_native(input_json: String) -> String {
    nexus_draft_core::build_draft_intel_json(&input_json)
}

#[tauri::command]
fn build_item_matrix_plans_native(input_json: String) -> String {
    nexus_draft_core::build_item_matrix_plans_json(&input_json)
}

#[tauri::command]
fn list_capture_sources() -> Vec<Value> {
    Vec::new()
}

#[tauri::command]
fn settings_get_capture_source_id() -> Option<String> {
    read_settings()
        .capture_source_id
        .filter(|value| !value.trim().is_empty())
}

#[tauri::command]
fn settings_set_capture_source_id(id: Option<String>) -> Result<(), String> {
    let mut settings = read_settings();
    settings.capture_source_id = id.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });
    write_settings(&settings)
}

#[tauri::command]
async fn lcu_fetch_raw() -> lcu::LcuRawResult {
    lcu::fetch_lcu_raw().await
}

#[tauri::command]
async fn lcu_diagnostics() -> lcu::LcuDiagnosticResult {
    lcu::diagnostics().await
}

#[tauri::command]
async fn public_meta_get_live() -> Value {
    match fetch_live_public_data().await {
        Ok(value) => value,
        Err(error) => json!({ "ok": false, "error": error }),
    }
}

#[tauri::command]
fn riot_player_champion_pool(_request: Option<Value>) -> Value {
    json!({
        "ok": false,
        "code": "riot-unavailable",
        "error": "Riot mastery import is temporarily unavailable in the Rust desktop build."
    })
}

#[tauri::command]
fn training_get_effects() -> Value {
    load_trained_effects()
}

#[tauri::command]
fn draft_publish(
    app: AppHandle,
    state: tauri::State<'_, DesktopState>,
    payload: Value,
) -> Result<Value, String> {
    {
        let mut latest = state
            .latest_draft_update
            .lock()
            .map_err(|_| "Draft state lock was poisoned.".to_string())?;
        *latest = Some(payload.clone());
    }
    if let Some(window) = app.get_webview_window("overlay") {
        window
            .emit("draft:update", payload)
            .map_err(|error| error.to_string())?;
    }
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn overlay_ready(
    app: AppHandle,
    state: tauri::State<'_, DesktopState>,
) -> Result<Value, String> {
    let latest = state
        .latest_draft_update
        .lock()
        .map_err(|_| "Draft state lock was poisoned.".to_string())?
        .clone();
    if let (Some(window), Some(payload)) = (app.get_webview_window("overlay"), latest) {
        window
            .emit("draft:update", payload)
            .map_err(|error| error.to_string())?;
    }
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn overlay_set_engine_prefs(app: AppHandle, patch: Value) -> Result<Value, String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .emit("overlay:enginePrefs", patch)
            .map_err(|error| error.to_string())?;
    }
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn overlay_toggle(app: AppHandle) -> OverlayToggleResult {
    toggle_overlay_window(&app)
}

fn toggle_overlay_window(app: &AppHandle) -> OverlayToggleResult {
    let (window, created) = match app.get_webview_window(OVERLAY_LABEL) {
        Some(window) => (window, false),
        None => match WebviewWindowBuilder::new(
            app,
            OVERLAY_LABEL,
            WebviewUrl::App(OVERLAY_ROUTE.into()),
        )
        .initialization_script(OVERLAY_INIT_SCRIPT)
        .title(OVERLAY_TITLE)
        .decorations(false)
        .resizable(true)
        .inner_size(380.0, 640.0)
        .min_inner_size(320.0, 200.0)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()
        {
            Ok(window) => (window, true),
            Err(error) => return overlay_toggle_error(error.to_string()),
        },
    };

    let visible = window.is_visible().unwrap_or(false);
    if visible {
        if let Err(error) = window.hide() {
            return overlay_toggle_error(error.to_string());
        }
        overlay_toggle_result(false, false)
    } else {
        if let Err(error) = window.show() {
            return overlay_toggle_error(error.to_string());
        }
        window.set_focus().ok();
        overlay_toggle_result(true, created)
    }
}

#[tauri::command]
fn overlay_status(app: AppHandle) -> OverlayStatusResult {
    overlay_status_for_app(&app)
}

fn overlay_status_for_app(app: &AppHandle) -> OverlayStatusResult {
    let Some(window) = app.get_webview_window(OVERLAY_LABEL) else {
        return OverlayStatusResult {
            ok: true,
            exists: false,
            visible: false,
            focused: None,
            title: None,
            bounds: None,
            error: None,
        };
    };
    let bounds = window.outer_position().ok().zip(window.outer_size().ok()).map(
        |(position, size)| OverlayBounds {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
        },
    );
    OverlayStatusResult {
        ok: true,
        exists: true,
        visible: window.is_visible().unwrap_or(false),
        focused: window.is_focused().ok(),
        title: window.title().ok(),
        bounds,
        error: None,
    }
}

#[tauri::command]
fn overlay_shortcuts_status(
    state: tauri::State<'_, DesktopState>,
) -> OverlayShortcutStatusResult {
    state
        .shortcut_status
        .lock()
        .map(|status| status.clone())
        .unwrap_or_else(|_| OverlayShortcutStatusResult {
            ok: false,
            registered: Vec::new(),
            failed: shortcut_labels(),
            error: Some("Overlay shortcut state lock was poisoned.".to_string()),
        })
}

#[tauri::command]
fn overlay_set_projection_mode(app: AppHandle, open: bool) -> Result<Value, String> {
    if let Some(window) = app.get_webview_window("overlay") {
        if open {
            window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                width: 900.0,
                height: 640.0,
            }))
            .ok();
            window.center().ok();
            window.show().ok();
            window.set_focus().ok();
        } else {
            window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                width: 380.0,
                height: 640.0,
            }))
            .ok();
        }
    }
    Ok(json!({ "ok": true, "open": open }))
}

#[tauri::command]
fn app_close(app: AppHandle) -> Value {
    app.exit(0);
    json!({ "ok": true })
}

#[tauri::command]
fn app_minimize(window: tauri::Window) -> Result<Value, String> {
    window.minimize().map_err(|error| error.to_string())?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn app_update_check() -> Value {
    json!({
        "ok": true,
        "status": {
            "state": "not-available",
            "message": "Use the website download while the Rust updater is being wired.",
            "version": env!("CARGO_PKG_VERSION")
        }
    })
}

#[tauri::command]
fn app_update_download() -> Value {
    json!({
        "ok": false,
        "status": {
            "state": "error",
            "message": "Rust desktop auto-update is not wired yet. Download the latest portable from nexusdraft.lol."
        },
        "error": "Rust desktop auto-update is not wired yet."
    })
}

#[tauri::command]
fn app_update_quit_and_install() -> Value {
    json!({
        "ok": false,
        "status": {
            "state": "error",
            "message": "No Rust desktop update has been downloaded."
        },
        "error": "No Rust desktop update has been downloaded."
    })
}

fn settings_path() -> PathBuf {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join("nexusdraft")
        .join("settings.json")
}

fn read_settings() -> SettingsFile {
    let path = settings_path();
    let Ok(text) = fs::read_to_string(path) else {
        return SettingsFile::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn write_settings(settings: &SettingsFile) -> Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let text = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(path, text).map_err(|error| error.to_string())
}

fn public_data_base_url() -> String {
    let configured = std::env::var("NEXUS_PUBLIC_DATA_URL").unwrap_or_default();
    let value = if configured.trim().is_empty() {
        PUBLIC_DATA_BASE_URL.to_string()
    } else {
        configured.trim().to_string()
    };
    if value.ends_with('/') {
        value
    } else {
        format!("{value}/")
    }
}

async fn fetch_json(client: &reqwest::Client, url: &str) -> Result<Value, String> {
    let response = client
        .get(url)
        .header("user-agent", "NexusDraft/3.11 rust-desktop")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }
    response.json::<Value>().await.map_err(|error| error.to_string())
}

async fn fetch_live_public_data() -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())?;
    let base = public_data_base_url();
    let manifest_url = format!("{base}meta-manifest.json");
    let manifest = fetch_json(&client, &manifest_url).await?;
    let meta_path = manifest
        .get("metaUrl")
        .and_then(Value::as_str)
        .unwrap_or("publicMetaStatsSeed.json");
    let synergy_path = manifest
        .get("synergyUrl")
        .and_then(Value::as_str)
        .unwrap_or("publicSynergyStatsSeed.json");
    let meta_url = resolve_public_data_url(meta_path, &manifest_url)?;
    let synergy_url = resolve_public_data_url(synergy_path, &manifest_url)?;
    let meta_seed = fetch_json(&client, &meta_url).await?;
    let synergy_seed = fetch_json(&client, &synergy_url).await?;
    Ok(json!({
        "ok": true,
        "manifest": manifest,
        "metaSeed": meta_seed,
        "synergySeed": synergy_seed
    }))
}

fn resolve_public_data_url(path: &str, manifest_url: &str) -> Result<String, String> {
    if path.starts_with("http://") || path.starts_with("https://") {
        return Ok(path.to_string());
    }
    let base = manifest_url
        .rsplit_once('/')
        .map(|(prefix, _)| format!("{prefix}/"))
        .ok_or_else(|| "Invalid public data manifest URL".to_string())?;
    Ok(format!("{base}{path}"))
}

fn trained_effect_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(value) = std::env::var("LEAGUE_DRAFTER_TRAINED_EFFECTS") {
        if !value.trim().is_empty() {
            paths.push(PathBuf::from(value.trim()));
        }
    }
    if let Ok(current) = std::env::current_dir() {
        paths.push(current.join("training/runtime/effects_id.json"));
    }
    paths
}

fn load_trained_effects() -> Value {
    let paths = trained_effect_paths();
    let Some(path) = paths.iter().find(|path| path.exists()) else {
        return json!({
            "ok": false,
            "path": paths.first().map(|path| path.display().to_string()).unwrap_or_else(|| "training/runtime/effects_id.json".to_string()),
            "error": "effects_id.json not found"
        });
    };
    match fs::read_to_string(path) {
        Ok(text) => match serde_json::from_str::<Value>(&text) {
            Ok(raw) => json!({ "ok": true, "path": path.display().to_string(), "raw": raw }),
            Err(error) => json!({ "ok": false, "path": path.display().to_string(), "error": error.to_string() }),
        },
        Err(error) => json!({ "ok": false, "path": path.display().to_string(), "error": error.to_string() }),
    }
}

fn install_overlay_shortcuts(app: &AppHandle) {
    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::{
            Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
        };

        let shortcuts = vec![
            ("Insert", Shortcut::new(None::<Modifiers>, Code::Insert)),
            ("F9", Shortcut::new(None::<Modifiers>, Code::F9)),
            ("F10", Shortcut::new(None::<Modifiers>, Code::F10)),
        ];
        let shortcut_values: Vec<Shortcut> = shortcuts
            .iter()
            .map(|(_, shortcut)| shortcut.clone())
            .collect();
        let handler_shortcuts = shortcut_values.clone();
        let plugin = tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if event.state() == ShortcutState::Pressed
                    && handler_shortcuts.iter().any(|candidate| candidate == shortcut)
                {
                    let _ = toggle_overlay_window(app);
                }
            })
            .build();

        let mut registered = Vec::new();
        let mut failed = Vec::new();
        let mut error = None;

        if let Err(plugin_error) = app.plugin(plugin) {
            error = Some(plugin_error.to_string());
            failed = shortcut_labels();
        } else {
            for (label, shortcut) in shortcuts {
                match app.global_shortcut().register(shortcut) {
                    Ok(()) => registered.push(label.to_string()),
                    Err(_) => failed.push(label.to_string()),
                }
            }
        }

        if let Some(state) = app.try_state::<DesktopState>() {
            if let Ok(mut status) = state.shortcut_status.lock() {
                *status = OverlayShortcutStatusResult {
                    ok: error.is_none(),
                    registered,
                    failed,
                    error,
                };
            }
        }
    }
    #[cfg(not(desktop))]
    {
        if let Some(state) = app.try_state::<DesktopState>() {
            if let Ok(mut status) = state.shortcut_status.lock() {
                *status = OverlayShortcutStatusResult {
                    ok: false,
                    registered: Vec::new(),
                    failed: shortcut_labels(),
                    error: Some("Global shortcuts are only available on desktop builds.".to_string()),
                };
            }
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(DesktopState::default())
        .setup(|app| {
            install_overlay_shortcuts(app.handle());
            if std::env::var("NEXUS_DRAFT_SMOKE_OPEN_OVERLAY").ok().as_deref() == Some("1") {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(900));
                    let _ = toggle_overlay_window(&handle);
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            recommend_picks_native,
            score_champion_native,
            build_draft_intel_native,
            build_item_matrix_plans_native,
            list_capture_sources,
            settings_get_capture_source_id,
            settings_set_capture_source_id,
            lcu_fetch_raw,
            lcu_diagnostics,
            public_meta_get_live,
            riot_player_champion_pool,
            training_get_effects,
            draft_publish,
            overlay_ready,
            overlay_set_engine_prefs,
            overlay_toggle,
            overlay_status,
            overlay_shortcuts_status,
            overlay_set_projection_mode,
            app_close,
            app_minimize,
            app_update_check,
            app_update_download,
            app_update_quit_and_install
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nexus Draft Tauri app");
}
