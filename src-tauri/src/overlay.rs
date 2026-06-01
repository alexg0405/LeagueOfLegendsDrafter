use serde::Serialize;

pub const OVERLAY_LABEL: &str = "overlay";
pub const OVERLAY_TITLE: &str = "Nexus Draft Overlay";
pub const OVERLAY_ROUTE: &str = "index.html?window=overlay";
pub const OVERLAY_INIT_SCRIPT: &str = "window.location.hash = '#/overlay';";
pub const OVERLAY_SHORTCUTS: [&str; 3] = ["Insert", "F9", "F10"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayToggleResult {
    pub ok: bool,
    pub visible: bool,
    pub created: bool,
    pub route: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayStatusResult {
    pub ok: bool,
    pub exists: bool,
    pub visible: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focused: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bounds: Option<OverlayBounds>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OverlayShortcutStatusResult {
    pub ok: bool,
    pub registered: Vec<String>,
    pub failed: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn route_is_overlay(raw: &str) -> bool {
    let lowered = raw.to_ascii_lowercase();
    lowered.contains("window=overlay") || lowered.contains("#/overlay")
}

pub fn overlay_toggle_result(visible: bool, created: bool) -> OverlayToggleResult {
    OverlayToggleResult {
        ok: true,
        visible,
        created,
        route: "overlay",
        error: None,
    }
}

pub fn overlay_toggle_error(error: impl Into<String>) -> OverlayToggleResult {
    OverlayToggleResult {
        ok: false,
        visible: false,
        created: false,
        route: "overlay",
        error: Some(error.into()),
    }
}

pub fn shortcut_labels() -> Vec<String> {
    OVERLAY_SHORTCUTS
        .iter()
        .map(|shortcut| (*shortcut).to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn route_helper_accepts_hash_query_and_combined_forms() {
        assert!(route_is_overlay("index.html#/overlay"));
        assert!(route_is_overlay("index.html?window=overlay"));
        assert!(route_is_overlay("index.html?window=overlay#/overlay"));
        assert!(!route_is_overlay("index.html"));
    }

    #[test]
    fn shortcut_registration_target_is_fixed() {
        assert_eq!(shortcut_labels(), vec!["Insert", "F9", "F10"]);
    }
}
