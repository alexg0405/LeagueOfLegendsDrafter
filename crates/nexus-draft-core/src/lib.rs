use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;

const MATRIX_PLAN_LIMIT: usize = 40;

#[wasm_bindgen]
pub fn build_item_matrix_plans_json(input_json: &str) -> String {
    match serde_json::from_str::<RustItemMatrixInput>(input_json) {
        Ok(input) => {
            serde_json::to_string(&build_item_matrix_plans(&input)).unwrap_or_else(|err| {
                serde_json::json!({
                    "error": format!("nexus-draft-core failed: {err}")
                })
                .to_string()
            })
        }
        Err(err) => serde_json::json!({
            "error": format!("nexus-draft-core failed: {err}")
        })
        .to_string(),
    }
}

#[wasm_bindgen]
pub fn recommend_picks_json(input_json: &str) -> String {
    match serde_json::from_str::<RustRecommendInput>(input_json) {
        Ok(input) => serde_json::to_string(&recommend_picks(&input)).unwrap_or_else(|err| {
            serde_json::json!({
                "ok": false,
                "error": format!("nexus-draft-core recommend serialization failed: {err}")
            })
            .to_string()
        }),
        Err(err) => serde_json::json!({
            "ok": false,
            "error": format!("nexus-draft-core recommend input failed: {err}")
        })
        .to_string(),
    }
}

#[wasm_bindgen]
pub fn score_champion_json(input_json: &str) -> String {
    match serde_json::from_str::<RustChampionScoreInput>(input_json) {
        Ok(input) => serde_json::to_string(&score_champion(&input)).unwrap_or_else(|err| {
            serde_json::json!({
                "ok": false,
                "error": format!("nexus-draft-core score serialization failed: {err}")
            })
            .to_string()
        }),
        Err(err) => serde_json::json!({
            "ok": false,
            "error": format!("nexus-draft-core score input failed: {err}")
        })
        .to_string(),
    }
}

#[wasm_bindgen]
pub fn build_draft_intel_json(input_json: &str) -> String {
    match serde_json::from_str::<RustDraftIntelInput>(input_json) {
        Ok(input) => serde_json::to_string(&build_draft_intel(&input)).unwrap_or_else(|err| {
            serde_json::json!({
                "error": format!("nexus-draft-core draft intel serialization failed: {err}")
            })
            .to_string()
        }),
        Err(err) => serde_json::json!({
            "error": format!("nexus-draft-core draft intel input failed: {err}")
        })
        .to_string(),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RustItemMatrixInput {
    snapshot: Option<DraftSnapshot>,
    my_role: String,
    suggestions: Vec<PickSuggestion>,
    id_to_name: Vec<NameEntry>,
    champion_meta_by_id: Vec<ChampionMetaEntry>,
    enemy_role_inference: Vec<EnemyRoleInference>,
    item_catalog: Vec<ItemLite>,
    ugg_seed: UggSeed,
    champion_threat_overrides: Vec<ThreatOverrideRow>,
    #[serde(default)]
    focus_champion_id: Option<i32>,
    #[serde(default)]
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RustDraftIntelInput {
    snapshot: Option<DraftSnapshot>,
    my_role: String,
    suggestions: Vec<PickSuggestion>,
    id_to_name: Vec<NameEntry>,
    champion_meta_by_id: Vec<ChampionMetaEntry>,
    #[serde(default)]
    enemy_role_inference: Vec<EnemyRoleInference>,
    #[serde(default)]
    item_catalog: Vec<ItemLite>,
    #[serde(default)]
    ugg_seed: UggSeed,
    champion_threat_overrides: Vec<ThreatOverrideRow>,
    #[serde(default)]
    public_base_stats: Vec<PublicBaseStatEntry>,
    #[serde(default)]
    patch_label: Option<String>,
    #[serde(default)]
    data_dragon_version: Option<String>,
    #[serde(default = "default_include_item_plans")]
    include_item_plans: bool,
}

fn default_include_item_plans() -> bool {
    true
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RustRecommendInput {
    snapshot: Option<DraftSnapshot>,
    my_role: String,
    #[serde(default = "default_recommend_max_results")]
    max_results: usize,
    #[serde(default)]
    #[allow(dead_code)]
    data_dragon_version: Option<String>,
    #[serde(default)]
    monte_carlo_samples: i32,
    #[serde(default = "default_recommend_seed")]
    rng_seed: u32,
    #[serde(default = "default_sort_by")]
    sort_by: String,
    #[serde(default = "default_delta_list_mode")]
    delta_list_mode: String,
    #[serde(default)]
    id_to_name: Vec<NameEntry>,
    #[serde(default)]
    champion_meta_by_id: Vec<ChampionMetaEntry>,
    #[serde(default)]
    comfort_by_champion_id: Vec<NumberEntry>,
    #[serde(default)]
    candidate_champion_ids: Option<Vec<i32>>,
    #[serde(default)]
    role_champion_pools: Vec<RoleChampionPoolEntry>,
    #[serde(default)]
    public_candidate_ids: Vec<RoleChampionPoolEntry>,
    #[serde(default)]
    public_base_rates: Vec<PublicBaseRateEntry>,
    #[serde(default)]
    public_lane_rates: Vec<PublicLaneRateEntry>,
    #[serde(default)]
    matchup_bonuses: Vec<MatchupBonusEntry>,
    #[serde(default)]
    ally_synergy_bonuses: Vec<AllySynergyEntry>,
    #[serde(default)]
    trained_base_rates: Vec<TrainedBaseEntry>,
    #[serde(default)]
    trained_lane_rates: Vec<TrainedLaneEntry>,
    #[serde(default)]
    trained_synergy_deltas: Vec<TrainedSynergyEntry>,
    #[serde(default)]
    has_trained_data: bool,
    #[serde(default)]
    enemy_role_inference: Vec<RustRecommendEnemyInference>,
    #[serde(default)]
    champion_threat_overrides: Vec<ThreatOverrideRow>,
    #[serde(default)]
    hard_counters_by_name: Vec<HardCounterEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RustChampionScoreInput {
    #[serde(flatten)]
    recommend: RustRecommendInput,
    champion_id: i32,
}

fn default_recommend_max_results() -> usize {
    12
}

fn default_recommend_seed() -> u32 {
    0x9e37_79b1
}

fn default_sort_by() -> String {
    "score".to_string()
}

fn default_delta_list_mode() -> String {
    "best".to_string()
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NumberEntry {
    id: i32,
    value: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RoleChampionPoolEntry {
    role: String,
    champion_ids: Vec<i32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublicBaseRateEntry {
    role: String,
    champion_id: i32,
    rate: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublicBaseStatEntry {
    role: String,
    champion_id: i32,
    win_rate: f64,
    #[serde(default)]
    pick_rate: Option<f64>,
    #[serde(default)]
    ban_rate: Option<f64>,
    games: f64,
    source_avg_win_rate: f64,
    #[serde(default)]
    candidate: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublicLaneRateEntry {
    role: String,
    candidate_id: i32,
    enemy_id: i32,
    rate: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MatchupBonusEntry {
    candidate_id: i32,
    enemy_id: i32,
    bonus: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AllySynergyEntry {
    left_id: i32,
    right_id: i32,
    bonus: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrainedBaseEntry {
    role: String,
    champion_id: i32,
    logit: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrainedLaneEntry {
    role: String,
    ally_id: i32,
    enemy_id: i32,
    logit: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrainedSynergyEntry {
    ally_role: String,
    partner_role: String,
    ally_id: i32,
    partner_id: i32,
    delta: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RustRecommendEnemyInference {
    enemy_index: usize,
    role_probabilities: HashMap<String, f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HardCounterEntry {
    champion_key: String,
    counter_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RustRecommendOutput {
    ok: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    rows: Vec<PickSuggestionOut>,
    #[serde(skip_serializing_if = "Option::is_none")]
    patch_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    unsupported_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RustChampionScoreOutput {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    score: Option<ComponentScores>,
    #[serde(skip_serializing_if = "Option::is_none")]
    patch_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PickSuggestionOut {
    champion_id: i32,
    score: f64,
    #[serde(default)]
    reasons: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_locked_pick: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    base_win_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    context_win_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    win_rate_delta: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    est_win: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    lookahead_ev: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    lookahead_risk: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NameEntry {
    id: i32,
    name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChampionMetaEntry {
    id: i32,
    meta: ChampionMeta,
}

#[derive(Debug, Clone, Deserialize)]
struct ChampionMeta {
    #[serde(default)]
    tags: Vec<String>,
    #[allow(dead_code)]
    #[serde(default)]
    partype: String,
    passive: Option<ChampionSpellLite>,
    spells: Option<Vec<ChampionSpellLite>>,
}

#[derive(Debug, Clone, Deserialize)]
struct ChampionSpellLite {
    #[serde(default)]
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    tooltip: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DraftSnapshot {
    ally: Vec<SlotPick>,
    enemy: Vec<SlotPick>,
    #[allow(dead_code)]
    my_team: Option<String>,
    #[allow(dead_code)]
    my_role: Option<String>,
    #[allow(dead_code)]
    local_player_cell_id: Option<i32>,
    #[allow(dead_code)]
    bans: Option<Vec<i32>>,
    #[allow(dead_code)]
    my_pick_order: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SlotPick {
    role: String,
    champion_id: Option<i32>,
    champion_name: Option<String>,
    #[allow(dead_code)]
    cell_id: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PickSuggestion {
    champion_id: i32,
    champion_name: String,
    #[allow(dead_code)]
    score: f64,
    #[serde(default)]
    reasons: Vec<String>,
    runes: Option<RuneLoadoutHint>,
    build_profile: Option<ChampionBuildProfile>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuneLoadoutHint {
    primary_tree: String,
    keystone: String,
    secondary: String,
    note: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChampionBuildProfile {
    damage: String,
    archetype: String,
    build_hint: String,
    item_hint: Option<String>,
    tags_line: String,
    #[allow(dead_code)]
    partype: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EnemyRoleInference {
    enemy_index: usize,
    champion_id: i32,
    #[allow(dead_code)]
    assigned_role: String,
    #[allow(dead_code)]
    inferred_role: String,
    #[allow(dead_code)]
    confidence: f64,
    #[allow(dead_code)]
    confidence_label: String,
    role_probabilities: HashMap<String, f64>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
struct Gold {
    #[serde(default)]
    base: f64,
    #[serde(default)]
    total: f64,
    #[serde(default)]
    sell: f64,
    #[serde(default)]
    purchasable: bool,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItemLite {
    id: i32,
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    plaintext: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    stats: HashMap<String, f64>,
    gold: Gold,
    from: Option<Vec<String>>,
    into: Option<Vec<String>>,
    #[allow(dead_code)]
    #[serde(default)]
    maps: HashMap<String, bool>,
    depth: Option<i32>,
    required_champion: Option<String>,
    consumed: Option<bool>,
    #[allow(dead_code)]
    consume_on_full: Option<bool>,
}

#[derive(Debug, Default, Deserialize)]
struct UggSeed {
    #[allow(dead_code)]
    patch: Option<String>,
    #[allow(dead_code)]
    source: Option<String>,
    #[serde(default)]
    builds: Vec<UggSeedRow>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UggSeedRow {
    champion_id: i32,
    role: String,
    #[allow(dead_code)]
    source_url: String,
    starting: Option<Vec<i32>>,
    boots: Option<Vec<i32>>,
    core: Option<Vec<i32>>,
    #[serde(rename = "final")]
    final_items: Option<Vec<i32>>,
    #[allow(dead_code)]
    win_rate: Option<f64>,
    #[allow(dead_code)]
    matches: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
struct ThreatOverrideRow {
    key: String,
    threat: String,
    classes: Vec<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
struct SlotRead {
    slot: SlotPick,
    champion_id: i32,
    role: String,
    name: String,
    threat: String,
    classes: HashSet<String>,
}

#[derive(Debug, Clone, Default)]
struct TeamRead {
    ad: f64,
    ap: f64,
    hybrid: f64,
    utility: f64,
    frontline: f64,
    engage: f64,
    poke: f64,
    pick: f64,
    dive: f64,
    scaling: f64,
    sustain: f64,
    marksmen: f64,
    mages: f64,
    assassins: f64,
    supports: f64,
    tanks: f64,
    fighters: f64,
    slots: Vec<SlotRead>,
}

#[derive(Debug, Clone)]
struct ItemProfile {
    phase: String,
    tags: Vec<String>,
}

#[derive(Debug, Clone, Default)]
struct KitProfile {
    hard_cc: bool,
    shield: bool,
    heal: bool,
    mobility: bool,
    poke: bool,
    burst: bool,
    sustain: bool,
    execute: bool,
}

#[derive(Debug, Clone)]
struct EnemyDetail {
    champion_id: i32,
    name: String,
    threat: String,
    classes: Vec<String>,
    hard_cc: bool,
    healing: bool,
    shielding: bool,
    mobility: bool,
    burst: bool,
    poke: bool,
    default_build_tags: Vec<String>,
}

#[derive(Debug, Clone)]
struct DefaultBuild {
    starting: Vec<DraftItemRef>,
    boots: Vec<DraftItemRef>,
    core: Vec<DraftItemRef>,
    final_items: Vec<DraftItemRef>,
    default_item_ids: Vec<i32>,
}

#[derive(Debug, Clone)]
struct AdaptiveItemContext<'a> {
    champion_name: &'a str,
    role: &'a str,
    build_profile: Option<&'a ChampionBuildProfile>,
    ally: AllyItemSignals,
    enemy: EnemyItemSignals,
    enemy_details: Vec<EnemyDetail>,
    default_build: Option<DefaultBuild>,
    lane_threat: Option<String>,
    fallback: DraftItemPlan,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Default)]
struct AllyItemSignals {
    magic: f64,
    physical: f64,
    frontline: f64,
    engage: f64,
    scaling: f64,
    slots: usize,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Default)]
struct EnemyItemSignals {
    magic: f64,
    physical: f64,
    frontline: f64,
    tanks: f64,
    assassins: f64,
    supports: f64,
    dive: f64,
    poke: f64,
    pick: f64,
    sustain: f64,
    marksmen: f64,
    hard_cc: f64,
    healing: f64,
    shielding: f64,
    mobility: f64,
    burst: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DraftMatchupPlan {
    champion_id: i32,
    champion_name: String,
    lane_opponent_id: Option<i32>,
    lane_opponent_name: Option<String>,
    summoner_spells: String,
    starting_item: String,
    first_recall: String,
    rune_export: String,
    game_plan: String,
    item_plan: Option<DraftItemPlan>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DraftIntelOut {
    ban_recommendations: Vec<BanRecommendation>,
    comp_identity: CompIdentity,
    matchup_plans: Vec<DraftMatchupPlan>,
    #[serde(skip_serializing_if = "Option::is_none")]
    item_matrix_plans: Option<Vec<DraftMatchupPlan>>,
    pick_comparison: Vec<PickComparison>,
    loading_brief: Vec<String>,
    confidence_notes: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BanRecommendation {
    champion_id: i32,
    champion_name: String,
    role: String,
    score: f64,
    reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompIdentity {
    ally: Vec<String>,
    enemy: Vec<String>,
    missing: Vec<String>,
    warnings: Vec<String>,
    win_condition: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PickComparison {
    champion_id: i32,
    champion_name: String,
    score: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    est_win: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    delta: Option<f64>,
    summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DraftItemPlan {
    core: String,
    boots: String,
    defensive: String,
    situational: Vec<String>,
    notes: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    default_build_source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    default_item_ids: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    starting: Option<Vec<DraftItemRef>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    first_recall: Option<Vec<DraftItemRef>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    boot_choice: Option<Option<DraftItemRef>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    boot_alternatives: Option<Vec<DraftItemRef>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    core_build: Option<Vec<DraftItemRef>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    final_build: Option<Vec<DraftItemRef>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    situational_items: Option<Vec<DraftItemRef>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    matrix_rows: Option<Vec<DraftItemMatrixRow>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    threat_summary: Option<Vec<DraftItemThreat>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DraftItemRef {
    item_id: i32,
    name: String,
    reason: String,
    score: f64,
    tags: Vec<String>,
    phase: String,
    cost: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DraftItemEnemyTarget {
    champion_id: i32,
    champion_name: String,
    reason: String,
    source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DraftItemMatrixRow {
    item_id: i32,
    name: String,
    reason: String,
    score: f64,
    tags: Vec<String>,
    phase: String,
    cost: f64,
    good_into: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    good_against: Vec<String>,
    avoid_when: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    enemy_targets: Vec<DraftItemEnemyTarget>,
}

#[derive(Debug, Clone, Serialize)]
struct DraftItemThreat {
    label: String,
    tone: String,
    reason: String,
}

fn build_item_matrix_plans(input: &RustItemMatrixInput) -> Vec<DraftMatchupPlan> {
    if input.snapshot.is_none() && input.suggestions.is_empty() {
        return Vec::new();
    }
    let id_to_name: HashMap<i32, String> = input
        .id_to_name
        .iter()
        .map(|row| (row.id, row.name.clone()))
        .collect();
    let meta_by_id: HashMap<i32, ChampionMeta> = input
        .champion_meta_by_id
        .iter()
        .map(|row| (row.id, row.meta.clone()))
        .collect();
    let overrides: HashMap<String, ThreatOverrideRow> = input
        .champion_threat_overrides
        .iter()
        .map(|row| (row.key.clone(), row.clone()))
        .collect();
    let ally_slots = input
        .snapshot
        .as_ref()
        .map(|s| s.ally.as_slice())
        .unwrap_or(&[]);
    let enemy_slots = input
        .snapshot
        .as_ref()
        .map(|s| s.enemy.as_slice())
        .unwrap_or(&[]);
    let ally = analyze_team(ally_slots, &id_to_name, &meta_by_id, &overrides);
    let enemy = analyze_team(enemy_slots, &id_to_name, &meta_by_id, &overrides);
    let mut suggestions = input.suggestions.clone();
    if let Some(focus_id) = input.focus_champion_id {
        suggestions.sort_by_key(|row| if row.champion_id == focus_id { 0 } else { 1 });
    }
    let limit = input.limit.unwrap_or(MATRIX_PLAN_LIMIT).clamp(1, MATRIX_PLAN_LIMIT);
    matchup_plans(
        &suggestions,
        input.snapshot.as_ref(),
        &input.my_role,
        &ally,
        &enemy,
        &id_to_name,
        &meta_by_id,
        &input.enemy_role_inference,
        &input.item_catalog,
        &input.ugg_seed,
        &overrides,
        true,
        limit,
    )
}

fn build_draft_intel(input: &RustDraftIntelInput) -> Option<DraftIntelOut> {
    if input.snapshot.is_none() && input.suggestions.is_empty() {
        return None;
    }
    let id_to_name: HashMap<i32, String> = input
        .id_to_name
        .iter()
        .map(|row| (row.id, row.name.clone()))
        .collect();
    let meta_by_id: HashMap<i32, ChampionMeta> = input
        .champion_meta_by_id
        .iter()
        .map(|row| (row.id, row.meta.clone()))
        .collect();
    let overrides: HashMap<String, ThreatOverrideRow> = input
        .champion_threat_overrides
        .iter()
        .map(|row| (row.key.clone(), row.clone()))
        .collect();
    let ally_slots = input
        .snapshot
        .as_ref()
        .map(|s| s.ally.as_slice())
        .unwrap_or(&[]);
    let enemy_slots = input
        .snapshot
        .as_ref()
        .map(|s| s.enemy.as_slice())
        .unwrap_or(&[]);
    let ally = analyze_team(ally_slots, &id_to_name, &meta_by_id, &overrides);
    let enemy = analyze_team(enemy_slots, &id_to_name, &meta_by_id, &overrides);
    let (missing, base_warnings) = ally_missing_and_warnings(&ally, &enemy, &input.my_role);
    let mut warnings = base_warnings;
    warnings.extend(draft_setup_notes(
        input.snapshot.as_ref(),
        &input.my_role,
        &enemy,
        &id_to_name,
        &overrides,
    ));
    warnings.truncate(6);
    let comp_identity = CompIdentity {
        ally: identity_labels(&ally, "ally"),
        enemy: identity_labels(&enemy, "enemy"),
        missing,
        warnings,
        win_condition: win_condition(&ally, &enemy, &input.my_role),
    };
    let plans = matchup_plans(
        &input.suggestions,
        input.snapshot.as_ref(),
        &input.my_role,
        &ally,
        &enemy,
        &id_to_name,
        &meta_by_id,
        &input.enemy_role_inference,
        &input.item_catalog,
        &input.ugg_seed,
        &overrides,
        input.include_item_plans,
        12,
    );
    let loading_brief = loading_brief(input.snapshot.as_ref(), &ally, &comp_identity, &plans);
    let confidence_notes = confidence_notes(
        input.snapshot.as_ref(),
        &input.enemy_role_inference,
        input.patch_label.as_deref(),
        input.data_dragon_version.as_deref(),
    );
    Some(DraftIntelOut {
        ban_recommendations: ban_recommendations(
            input.snapshot.as_ref(),
            &input.my_role,
            &id_to_name,
            &input.enemy_role_inference,
            &input.public_base_stats,
        ),
        comp_identity,
        matchup_plans: plans,
        item_matrix_plans: None,
        pick_comparison: Vec::new(),
        loading_brief,
        confidence_notes,
    })
}

fn role_label(role: &str) -> &'static str {
    match normalize_role_key(role).unwrap_or("unknown") {
        "top" => "Top",
        "jungle" => "Jungle",
        "middle" => "Mid",
        "bottom" => "Bot",
        "support" => "Support",
        _ => "Role",
    }
}

fn role_key_or_original<'a>(role: &'a str) -> &'a str {
    match normalize_role_key(role) {
        Some(key) => key,
        None => role,
    }
}

fn identity_labels(team: &TeamRead, side: &str) -> Vec<String> {
    let mut labels = Vec::new();
    if team.frontline >= 2.0 && team.scaling >= 2.0 {
        labels.push("front-to-back".to_string());
    }
    if team.poke >= 3.0 {
        labels.push("poke/siege".to_string());
    }
    if team.dive >= 3.0 {
        labels.push("dive".to_string());
    }
    if team.pick >= 3.0 {
        labels.push("pick".to_string());
    }
    if team.scaling >= 3.0 {
        labels.push("scaling".to_string());
    }
    if team.assassins >= 2.0 {
        labels.push("burst".to_string());
    }
    if team.supports >= 2.0 || (side == "ally" && team.sustain >= 2.0) {
        labels.push("protect/counter-engage".to_string());
    }
    if labels.is_empty() && !team.slots.is_empty() {
        labels.push("balanced".to_string());
    }
    labels.truncate(4);
    labels
}

fn ally_missing_and_warnings(ally: &TeamRead, enemy: &TeamRead, my_role: &str) -> (Vec<String>, Vec<String>) {
    let mut missing = Vec::new();
    let mut warnings = Vec::new();
    let magic = ally.ap + ally.hybrid * 0.5;
    let physical = ally.ad + ally.hybrid * 0.5;
    if ally.slots.len() >= 3 && magic < 1.0 {
        missing.push("magic damage".to_string());
    }
    if ally.slots.len() >= 3 && physical < 1.0 {
        missing.push("physical DPS".to_string());
    }
    if ally.slots.len() >= 3 && ally.frontline < 1.0 {
        missing.push("frontline".to_string());
    }
    if ally.slots.len() >= 3 && ally.engage < 1.0 {
        missing.push("reliable engage".to_string());
    }
    if enemy.assassins >= 2.0 {
        warnings.push("Enemy has multiple backline threats; value peel, Exhaust, Stopwatch, or defensive boots.".to_string());
    }
    if enemy.poke >= 3.0 {
        warnings.push("Enemy poke is high; avoid slow drafts with no engage or sustain.".to_string());
    }
    if enemy.frontline >= 3.0 {
        warnings.push("Enemy frontline is heavy; prioritize sustained DPS and anti-tank patterns.".to_string());
    }
    if enemy.ap + enemy.hybrid * 0.5 >= 4.0 {
        warnings.push("Enemy damage leans AP; early MR and Cleanse/Mercs can matter.".to_string());
    }
    if enemy.ad + enemy.hybrid * 0.5 >= 4.0 {
        warnings.push("Enemy damage leans AD; armor and anti-burst setup gain value.".to_string());
    }
    let role = role_key_or_original(my_role);
    if (role == "bottom" || role == "middle") && enemy.pick >= 3.0 {
        warnings.push("High pick threat; track fog before sidelaning and respect support/jungle roam timers.".to_string());
    }
    warnings.truncate(5);
    (missing, warnings)
}

fn win_condition(ally: &TeamRead, enemy: &TeamRead, my_role: &str) -> String {
    let ally_labels = identity_labels(ally, "ally");
    if ally.slots.is_empty() {
        return format!(
            "Draft for {} agency: pick comfort, avoid one-damage comps, and keep bans on high-playrate counters.",
            role_label(my_role)
        );
    }
    if ally_labels.iter().any(|label| label == "front-to-back") {
        return "Play front-to-back: protect carries, fight around objective setup, and punish divers after cooldowns are spent.".to_string();
    }
    if ally_labels.iter().any(|label| label == "poke/siege") {
        return "Play for vision first, chip before objectives, then disengage unless the poke creates a numbers edge.".to_string();
    }
    if ally_labels.iter().any(|label| label == "dive") {
        return "Play to stack waves, force flanks, and commit together; split engages make the comp much weaker.".to_string();
    }
    if ally_labels.iter().any(|label| label == "pick") {
        return "Play through fog and first move; convert catches into dragons, Herald, or turret tempo.".to_string();
    }
    if enemy.scaling >= 3.0 && ally.dive >= 2.0 {
        return "Enemy scales well, so use early skirmishes and side pressure before their carries reach two items.".to_string();
    }
    "Keep the comp flexible: cover damage mix, draft at least one reliable engage tool, and play around your strongest lane.".to_string()
}

fn unavailable_champion_ids(snapshot: Option<&DraftSnapshot>) -> HashSet<i32> {
    let mut out = HashSet::new();
    let Some(snapshot) = snapshot else {
        return out;
    };
    for slot in snapshot.ally.iter().chain(snapshot.enemy.iter()) {
        if let Some(id) = slot.champion_id {
            if id > 0 {
                out.insert(id);
            }
        }
    }
    if let Some(bans) = &snapshot.bans {
        for id in bans {
            if *id > 0 {
                out.insert(*id);
            }
        }
    }
    out
}

fn role_weights(my_role: &str, enemy_role_inference: &[EnemyRoleInference]) -> HashMap<String, f64> {
    let mut weights: HashMap<String, f64> = ROLE_KEYS
        .iter()
        .map(|role| (role.to_string(), 0.55))
        .collect();
    if let Some(role) = normalize_role_key(my_role) {
        *weights.entry(role.to_string()).or_insert(0.55) += 0.45;
    }
    for row in enemy_role_inference {
        let role = normalize_role_key(&row.inferred_role).unwrap_or(&row.inferred_role);
        if ROLE_KEYS.iter().any(|key| key == &role) {
            *weights.entry(role.to_string()).or_insert(0.55) += 0.2 * row.confidence;
        }
    }
    weights
}

fn ban_score(row: &PublicBaseStatEntry, weight: f64) -> f64 {
    let wr_lift = (row.win_rate - row.source_avg_win_rate) * 120.0;
    let pick = row.pick_rate.unwrap_or(0.0) * 36.0;
    let ban = row.ban_rate.unwrap_or(0.0) * 24.0;
    let games = row.games.max(10.0).log10() * 0.9;
    let candidate = if row.candidate { 0.8 } else { 0.0 };
    ((45.0 + wr_lift + pick + ban + games + candidate) * weight * 10.0).round() / 10.0
}

fn ban_recommendations(
    snapshot: Option<&DraftSnapshot>,
    my_role: &str,
    id_to_name: &HashMap<i32, String>,
    enemy_role_inference: &[EnemyRoleInference],
    rows: &[PublicBaseStatEntry],
) -> Vec<BanRecommendation> {
    let unavailable = unavailable_champion_ids(snapshot);
    let weights = role_weights(my_role, enemy_role_inference);
    let mut best: HashMap<i32, BanRecommendation> = HashMap::new();
    for row in rows {
        let Some(role) = normalize_role_key(&row.role) else {
            continue;
        };
        if unavailable.contains(&row.champion_id) {
            continue;
        }
        let weight = *weights.get(role).unwrap_or(&0.55);
        let score = ban_score(row, weight);
        let mut parts = vec![format!(
            "{} {:.1}% WR",
            role_label(role),
            row.win_rate * 100.0
        )];
        if let Some(pick_rate) = row.pick_rate {
            parts.push(format!("{:.1}% pick", pick_rate * 100.0));
        }
        if let Some(ban_rate) = row.ban_rate {
            parts.push(format!("{:.1}% ban", ban_rate * 100.0));
        }
        let rec = BanRecommendation {
            champion_id: row.champion_id,
            champion_name: champion_name(row.champion_id, id_to_name),
            role: role.to_string(),
            score,
            reason: parts.join(" / "),
        };
        match best.get(&row.champion_id) {
            Some(current) if current.score >= rec.score => {}
            _ => {
                best.insert(row.champion_id, rec);
            }
        }
    }
    let mut out: Vec<BanRecommendation> = best.into_values().collect();
    out.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(Ordering::Equal)
            .then_with(|| a.champion_name.cmp(&b.champion_name))
    });
    out.truncate(5);
    out
}

fn draft_setup_notes(
    snapshot: Option<&DraftSnapshot>,
    my_role: &str,
    enemy: &TeamRead,
    id_to_name: &HashMap<i32, String>,
    overrides: &HashMap<String, ThreatOverrideRow>,
) -> Vec<String> {
    let mut notes = Vec::new();
    let Some(snapshot) = snapshot else {
        return notes;
    };
    let role = role_key_or_original(my_role);
    if role == "bottom" || role == "support" {
        let partner_role = if role == "bottom" { "support" } else { "bottom" };
        if let Some(partner) = snapshot
            .ally
            .iter()
            .find(|slot| role_key_or_original(&slot.role) == partner_role && slot.champion_id.unwrap_or(0) > 0)
        {
            let id = partner.champion_id.unwrap_or(0);
            let name = partner
                .champion_name
                .clone()
                .unwrap_or_else(|| champion_name(id, id_to_name));
            let classes = classes_for_name(&name, overrides);
            if classes.iter().any(|class| class == "tank") {
                notes.push(format!("Bot pairing: {name} gives engage; contest level 2 and crash waves before roaming."));
            } else if classes.iter().any(|class| class == "support") {
                notes.push(format!("Bot pairing: {name} suggests peel/sustain; trade around shields and keep river vision early."));
            } else {
                notes.push(format!("Bot pairing: {name} is locked; sync wave goals before choosing an aggressive summoner."));
            }
        } else {
            notes.push("Bot pairing: partner not locked yet; prefer flexible setup until the 2v2 is known.".to_string());
        }
    }
    if role == "jungle" {
        let volatile_lane = snapshot
            .ally
            .iter()
            .find(|slot| role_key_or_original(&slot.role) != "jungle" && slot.champion_id.unwrap_or(0) > 0)
            .map(|slot| role_key_or_original(&slot.role).to_string())
            .unwrap_or_else(|| "middle".to_string());
        notes.push(format!("Jungle setup: path with a purpose toward {volatile_lane} unless enemy jungle reveals a punishable start."));
    } else if let Some(enemy_jungle) = snapshot
        .enemy
        .iter()
        .find(|slot| role_key_or_original(&slot.role) == "jungle" && slot.champion_id.unwrap_or(0) > 0)
    {
        let id = enemy_jungle.champion_id.unwrap_or(0);
        let name = enemy_jungle
            .champion_name
            .clone()
            .unwrap_or_else(|| champion_name(id, id_to_name));
        notes.push(format!("Jungle tracking: enemy {name} is shown; ward for their first gank side before trading hard."));
    } else if enemy.dive >= 3.0 {
        notes.push("Jungle tracking: enemy comp wants dives; thin waves before cannon crashes and ping missing support/jungle.".to_string());
    }
    notes
}

fn loading_brief(
    _snapshot: Option<&DraftSnapshot>,
    ally: &TeamRead,
    comp: &CompIdentity,
    plans: &[DraftMatchupPlan],
) -> Vec<String> {
    let mut lines = vec![format!("Win condition: {}", comp.win_condition)];
    if let Some(plan) = plans.first() {
        let lane = plan
            .lane_opponent_name
            .as_ref()
            .map(|name| format!(" vs {name}"))
            .unwrap_or_default();
        lines.push(format!(
            "Top pick plan: {}{} - {}; {}",
            plan.champion_name, lane, plan.summoner_spells, plan.starting_item
        ));
        if let Some(item_plan) = &plan.item_plan {
            if let Some(angle) = item_plan.situational.first().or(Some(&item_plan.boots)) {
                lines.push(format!("Item angle: {angle}"));
            }
        }
    }
    if let Some(warn) = comp.warnings.first() {
        lines.push(format!("Danger: {warn}"));
    }
    if ally.slots.len() >= 3 && !comp.missing.is_empty() {
        lines.push(format!("Draft gap: missing {}.", comp.missing.join(", ")));
    }
    lines.truncate(5);
    lines
}

fn confidence_notes(
    snapshot: Option<&DraftSnapshot>,
    enemy_role_inference: &[EnemyRoleInference],
    patch_label: Option<&str>,
    data_dragon_version: Option<&str>,
) -> Vec<String> {
    let mut notes = Vec::new();
    notes.push(format!(
        "Patch-aware public stats plus {}.",
        patch_label.unwrap_or("engine-v1")
    ));
    notes.push(match data_dragon_version {
        Some(version) => format!("Champion metadata from Riot Data Dragon {version}."),
        None => "Champion metadata is bundled until Riot Data Dragon loads.".to_string(),
    });
    let inferred = enemy_role_inference
        .iter()
        .filter(|row| row.confidence_label != "uncertain")
        .count();
    let locked = snapshot
        .map(|s| {
            s.enemy
                .iter()
                .filter(|slot| slot.champion_id.unwrap_or(0) > 0)
                .count()
        })
        .unwrap_or(0);
    notes.push(if locked > 0 {
        format!("Enemy role inference: {inferred}/{locked} locked enemies have likely or flex role reads.")
    } else {
        "Enemy role inference will activate when enemy champions are locked or hovered.".to_string()
    });
    notes
}

const ROLE_KEYS: [&str; 5] = ["top", "jungle", "middle", "bottom", "support"];

#[derive(Debug, Clone)]
struct RecommendTables {
    id_to_name: HashMap<i32, String>,
    meta_by_id: HashMap<i32, ChampionMeta>,
    comfort_by_id: HashMap<i32, f64>,
    role_pools: HashMap<String, Vec<i32>>,
    public_candidates: HashMap<String, Vec<i32>>,
    public_base_rates: HashMap<(String, i32), f64>,
    public_lane_rates: HashMap<(String, i32, i32), f64>,
    matchup_bonuses: HashMap<(i32, i32), f64>,
    ally_synergy: HashMap<(i32, i32), f64>,
    trained_base: HashMap<(String, i32), f64>,
    trained_lane: HashMap<(String, i32, i32), f64>,
    trained_synergy: HashMap<(String, String, i32, i32), f64>,
    enemy_posteriors: HashMap<usize, HashMap<String, f64>>,
    overrides: HashMap<String, ThreatOverrideRow>,
    hard_counters: HashMap<String, Vec<String>>,
}

#[derive(Debug, Clone)]
struct RecommendState {
    snapshot: DraftSnapshot,
    my_role: String,
    bans: Vec<i32>,
    unavailable: HashSet<i32>,
    my_pick_order: Option<i32>,
    locked_champion_picks: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ComponentScores {
    base: f64,
    ally: f64,
    enemy: f64,
    #[allow(dead_code)]
    comfort: f64,
    comp: f64,
    ally_adj: f64,
    enemy_adj: f64,
    comp_adj: f64,
    comfort_adj: f64,
    blind_p: f64,
    context_combined: f64,
    combined: f64,
}

#[derive(Debug, Clone)]
struct RecommendRowWork {
    champion_id: i32,
    comp: ComponentScores,
    ev: Option<f64>,
    risk: Option<f64>,
    mc_weight: Option<f64>,
}

fn recommend_picks(input: &RustRecommendInput) -> RustRecommendOutput {
    let Some(snapshot) = input.snapshot.clone() else {
        return RustRecommendOutput {
            ok: true,
            rows: Vec::new(),
            patch_label: Some("engine-v1".to_string()),
            unsupported_reason: None,
            error: None,
        };
    };
    let role = normalize_role_key(&input.my_role);
    if role.is_none() {
        return RustRecommendOutput {
            ok: true,
            rows: Vec::new(),
            patch_label: Some("engine-v1".to_string()),
            unsupported_reason: None,
            error: None,
        };
    }
    let state = recommend_state(snapshot, &input.my_role);
    let tables = recommend_tables(input);
    let rows = recommend_rows(input, &state, &tables);
    let n_mc = recommend_mc_count(input.monte_carlo_samples);
    RustRecommendOutput {
        ok: true,
        rows,
        patch_label: Some(recommend_patch_label(n_mc, input.has_trained_data)),
        unsupported_reason: None,
        error: None,
    }
}

fn score_champion(input: &RustChampionScoreInput) -> RustChampionScoreOutput {
    let Some(snapshot) = input.recommend.snapshot.clone() else {
        return RustChampionScoreOutput {
            ok: false,
            score: None,
            patch_label: Some("engine-v1".to_string()),
            error: Some("No draft snapshot available".to_string()),
        };
    };
    let Some(pool_key) = normalize_role_key(&input.recommend.my_role) else {
        return RustChampionScoreOutput {
            ok: false,
            score: None,
            patch_label: Some("engine-v1".to_string()),
            error: Some("Unknown role cannot be scored".to_string()),
        };
    };
    let state = recommend_state(snapshot, &input.recommend.my_role);
    let tables = recommend_tables(&input.recommend);
    RustChampionScoreOutput {
        ok: true,
        score: Some(v1_component_scores(input.champion_id, pool_key, &state, &tables)),
        patch_label: Some(recommend_patch_label(
            recommend_mc_count(input.recommend.monte_carlo_samples),
            input.recommend.has_trained_data,
        )),
        error: None,
    }
}

fn recommend_patch_label(n_mc: usize, has_trained_data: bool) -> String {
    let base = if n_mc > 0 {
        format!("engine-v1+mc({n_mc})")
    } else {
        "engine-v1".to_string()
    };
    if has_trained_data {
        format!("{base}+trained")
    } else {
        base
    }
}

fn recommend_tables(input: &RustRecommendInput) -> RecommendTables {
    let id_to_name = input
        .id_to_name
        .iter()
        .map(|row| (row.id, row.name.clone()))
        .collect();
    let meta_by_id = input
        .champion_meta_by_id
        .iter()
        .map(|row| (row.id, row.meta.clone()))
        .collect();
    let comfort_by_id = input
        .comfort_by_champion_id
        .iter()
        .filter(|row| row.id > 0 && row.value.is_finite())
        .map(|row| (row.id, row.value))
        .collect();
    let role_pools = input
        .role_champion_pools
        .iter()
        .map(|row| (row.role.clone(), unique_ids(&row.champion_ids)))
        .collect();
    let public_candidates = input
        .public_candidate_ids
        .iter()
        .map(|row| (row.role.clone(), unique_ids(&row.champion_ids)))
        .collect();
    let public_base_rates = input
        .public_base_rates
        .iter()
        .filter(|row| row.rate.is_finite())
        .map(|row| ((row.role.clone(), row.champion_id), row.rate))
        .collect();
    let public_lane_rates = input
        .public_lane_rates
        .iter()
        .filter(|row| row.rate.is_finite())
        .map(|row| ((row.role.clone(), row.candidate_id, row.enemy_id), row.rate))
        .collect();
    let matchup_bonuses = input
        .matchup_bonuses
        .iter()
        .filter(|row| row.bonus.is_finite())
        .map(|row| ((row.candidate_id, row.enemy_id), row.bonus))
        .collect();
    let mut ally_synergy = HashMap::new();
    for row in &input.ally_synergy_bonuses {
        if row.bonus.is_finite() {
            ally_synergy.insert((row.left_id, row.right_id), row.bonus);
        }
    }
    let trained_base = input
        .trained_base_rates
        .iter()
        .filter(|row| row.logit.is_finite())
        .map(|row| ((row.role.clone(), row.champion_id), row.logit))
        .collect();
    let trained_lane = input
        .trained_lane_rates
        .iter()
        .filter(|row| row.logit.is_finite())
        .map(|row| ((row.role.clone(), row.ally_id, row.enemy_id), row.logit))
        .collect();
    let trained_synergy = input
        .trained_synergy_deltas
        .iter()
        .filter(|row| row.delta.is_finite())
        .map(|row| {
            (
                (
                    row.ally_role.clone(),
                    row.partner_role.clone(),
                    row.ally_id,
                    row.partner_id,
                ),
                row.delta,
            )
        })
        .collect();
    let mut enemy_posteriors: HashMap<usize, HashMap<String, f64>> = input
        .enemy_role_inference
        .iter()
        .map(|row| (row.enemy_index, row.role_probabilities.clone()))
        .collect();
    if enemy_posteriors.is_empty() {
        if let Some(snapshot) = input.snapshot.as_ref() {
            enemy_posteriors = infer_recommend_enemy_posteriors(snapshot, &role_pools, &public_candidates);
        }
    }
    let overrides = input
        .champion_threat_overrides
        .iter()
        .map(|row| (row.key.clone(), row.clone()))
        .collect();
    let hard_counters = input
        .hard_counters_by_name
        .iter()
        .map(|row| (row.champion_key.clone(), row.counter_keys.clone()))
        .collect();
    RecommendTables {
        id_to_name,
        meta_by_id,
        comfort_by_id,
        role_pools,
        public_candidates,
        public_base_rates,
        public_lane_rates,
        matchup_bonuses,
        ally_synergy,
        trained_base,
        trained_lane,
        trained_synergy,
        enemy_posteriors,
        overrides,
        hard_counters,
    }
}

fn locked_recommend_enemies(snapshot: &DraftSnapshot) -> Vec<(usize, i32, String)> {
    snapshot
        .enemy
        .iter()
        .enumerate()
        .filter_map(|(idx, slot)| {
            slot.champion_id
                .filter(|id| *id > 0)
                .map(|id| (idx, id, slot.role.clone()))
        })
        .collect()
}

fn role_pool_has(
    role: &str,
    champion_id: i32,
    role_pools: &HashMap<String, Vec<i32>>,
    public_candidates: &HashMap<String, Vec<i32>>,
) -> bool {
    role_pools
        .get(role)
        .map(|ids| ids.contains(&champion_id))
        .unwrap_or(false)
        || public_candidates
            .get(role)
            .map(|ids| ids.contains(&champion_id))
            .unwrap_or(false)
}

fn recommend_role_likelihood(
    champion_id: i32,
    role: &str,
    role_pools: &HashMap<String, Vec<i32>>,
    public_candidates: &HashMap<String, Vec<i32>>,
) -> f64 {
    if public_candidates
        .get(role)
        .map(|ids| ids.contains(&champion_id))
        .unwrap_or(false)
    {
        return 0.26;
    }
    if role_pool_has(role, champion_id, role_pools, public_candidates) {
        0.22
    } else {
        0.015
    }
}

fn recommend_slot_role_prior(slot_role: &str, role: &str) -> f64 {
    match normalize_role_key(slot_role) {
        None => 1.0,
        Some(slot_key) if slot_key == role => 20.0,
        Some(_) => 0.3,
    }
}

fn recommend_assignment_score(
    champion_id: i32,
    slot_role: &str,
    role: &str,
    role_pools: &HashMap<String, Vec<i32>>,
    public_candidates: &HashMap<String, Vec<i32>>,
) -> f64 {
    let mut likelihood = recommend_role_likelihood(champion_id, role, role_pools, public_candidates);
    if normalize_role_key(slot_role) == Some(role) {
        likelihood = likelihood.max(0.08);
    }
    likelihood * recommend_slot_role_prior(slot_role, role)
}

fn empty_recommend_posterior() -> HashMap<String, f64> {
    ROLE_KEYS
        .iter()
        .map(|role| (role.to_string(), 0.0))
        .collect()
}

fn one_hot_recommend_posterior(role: &str) -> HashMap<String, f64> {
    ROLE_KEYS
        .iter()
        .map(|candidate| {
            (
                candidate.to_string(),
                if *candidate == role { 1.0 } else { 0.0 },
            )
        })
        .collect()
}

fn normalize_recommend_posterior(row: &HashMap<String, f64>) -> HashMap<String, f64> {
    let total: f64 = ROLE_KEYS
        .iter()
        .map(|role| row.get(*role).copied().unwrap_or(0.0))
        .sum();
    if !total.is_finite() || total <= 0.0 {
        return ROLE_KEYS
            .iter()
            .map(|role| (role.to_string(), 0.2))
            .collect();
    }
    ROLE_KEYS
        .iter()
        .map(|role| {
            (
                role.to_string(),
                row.get(*role).copied().unwrap_or(0.0) / total,
            )
        })
        .collect()
}

fn infer_recommend_enemy_posteriors(
    snapshot: &DraftSnapshot,
    role_pools: &HashMap<String, Vec<i32>>,
    public_candidates: &HashMap<String, Vec<i32>>,
) -> HashMap<usize, HashMap<String, f64>> {
    let locked = locked_recommend_enemies(snapshot);
    let mut out = HashMap::new();
    if locked.is_empty() {
        return out;
    }

    let mut assigned_roles = HashSet::new();
    let has_known_unique_assignments = locked.iter().all(|(_, _, slot_role)| {
        let Some(role) = normalize_role_key(slot_role) else {
            return false;
        };
        assigned_roles.insert(role)
    });
    if has_known_unique_assignments {
        for (idx, _, slot_role) in locked {
            if let Some(role) = normalize_role_key(&slot_role) {
                out.insert(idx, one_hot_recommend_posterior(role));
            }
        }
        return out;
    }

    fn recur(
        i: usize,
        score: f64,
        locked: &[(usize, i32, String)],
        role_pools: &HashMap<String, Vec<i32>>,
        public_candidates: &HashMap<String, Vec<i32>>,
        used: &mut HashSet<&'static str>,
        role_by_idx: &mut HashMap<usize, &'static str>,
        assignments: &mut Vec<(HashMap<usize, &'static str>, f64)>,
    ) {
        if i >= locked.len() {
            assignments.push((role_by_idx.clone(), score));
            return;
        }
        let (idx, champion_id, slot_role) = &locked[i];
        for role in ROLE_KEYS {
            if used.contains(role) {
                continue;
            }
            let next_score = score
                * recommend_assignment_score(
                    *champion_id,
                    slot_role,
                    role,
                    role_pools,
                    public_candidates,
                );
            if !next_score.is_finite() || next_score <= 0.0 {
                continue;
            }
            used.insert(role);
            role_by_idx.insert(*idx, role);
            recur(
                i + 1,
                next_score,
                locked,
                role_pools,
                public_candidates,
                used,
                role_by_idx,
                assignments,
            );
            role_by_idx.remove(idx);
            used.remove(role);
        }
    }

    let mut assignments = Vec::new();
    recur(
        0,
        1.0,
        &locked,
        role_pools,
        public_candidates,
        &mut HashSet::new(),
        &mut HashMap::new(),
        &mut assignments,
    );

    let total: f64 = assignments.iter().map(|(_, score)| *score).sum();
    if total <= 0.0 {
        for (idx, champion_id, slot_role) in locked {
            let mut row = empty_recommend_posterior();
            for role in ROLE_KEYS {
                row.insert(
                    role.to_string(),
                    recommend_assignment_score(
                        champion_id,
                        &slot_role,
                        role,
                        role_pools,
                        public_candidates,
                    ),
                );
            }
            out.insert(idx, normalize_recommend_posterior(&row));
        }
        return out;
    }

    for (idx, _, _) in &locked {
        out.insert(*idx, empty_recommend_posterior());
    }
    for (assignment, score) in assignments {
        let weight = score / total;
        for (idx, role) in assignment {
            if let Some(row) = out.get_mut(&idx) {
                let entry = row.entry(role.to_string()).or_insert(0.0);
                *entry += weight;
            }
        }
    }
    out.into_iter()
        .map(|(idx, row)| (idx, normalize_recommend_posterior(&row)))
        .collect()
}

fn recommend_state(snapshot: DraftSnapshot, my_role: &str) -> RecommendState {
    let bans = unique_ids(snapshot.bans.as_deref().unwrap_or(&[]));
    let mut unavailable: HashSet<i32> = bans.iter().copied().collect();
    let mut locked = 0;
    for slot in snapshot.ally.iter().chain(snapshot.enemy.iter()) {
        if let Some(id) = slot.champion_id.filter(|id| *id > 0) {
            unavailable.insert(id);
            locked += 1;
        }
    }
    let my_pick_order = snapshot.my_pick_order;
    RecommendState {
        snapshot,
        my_role: my_role.to_string(),
        bans,
        unavailable,
        my_pick_order,
        locked_champion_picks: locked,
    }
}

fn recommend_rows(
    input: &RustRecommendInput,
    state: &RecommendState,
    tables: &RecommendTables,
) -> Vec<PickSuggestionOut> {
    let Some(pool_key) = normalize_role_key(&state.my_role) else {
        return Vec::new();
    };
    let candidate_filter = input
        .candidate_champion_ids
        .as_ref()
        .map(|ids| ids.iter().copied().filter(|id| *id > 0).collect::<HashSet<_>>());
    let pinned_local_pick_id = local_locked_pick_id(&state.snapshot, &state.my_role);
    let mut legal = Vec::new();
    push_unique(&mut legal, tables.role_pools.get(pool_key).map(Vec::as_slice).unwrap_or(&[]));
    push_unique(
        &mut legal,
        tables
            .public_candidates
            .get(pool_key)
            .map(Vec::as_slice)
            .unwrap_or(&[]),
    );
    let mut pool = Vec::new();
    for champion_id in legal {
        if let Some(filter) = &candidate_filter {
            if !filter.contains(&champion_id) {
                continue;
            }
        }
        let allow_pinned = candidate_filter.is_none() && Some(champion_id) == pinned_local_pick_id;
        if !state.unavailable.contains(&champion_id) || allow_pinned {
            pool.push(champion_id);
        }
    }
    if candidate_filter.is_none() {
        if let Some(id) = pinned_local_pick_id.filter(|id| *id > 0) {
            if !pool.contains(&id) {
                pool.push(id);
            }
        }
    }

    let n_mc = recommend_mc_count(input.monte_carlo_samples);
    let use_mc = n_mc > 0;
    let mut rand = Mulberry32::new(input.rng_seed);
    let role_pools = if use_mc {
        Some(build_recommend_role_pool_cache(tables))
    } else {
        None
    };
    let local_cell = state.snapshot.local_player_cell_id;
    let context_ready = has_board_context(&state.snapshot, &state.my_role, local_cell);
    let lane_opp = inferred_lane_opponent_id(&state.snapshot, &state.my_role, tables);
    let mut rows = Vec::new();
    for champion_id in pool {
        let comp = v1_component_scores(champion_id, pool_key, state, tables);
        if !use_mc {
            rows.push(RecommendRowWork {
                champion_id,
                comp,
                ev: None,
                risk: None,
                mc_weight: None,
            });
            continue;
        }
        let s0 = clone_with_my_pick(&state.snapshot, &state.my_role, local_cell, champion_id);
        let mut sample_mean = 0.0;
        let mut sample_m2 = 0.0;
        for i in 0..n_mc {
            let done = complete_draft_randomly(
                &s0,
                &state.bans,
                &mut rand,
                role_pools.as_ref().expect("role pools exist when MC is active"),
            );
            let mut next_state = recommend_state(done, &state.my_role);
            next_state.locked_champion_picks = 10;
            let x = v1_component_scores(champion_id, pool_key, &next_state, tables).combined;
            let n = (i + 1) as f64;
            let delta = x - sample_mean;
            sample_mean += delta / n;
            sample_m2 += delta * (x - sample_mean);
        }
        let stdev = (sample_m2 / (n_mc.max(1) as f64)).sqrt();
        let comfort = comfort_get(champion_id, tables);
        let future_weight = monte_carlo_future_weight(&state.snapshot, &state.my_role, local_cell, tables);
        let projected_mean = clamp01(comp.combined + (sample_mean - comp.combined) * future_weight);
        let ev = clamp01(0.9 * projected_mean + 0.1 * comfort - 0.1 * stdev * future_weight);
        rows.push(RecommendRowWork {
            champion_id,
            comp,
            ev: Some(ev),
            risk: Some(stdev),
            mc_weight: Some(future_weight),
        });
    }

    sort_recommend_rows(&mut rows, use_mc, &input.sort_by, context_ready);
    let selected = select_recommend_rows(
        &rows,
        input.max_results,
        &input.sort_by,
        &input.delta_list_mode,
        context_ready,
        pinned_local_pick_id,
    );
    selected
        .into_iter()
        .map(|row| recommend_output_row(row, use_mc, context_ready, lane_opp, pinned_local_pick_id, state))
        .collect()
}

fn recommend_output_row(
    row: RecommendRowWork,
    use_mc: bool,
    context_ready: bool,
    lane_opp: Option<i32>,
    pinned_local_pick_id: Option<i32>,
    state: &RecommendState,
) -> PickSuggestionOut {
    let comp = row.comp;
    let p_score = row.ev.unwrap_or(comp.combined);
    let base_win_rate = context_ready.then_some(round3(comp.base));
    let context_win_rate = context_ready.then_some(round3(comp.context_combined));
    let win_rate_delta = if context_ready {
        Some(round3(comp.context_combined - comp.base))
    } else {
        None
    };
    let has_meaningful_team_synergy_delta = win_rate_delta
        .map(|d| d.abs() >= 0.003)
        .unwrap_or(false);
    let scale = if use_mc { 2.6 } else { 3.2 };
    let display_score = ((1.0 + (p_score - 0.5) * scale) * 100.0).round() / 100.0;
    let mut reasons = Vec::new();
    push_reason(&mut reasons, "fill_role");
    if comp.base > 0.51 {
        push_reason(&mut reasons, "base_wr");
    }
    if has_meaningful_team_synergy_delta && comp.ally > 0.51 {
        push_reason(&mut reasons, "team_synergy");
    }
    if has_meaningful_team_synergy_delta && comp.comp > 0.53 {
        push_reason(&mut reasons, "team_synergy");
    }
    if comp.enemy > 0.51 {
        push_reason(&mut reasons, "lane_counter");
    }
    if lane_opp.is_none() {
        if draft_phase_from_locked_picks(state.locked_champion_picks) == "early" && comp.base > 0.515 {
            push_reason(&mut reasons, "blind_safe");
        }
    } else if comp.enemy > 0.52 {
        push_reason(&mut reasons, "late_counter");
    }
    if p_score > 0.51 {
        push_reason(&mut reasons, "meta_safe");
    }
    if use_mc && row.risk.unwrap_or(0.0) < 0.1 {
        push_reason(&mut reasons, "meta_safe");
    }
    if has_meaningful_team_synergy_delta
        && state.my_role == "support"
        && [12, 53, 111, 201].contains(&row.champion_id)
        && comp.ally > 0.5
    {
        push_reason(&mut reasons, "team_synergy");
    }
    let detail = if use_mc {
        format!(
            "V1 {:.1}% · EV {:.1}% · MC {:.0}% · sd{:.0}% · adj a{:.1} e{:.1} c{:.1} p{:.1} b-{:.1} · {}",
            comp.combined * 100.0,
            row.ev.unwrap_or(0.0) * 100.0,
            row.mc_weight.unwrap_or(0.0) * 100.0,
            row.risk.unwrap_or(0.0) * 100.0,
            comp.ally_adj * 100.0,
            comp.enemy_adj * 100.0,
            comp.comp_adj * 100.0,
            comp.comfort_adj * 100.0,
            comp.blind_p * 100.0,
            if lane_opp.is_some() { "lane" } else { "blind" }
        )
    } else {
        format!(
            "~{:.1}% blend · b{:.0}% a{:.0}% e{:.0}% c{:.0}% · adj a{:.1} e{:.1} c{:.1} p{:.1} b-{:.1} · {}",
            comp.combined * 100.0,
            comp.base * 100.0,
            comp.ally * 100.0,
            comp.enemy * 100.0,
            comp.comp * 100.0,
            comp.ally_adj * 100.0,
            comp.enemy_adj * 100.0,
            comp.comp_adj * 100.0,
            comp.comfort_adj * 100.0,
            comp.blind_p * 100.0,
            if lane_opp.is_some() { "lane" } else { "blind" }
        )
    };
    PickSuggestionOut {
        champion_id: row.champion_id,
        score: display_score,
        reasons,
        is_locked_pick: (Some(row.champion_id) == pinned_local_pick_id).then_some(true),
        base_win_rate,
        context_win_rate,
        win_rate_delta,
        est_win: Some(round3(p_score)),
        lookahead_ev: row.ev,
        lookahead_risk: row.risk,
        detail: Some(detail),
    }
}

fn v1_component_scores(
    champion_id: i32,
    pool_key: &str,
    state: &RecommendState,
    tables: &RecommendTables,
) -> ComponentScores {
    let base = base_term(champion_id, pool_key, state, tables);
    let ally = ally_term(champion_id, &state.my_role, state.snapshot.local_player_cell_id, &state.snapshot, tables);
    let enemy = enemy_term(champion_id, &state.my_role, &state.snapshot, tables);
    let comfort = comfort_get(champion_id, tables);
    let comp = comp_term(champion_id, &state.my_role, state.snapshot.local_player_cell_id, &state.snapshot, tables);
    let ally_locks = teammate_lock_count_excluding_local(&state.snapshot);
    let enemy_locks = enemy_lock_count(&state.snapshot);
    let t_a = clamp01(ally_locks as f64 / 4.0);
    let lc = lane_certainty(&state.snapshot, &state.my_role, tables);
    let t_e = clamp01(lc * (0.65_f64.max(enemy_locks as f64 / 5.0)));
    let t_c = t_a;
    let r_a = reliability(ally_locks as f64 * 60.0, 80.0);
    let r_e = reliability(enemy_locks as f64 * 70.0 * 0.35_f64.max(lc), 35.0);
    let r_c = reliability(ally_locks as f64 * 50.0, 500.0);
    let has_comfort = tables.comfort_by_id.contains_key(&champion_id);
    let r_p = reliability(if has_comfort { 40.0 } else { 0.0 }, 40.0);
    let ally_adj = (0.09 + 0.08 * t_a) * r_a * centered01(ally);
    let enemy_adj = (0.2 + 0.3 * t_e) * r_e * centered01(enemy);
    let comp_adj = (0.02 + 0.06 * t_c) * r_c * centered01(comp);
    let comfort_adj = 0.04 * r_p * centered01(comfort);
    let blind_p = blind_penalty(champion_id, pool_key, state, tables, 1.0 - t_e);
    let context_combined = clamp01(base + ally_adj + enemy_adj + comp_adj);
    let combined = clamp01(context_combined + comfort_adj - blind_p);
    ComponentScores {
        base,
        ally,
        enemy,
        comfort,
        comp,
        ally_adj,
        enemy_adj,
        comp_adj,
        comfort_adj,
        blind_p,
        context_combined,
        combined,
    }
}

fn base_term(champion_id: i32, pool_key: &str, state: &RecommendState, tables: &RecommendTables) -> f64 {
    let role = normalize_role_key(&state.my_role).unwrap_or(pool_key);
    if let Some(meta_rate) = tables
        .public_base_rates
        .get(&(role.to_string(), champion_id))
        .copied()
    {
        return meta_rate;
    }
    tables
        .trained_base
        .get(&(role.to_string(), champion_id))
        .copied()
        .map(sigmoid)
        .unwrap_or(0.5)
}

fn ally_term(
    champion_id: i32,
    my_role: &str,
    local_cell: Option<i32>,
    snapshot: &DraftSnapshot,
    tables: &RecommendTables,
) -> f64 {
    let mut total = 0.0;
    let mut n = 0.0;
    for ally in &snapshot.ally {
        let Some(ally_id) = ally.champion_id.filter(|id| *id > 0) else {
            continue;
        };
        if ally.role == my_role
            && ally.cell_id.is_some()
            && local_cell.is_some()
            && ally.cell_id == local_cell
        {
            continue;
        }
        let trained = tables
            .trained_synergy
            .get(&(my_role.to_string(), ally.role.clone(), champion_id, ally_id))
            .copied();
        if let Some(delta) = trained {
            total += clamp(sigmoid(delta), 0.3, 0.7);
        } else {
            let bonus = tables
                .ally_synergy
                .get(&(champion_id, ally_id))
                .or_else(|| tables.ally_synergy.get(&(ally_id, champion_id)))
                .copied()
                .unwrap_or(0.0);
            total += bonus_to_p(bonus, 1.4);
        }
        n += 1.0;
    }
    if n > 0.0 { total / n } else { 0.5 }
}

fn enemy_term(champion_id: i32, my_role: &str, snapshot: &DraftSnapshot, tables: &RecommendTables) -> f64 {
    let mut total = 0.0;
    let mut weight = 0.0;
    for (idx, enemy) in snapshot.enemy.iter().enumerate() {
        let Some(enemy_id) = enemy.champion_id.filter(|id| *id > 0) else {
            continue;
        };
        let meta = tables
            .public_lane_rates
            .get(&(my_role.to_string(), champion_id, enemy_id))
            .copied();
        let trained = tables
            .trained_lane
            .get(&(my_role.to_string(), champion_id, enemy_id))
            .copied()
            .map(sigmoid);
        let fallback = shrunk_lane_rate(champion_id, enemy_id, tables);
        let heuristic = blend_heuristic_matchup_rates(meta, fallback);
        let matchup = blend_enemy_matchup_rate(trained, heuristic);
        let lane_weight = inferred_lane_weight_for_enemy(tables, idx, my_role);
        total += matchup * lane_weight;
        weight += lane_weight;
    }
    if weight > 0.0 { total / weight } else { 0.5 }
}

fn comp_term(
    champion_id: i32,
    my_role: &str,
    local_cell: Option<i32>,
    snapshot: &DraftSnapshot,
    tables: &RecommendTables,
) -> f64 {
    let mut ad_threat = 0.0;
    let mut ap_threat = 0.0;
    let mut fighter_count = 0.0;
    let mut mage_count = 0.0;
    let mut marksman_count = 0.0;
    let mut assassin_count = 0.0;
    let mut tank_count = 0.0;
    let mut support_count = 0.0;
    for ally in &snapshot.ally {
        if ally.role == my_role
            && ally.cell_id.is_some()
            && local_cell.is_some()
            && ally.cell_id == local_cell
        {
            add_comp_champion(
                champion_id,
                my_role,
                tables,
                &mut ad_threat,
                &mut ap_threat,
                &mut fighter_count,
                &mut mage_count,
                &mut marksman_count,
                &mut assassin_count,
                &mut tank_count,
                &mut support_count,
            );
            continue;
        }
        let Some(id) = ally.champion_id.filter(|id| *id > 0) else {
            continue;
        };
        add_comp_champion(
            id,
            &ally.role,
            tables,
            &mut ad_threat,
            &mut ap_threat,
            &mut fighter_count,
            &mut mage_count,
            &mut marksman_count,
            &mut assassin_count,
            &mut tank_count,
            &mut support_count,
        );
    }
    let total_threat = ad_threat + ap_threat;
    if total_threat <= 0.0 {
        return 0.5;
    }
    let mut score = 0.5;
    let skew = (ad_threat - ap_threat).abs() / total_threat;
    score += (0.45 - skew) * 0.12;
    let one_resist_draft = (ap_threat >= 4.1 && ad_threat <= 1.0) || (ad_threat >= 4.1 && ap_threat <= 1.0);
    if one_resist_draft {
        score -= 0.12;
    }
    let class_max = fighter_count
        .max(mage_count)
        .max(marksman_count)
        .max(assassin_count)
        .max(tank_count);
    if class_max >= 4.0 {
        score -= 0.07;
    }
    let frontline = tank_count + fighter_count * 0.6;
    if frontline < 1.2 {
        score -= 0.06;
    }
    let has_sustained_dps = marksman_count >= 1.0 || ad_threat >= 1.8 || ap_threat >= 2.2;
    if !has_sustained_dps {
        score -= 0.04;
    }
    let engage_weight = tank_count + assassin_count * 0.5 + fighter_count * 0.5 + support_count * 0.35;
    if engage_weight < 1.0 {
        score -= 0.03;
    }
    clamp(score, 0.35, 0.65)
}

#[allow(clippy::too_many_arguments)]
fn add_comp_champion(
    champion_id: i32,
    role: &str,
    tables: &RecommendTables,
    ad_threat: &mut f64,
    ap_threat: &mut f64,
    fighter_count: &mut f64,
    mage_count: &mut f64,
    marksman_count: &mut f64,
    assassin_count: &mut f64,
    tank_count: &mut f64,
    support_count: &mut f64,
) {
    let name = champion_name(champion_id, &tables.id_to_name);
    if let Some(override_row) = tables.overrides.get(&normalize_key(&name)) {
        for class in &override_row.classes {
            match class.as_str() {
                "fighter" => *fighter_count += 1.0,
                "mage" => *mage_count += 1.0,
                "marksman" => *marksman_count += 1.0,
                "assassin" => *assassin_count += 1.0,
                "tank" => *tank_count += 1.0,
                "support" => *support_count += 1.0,
                _ => {}
            }
        }
        match override_row.threat.as_str() {
            "ad" => {
                *ad_threat += if override_row.classes.iter().any(|c| c == "marksman") { 1.1 } else { 1.0 };
            }
            "ap" => *ap_threat += 1.0,
            "hybrid" => {
                *ad_threat += 0.5;
                *ap_threat += 0.5;
            }
            _ => {
                *ad_threat += 0.125;
                *ap_threat += 0.125;
            }
        }
        return;
    }
    let tags = tables
        .meta_by_id
        .get(&champion_id)
        .map(|meta| meta.tags.clone())
        .unwrap_or_default();
    let has = |tag: &str| tags.iter().any(|t| t == tag);
    if has("Fighter") {
        *fighter_count += 1.0;
    }
    if has("Mage") {
        *mage_count += 1.0;
    }
    if has("Marksman") {
        *marksman_count += 1.0;
    }
    if has("Assassin") {
        *assassin_count += 1.0;
    }
    if has("Tank") {
        *tank_count += 1.0;
    }
    if has("Support") {
        *support_count += 1.0;
    }
    let utility_only = (has("Tank") || has("Support"))
        && !has("Marksman")
        && !has("Mage")
        && !has("Assassin")
        && !has("Fighter");
    if utility_only {
        *ad_threat += 0.1;
        *ap_threat += 0.1;
        return;
    }
    let damage = infer_damage_from_tags(&tags, role);
    match damage.as_str() {
        "ad" => *ad_threat += if has("Marksman") { 1.1 } else { 1.0 },
        "ap" => *ap_threat += 1.0,
        _ => {
            *ad_threat += 0.5;
            *ap_threat += 0.5;
        }
    }
}

fn infer_damage_from_tags(tags: &[String], role: &str) -> String {
    let has = |tag: &str| tags.iter().any(|t| t == tag);
    if role == "unknown" || tags.is_empty() {
        return "mixed".to_string();
    }
    if has("Mage") && has("Marksman") {
        return "flex".to_string();
    }
    if has("Tank") {
        return "mixed".to_string();
    }
    if has("Support") && has("Mage") {
        return "ap".to_string();
    }
    if has("Support") && has("Assassin") {
        return "mixed".to_string();
    }
    if has("Support") {
        return "ap".to_string();
    }
    if has("Mage") {
        return "ap".to_string();
    }
    if has("Assassin") || has("Fighter") || has("Marksman") {
        return "ad".to_string();
    }
    "mixed".to_string()
}

fn blind_penalty(
    champion_id: i32,
    pool_key: &str,
    state: &RecommendState,
    tables: &RecommendTables,
    enemy_exposure: f64,
) -> f64 {
    let base = base_term(champion_id, pool_key, state, tables);
    let early_board = draft_phase_from_locked_picks(state.locked_champion_picks) == "early"
        && state.locked_champion_picks < 3;
    let early_lcu = state.my_pick_order.map(|n| n <= 2).unwrap_or(false);
    let use_early = early_lcu || (early_board && state.my_pick_order.is_none());
    if !use_early {
        return 0.0;
    }
    let role_cap = match pool_key {
        "top" => 0.1,
        "middle" => 0.08,
        "bottom" => 0.06,
        "support" => 0.05,
        "jungle" => 0.04,
        _ => 0.0,
    };
    let vulnerability = clamp01((0.51 - base) / 0.1);
    role_cap * clamp01(enemy_exposure) * vulnerability
}

fn shrunk_lane_rate(candidate_id: i32, enemy_id: i32, tables: &RecommendTables) -> f64 {
    let bonus = tables
        .matchup_bonuses
        .get(&(candidate_id, enemy_id))
        .copied()
        .unwrap_or_else(|| derived_matchup_bonus(candidate_id, enemy_id, tables));
    let capped = clamp(bonus, -8.0, 8.0);
    let p = clamp(0.5 + capped * 0.04, 0.22, 0.78);
    let n = 52.0;
    let wins = (n * p).round();
    let losses = n - wins;
    (wins + 24.0 * 0.5) / (wins + losses + 24.0)
}

fn derived_matchup_bonus(candidate_id: i32, enemy_id: i32, tables: &RecommendTables) -> f64 {
    let candidate_name = champion_name(candidate_id, &tables.id_to_name);
    let enemy_name = champion_name(enemy_id, &tables.id_to_name);
    let candidate_key = normalize_key(&candidate_name);
    let enemy_key = normalize_key(&enemy_name);
    let candidate = champion_archetype(&candidate_name, tables);
    let enemy = champion_archetype(&enemy_name, tables);
    let mut bonus = hard_counter_bonus(&candidate_key, &enemy_key, tables);
    let candidate_has = |cls: &str| candidate.classes.iter().any(|c| c == cls);
    let enemy_has = |cls: &str| enemy.classes.iter().any(|c| c == cls);
    if candidate_has("assassin") && (enemy_has("marksman") || enemy_has("mage") || enemy_has("support")) {
        bonus += 1.9;
    }
    if enemy_has("assassin") && (candidate_has("marksman") || candidate_has("mage") || candidate_has("support")) {
        bonus -= 1.9;
    }
    if candidate_has("tank") && enemy_has("assassin") {
        bonus += 1.5;
    }
    if enemy_has("tank") && candidate_has("assassin") {
        bonus -= 1.5;
    }
    if candidate_has("marksman") && enemy_has("tank") {
        bonus += 1.1;
    }
    if enemy_has("marksman") && candidate_has("tank") {
        bonus -= 1.1;
    }
    if candidate_has("fighter") && enemy_has("tank") {
        bonus -= 0.6;
    }
    if enemy_has("fighter") && candidate_has("tank") {
        bonus += 0.6;
    }
    if candidate_has("mage") && enemy_has("fighter") {
        bonus += 0.7;
    }
    if enemy_has("mage") && candidate_has("fighter") {
        bonus -= 0.7;
    }
    if candidate.threat == "hybrid" && (enemy.threat == "ad" || enemy.threat == "ap") {
        bonus += 0.4;
    }
    if enemy.threat == "hybrid" && (candidate.threat == "ad" || candidate.threat == "ap") {
        bonus -= 0.4;
    }
    if candidate.threat == "utility" && enemy.threat != "utility" {
        bonus -= 0.3;
    }
    if enemy.threat == "utility" && candidate.threat != "utility" {
        bonus += 0.3;
    }
    bonus += (((candidate_id * 31 + enemy_id * 17).rem_euclid(7)) as f64 - 3.0) * 0.05;
    clamp(bonus, -6.0, 6.0)
}

#[derive(Debug, Clone)]
struct ChampionArchetype {
    threat: String,
    classes: Vec<String>,
}

fn champion_archetype(name: &str, tables: &RecommendTables) -> ChampionArchetype {
    if let Some(row) = tables.overrides.get(&normalize_key(name)) {
        return ChampionArchetype {
            threat: row.threat.clone(),
            classes: row.classes.clone(),
        };
    }
    ChampionArchetype {
        threat: "hybrid".to_string(),
        classes: vec!["fighter".to_string()],
    }
}

fn hard_counter_bonus(candidate_key: &str, enemy_key: &str, tables: &RecommendTables) -> f64 {
    let mut bonus = 0.0;
    if tables
        .hard_counters
        .get(enemy_key)
        .map(|counters| counters.iter().any(|key| key == candidate_key))
        .unwrap_or(false)
    {
        bonus += 8.0;
    }
    if tables
        .hard_counters
        .get(candidate_key)
        .map(|counters| counters.iter().any(|key| key == enemy_key))
        .unwrap_or(false)
    {
        bonus -= 8.0;
    }
    bonus
}

fn sort_recommend_rows(rows: &mut [RecommendRowWork], use_mc: bool, sort_by: &str, context_ready: bool) {
    if use_mc {
        if sort_by == "delta" {
            rows.sort_by(|a, b| {
                if !context_ready {
                    return cmp_desc(a.ev.unwrap_or(0.0), b.ev.unwrap_or(0.0));
                }
                compare_delta_rows(a, b, true)
            });
        } else {
            rows.sort_by(|a, b| cmp_desc(a.ev.unwrap_or(0.0), b.ev.unwrap_or(0.0)));
        }
    } else if sort_by == "delta" {
        rows.sort_by(|a, b| {
            if !context_ready {
                return cmp_desc(a.comp.combined, b.comp.combined);
            }
            compare_delta_rows(a, b, false)
        });
    } else {
        rows.sort_by(|a, b| cmp_desc(a.comp.combined, b.comp.combined));
    }
}

fn compare_delta_rows(a: &RecommendRowWork, b: &RecommendRowWork, use_ev_tiebreak: bool) -> Ordering {
    let a_delta = a.comp.context_combined - a.comp.base;
    let b_delta = b.comp.context_combined - b.comp.base;
    let a_pos = if a_delta > 0.0 { 1 } else { 0 };
    let b_pos = if b_delta > 0.0 { 1 } else { 0 };
    if b_pos != a_pos {
        return b_pos.cmp(&a_pos);
    }
    if (b_delta - a_delta).abs() > f64::EPSILON {
        return cmp_desc(a_delta, b_delta);
    }
    if use_ev_tiebreak {
        cmp_desc(a.ev.unwrap_or(a.comp.combined), b.ev.unwrap_or(b.comp.combined))
    } else {
        cmp_desc(a.comp.combined, b.comp.combined)
    }
}

fn select_recommend_rows(
    rows: &[RecommendRowWork],
    max_results: usize,
    sort_by: &str,
    delta_list_mode: &str,
    context_ready: bool,
    pinned_local_pick_id: Option<i32>,
) -> Vec<RecommendRowWork> {
    let n = max_results.max(1);
    let mut selected = if sort_by != "delta" {
        rows.to_vec()
    } else if context_ready {
        let mut by_delta = rows.to_vec();
        by_delta.sort_by(|a, b| {
            let a_delta = a.comp.context_combined - a.comp.base;
            let b_delta = b.comp.context_combined - b.comp.base;
            cmp_desc(a_delta, b_delta)
        });
        if delta_list_mode == "worst" {
            by_delta.reverse();
        }
        by_delta
    } else if delta_list_mode == "worst" {
        let mut reversed = rows.to_vec();
        reversed.reverse();
        reversed
    } else {
        rows.to_vec()
    };
    if let Some(pinned_id) = pinned_local_pick_id {
        if let Some(pos) = rows.iter().position(|row| row.champion_id == pinned_id) {
            let pinned = rows[pos].clone();
            selected.retain(|row| row.champion_id != pinned_id);
            selected.insert(0, pinned);
        }
    }
    selected.into_iter().take(n).collect()
}

fn build_recommend_role_pool_cache(tables: &RecommendTables) -> HashMap<String, Vec<i32>> {
    let mut out = HashMap::new();
    for role in ROLE_KEYS {
        let mut ids = Vec::new();
        push_unique(&mut ids, tables.role_pools.get(role).map(Vec::as_slice).unwrap_or(&[]));
        push_unique(
            &mut ids,
            tables.public_candidates.get(role).map(Vec::as_slice).unwrap_or(&[]),
        );
        out.insert(role.to_string(), ids);
    }
    out
}

fn clone_with_my_pick(snapshot: &DraftSnapshot, my_role: &str, local_cell: Option<i32>, champion_id: i32) -> DraftSnapshot {
    let mut ally = snapshot.ally.clone();
    let mut ok = false;
    for slot in &mut ally {
        if slot.role != my_role {
            continue;
        }
        if let (Some(local), Some(cell)) = (local_cell, slot.cell_id) {
            if cell == local {
                slot.champion_id = Some(champion_id);
                ok = true;
            }
            continue;
        }
        if slot.champion_id.unwrap_or(0) <= 0 {
            slot.champion_id = Some(champion_id);
            ok = true;
        }
    }
    if !ok {
        for slot in &mut ally {
            if slot.role == my_role {
                slot.champion_id = Some(champion_id);
            }
        }
    }
    DraftSnapshot {
        ally,
        enemy: snapshot.enemy.clone(),
        my_team: snapshot.my_team.clone(),
        my_role: snapshot.my_role.clone(),
        local_player_cell_id: snapshot.local_player_cell_id,
        bans: snapshot.bans.clone(),
        my_pick_order: snapshot.my_pick_order,
    }
}

fn complete_draft_randomly(
    snapshot: &DraftSnapshot,
    bans: &[i32],
    rand: &mut Mulberry32,
    role_pools: &HashMap<String, Vec<i32>>,
) -> DraftSnapshot {
    let mut exclude = build_unavailable_from_snapshot(snapshot, bans);
    let ally = fill_side_randomly(&snapshot.ally, &mut exclude, rand, role_pools);
    let enemy = fill_side_randomly(&snapshot.enemy, &mut exclude, rand, role_pools);
    DraftSnapshot {
        ally,
        enemy,
        my_team: snapshot.my_team.clone(),
        my_role: snapshot.my_role.clone(),
        local_player_cell_id: snapshot.local_player_cell_id,
        bans: snapshot.bans.clone(),
        my_pick_order: snapshot.my_pick_order,
    }
}

fn fill_side_randomly(
    slots: &[SlotPick],
    exclude: &mut HashSet<i32>,
    rand: &mut Mulberry32,
    role_pools: &HashMap<String, Vec<i32>>,
) -> Vec<SlotPick> {
    slots
        .iter()
        .map(|slot| {
            if slot.champion_id.unwrap_or(0) > 0 || slot.role == "unknown" {
                return slot.clone();
            }
            let Some(id) = pick_from_pool_excluding(&slot.role, exclude, rand, role_pools) else {
                return slot.clone();
            };
            exclude.insert(id);
            let mut next = slot.clone();
            next.champion_id = Some(id);
            next
        })
        .collect()
}

fn pick_from_pool_excluding(
    role: &str,
    exclude: &HashSet<i32>,
    rand: &mut Mulberry32,
    role_pools: &HashMap<String, Vec<i32>>,
) -> Option<i32> {
    let list = role_pools.get(role)?;
    let available = list.iter().filter(|id| !exclude.contains(id)).count();
    if available == 0 {
        return None;
    }
    let mut target = (rand.next() * available as f64).floor() as usize;
    for id in list {
        if exclude.contains(id) {
            continue;
        }
        if target == 0 {
            return Some(*id);
        }
        target -= 1;
    }
    None
}

fn build_unavailable_from_snapshot(snapshot: &DraftSnapshot, bans: &[i32]) -> HashSet<i32> {
    let mut out: HashSet<i32> = bans.iter().copied().filter(|id| *id > 0).collect();
    for slot in snapshot.ally.iter().chain(snapshot.enemy.iter()) {
        if let Some(id) = slot.champion_id.filter(|id| *id > 0) {
            out.insert(id);
        }
    }
    out
}

#[derive(Debug, Clone)]
struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    fn next(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6d2b_79f5);
        let mut t = self.state;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        ((t ^ (t >> 14)) as f64) / 4_294_967_296.0
    }
}

fn local_locked_pick_id(snapshot: &DraftSnapshot, my_role: &str) -> Option<i32> {
    if let Some(local_cell) = snapshot.local_player_cell_id {
        if let Some(slot) = snapshot.ally.iter().find(|slot| slot.cell_id == Some(local_cell)) {
            if let Some(id) = slot.champion_id.filter(|id| *id > 0) {
                return Some(id);
            }
        }
    }
    snapshot
        .ally
        .iter()
        .find(|slot| slot.role == my_role && slot.champion_id.unwrap_or(0) > 0)
        .and_then(|slot| slot.champion_id)
}

fn teammate_lock_count_excluding_local(snapshot: &DraftSnapshot) -> i32 {
    let local_cell = snapshot.local_player_cell_id;
    snapshot
        .ally
        .iter()
        .filter(|slot| {
            slot.champion_id.unwrap_or(0) > 0
                && !(local_cell.is_some() && slot.cell_id.is_some() && local_cell == slot.cell_id)
        })
        .count() as i32
}

fn enemy_lock_count(snapshot: &DraftSnapshot) -> i32 {
    snapshot
        .enemy
        .iter()
        .filter(|slot| slot.champion_id.unwrap_or(0) > 0)
        .count() as i32
}

fn has_board_context(snapshot: &DraftSnapshot, my_role: &str, local_cell: Option<i32>) -> bool {
    for ally in &snapshot.ally {
        if ally.champion_id.unwrap_or(0) <= 0 {
            continue;
        }
        if ally.role == my_role && local_cell.is_some() && ally.cell_id.is_some() && local_cell == ally.cell_id {
            continue;
        }
        return true;
    }
    snapshot.enemy.iter().any(|slot| slot.champion_id.unwrap_or(0) > 0)
}

fn lane_certainty(snapshot: &DraftSnapshot, my_role: &str, tables: &RecommendTables) -> f64 {
    if normalize_role_key(my_role).is_none() {
        return 0.0;
    }
    let mut lane_mass = 0.0;
    for (idx, enemy) in snapshot.enemy.iter().enumerate() {
        if enemy.champion_id.unwrap_or(0) <= 0 {
            continue;
        }
        lane_mass += tables
            .enemy_posteriors
            .get(&idx)
            .and_then(|p| p.get(my_role).copied())
            .unwrap_or(0.0);
    }
    clamp01(lane_mass)
}

fn inferred_lane_opponent_id(snapshot: &DraftSnapshot, my_role: &str, tables: &RecommendTables) -> Option<i32> {
    if normalize_role_key(my_role).is_none() {
        return None;
    }
    let mut best_id = None;
    let mut best_p = 0.0;
    for (idx, enemy) in snapshot.enemy.iter().enumerate() {
        let Some(id) = enemy.champion_id.filter(|id| *id > 0) else {
            continue;
        };
        let p = tables
            .enemy_posteriors
            .get(&idx)
            .and_then(|row| row.get(my_role).copied())
            .unwrap_or(0.0);
        if p > best_p {
            best_p = p;
            best_id = Some(id);
        }
    }
    if best_p >= 0.45 { best_id } else { None }
}

fn inferred_lane_weight_for_enemy(tables: &RecommendTables, enemy_idx: usize, my_role: &str) -> f64 {
    let off_role_floor = match my_role {
        "top" | "middle" => 0.12,
        "jungle" => 0.2,
        "bottom" | "support" => 0.18,
        _ => 0.18,
    };
    let Some(role_key) = normalize_role_key(my_role) else {
        return off_role_floor;
    };
    let lane_p = tables
        .enemy_posteriors
        .get(&enemy_idx)
        .and_then(|p| p.get(role_key).copied())
        .unwrap_or(0.0);
    off_role_floor + (1.0 - off_role_floor) * lane_p
}

fn monte_carlo_future_weight(snapshot: &DraftSnapshot, my_role: &str, local_cell: Option<i32>, tables: &RecommendTables) -> f64 {
    let ally_locks = teammate_lock_count_excluding_local(snapshot);
    let enemy_locks = enemy_lock_count(snapshot);
    let known_locks = ally_locks + enemy_locks;
    if known_locks <= 0 || !has_board_context(snapshot, my_role, local_cell) {
        return 0.0;
    }
    let lock_factor = clamp01(known_locks as f64 / 8.0);
    let lane_factor = if enemy_locks > 0 {
        0.35 + 0.65 * lane_certainty(snapshot, my_role, tables)
    } else {
        0.35
    };
    clamp01(0.15 + 0.45 * lock_factor * lane_factor)
}

fn recommend_mc_count(raw: i32) -> usize {
    raw.clamp(0, 200) as usize
}

fn normalize_role_key(role: &str) -> Option<&'static str> {
    match role {
        "top" => Some("top"),
        "jungle" => Some("jungle"),
        "middle" | "mid" => Some("middle"),
        "bottom" | "adc" | "bot" => Some("bottom"),
        "support" | "utility" | "sup" => Some("support"),
        _ => None,
    }
}

fn draft_phase_from_locked_picks(locked: i32) -> &'static str {
    if locked < 3 {
        "early"
    } else if locked < 6 {
        "mid"
    } else {
        "late"
    }
}

fn blend_heuristic_matchup_rates(meta: Option<f64>, fallback: f64) -> f64 {
    let Some(meta_rate) = meta else {
        return fallback;
    };
    let meta_shift = meta_rate - 0.5;
    let fallback_shift = fallback - 0.5;
    let same_direction = meta_shift == 0.0
        || fallback_shift == 0.0
        || meta_shift.signum() == fallback_shift.signum();
    let meta_weight = if !same_direction {
        0.9
    } else if fallback_shift.abs() < meta_shift.abs() * 0.7 {
        0.88
    } else {
        0.78
    };
    clamp_matchup_rate(0.5 + meta_shift * meta_weight + fallback_shift * (1.0 - meta_weight))
}

fn blend_enemy_matchup_rate(trained: Option<f64>, heuristic: f64) -> f64 {
    let Some(trained_rate) = trained else {
        return heuristic;
    };
    let trained_shift = trained_rate - 0.5;
    let heuristic_shift = heuristic - 0.5;
    if heuristic_shift.abs() < 0.015 {
        return clamp_matchup_rate(trained_rate);
    }
    let same_direction = trained_shift == 0.0
        || heuristic_shift == 0.0
        || trained_shift.signum() == heuristic_shift.signum();
    if !same_direction && trained_shift.abs() > heuristic_shift.abs() * 1.5 {
        return clamp_matchup_rate(0.5 + trained_shift * 0.7 + heuristic_shift * 0.3);
    }
    let heuristic_weight = if heuristic_shift.abs() >= 0.09 && trained_shift.abs() < heuristic_shift.abs() * 0.5 {
        0.8
    } else if same_direction {
        0.4
    } else {
        0.7
    };
    clamp_matchup_rate(0.5 + trained_shift * (1.0 - heuristic_weight) + heuristic_shift * heuristic_weight)
}

fn clamp_matchup_rate(v: f64) -> f64 {
    clamp(v, 0.28, 0.72)
}

fn bonus_to_p(bonus: f64, scale: f64) -> f64 {
    0.5 + scale * clamp(bonus * 0.04, -0.1, 0.1)
}

fn comfort_get(id: i32, tables: &RecommendTables) -> f64 {
    tables.comfort_by_id.get(&id).copied().unwrap_or(0.5)
}

fn reliability(n_eff: f64, prior: f64) -> f64 {
    if !n_eff.is_finite() || n_eff <= 0.0 {
        return 0.0;
    }
    n_eff / (n_eff + prior)
}

fn centered01(v: f64) -> f64 {
    clamp01(v) - 0.5
}

fn clamp01(v: f64) -> f64 {
    clamp(v, 0.0, 1.0)
}

fn clamp(v: f64, lo: f64, hi: f64) -> f64 {
    v.max(lo).min(hi)
}

fn sigmoid(x: f64) -> f64 {
    if !x.is_finite() {
        return 0.5;
    }
    if x > 50.0 {
        return 1.0;
    }
    if x < -50.0 {
        return 0.0;
    }
    let e = x.exp();
    e / (1.0 + e)
}

fn round3(v: f64) -> f64 {
    (v * 1000.0).round() / 1000.0
}

fn cmp_desc(a: f64, b: f64) -> Ordering {
    b.partial_cmp(&a).unwrap_or(Ordering::Equal)
}

fn unique_ids(ids: &[i32]) -> Vec<i32> {
    let mut out = Vec::new();
    push_unique(&mut out, ids);
    out
}

fn push_unique(out: &mut Vec<i32>, ids: &[i32]) {
    for id in ids {
        if *id > 0 && !out.contains(id) {
            out.push(*id);
        }
    }
}

fn push_reason(out: &mut Vec<String>, reason: &str) {
    if !out.iter().any(|r| r == reason) {
        out.push(reason.to_string());
    }
}

fn normalize_key(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

fn canonical_item_name(value: &str) -> String {
    let mut out = String::new();
    let mut last_was_space = false;
    for ch in value.chars().flat_map(|ch| ch.to_lowercase()) {
        let mapped = if ch == '\u{2019}' { '\'' } else { ch };
        if mapped.is_ascii_alphanumeric() || mapped == '\'' {
            out.push(mapped);
            last_was_space = false;
        } else if !last_was_space && !out.is_empty() {
            out.push(' ');
            last_was_space = true;
        }
    }
    out.trim().to_string()
}

fn is_mode_exclusive_item_id(id: i32) -> bool {
    id >= 10000
}

fn is_recommendable_sr_item(item: &ItemLite) -> bool {
    item.id > 0
        && item.maps.get("11").copied().unwrap_or(false)
        && item.gold.purchasable
        && item.required_champion.is_none()
        && !is_mode_exclusive_item_id(item.id)
}

fn champion_name(champion_id: i32, id_to_name: &HashMap<i32, String>) -> String {
    id_to_name
        .get(&champion_id)
        .cloned()
        .unwrap_or_else(|| format!("Champion {champion_id}"))
}

fn tag_classes(tags: &[String]) -> HashSet<String> {
    let mut out = HashSet::new();
    for tag in tags {
        match tag.to_lowercase().as_str() {
            "fighter" => {
                out.insert("fighter".to_string());
            }
            "mage" => {
                out.insert("mage".to_string());
            }
            "marksman" => {
                out.insert("marksman".to_string());
            }
            "tank" => {
                out.insert("tank".to_string());
            }
            "support" => {
                out.insert("support".to_string());
            }
            "assassin" => {
                out.insert("assassin".to_string());
            }
            _ => {}
        }
    }
    out
}

fn infer_threat_from_tags(classes: &HashSet<String>) -> String {
    if classes.contains("marksman") || classes.contains("assassin") {
        "ad".to_string()
    } else if classes.contains("mage") {
        "ap".to_string()
    } else if classes.contains("tank") || classes.contains("support") {
        "utility".to_string()
    } else if classes.contains("fighter") {
        "ad".to_string()
    } else {
        "hybrid".to_string()
    }
}

fn read_slot(
    slot: &SlotPick,
    id_to_name: &HashMap<i32, String>,
    meta_by_id: &HashMap<i32, ChampionMeta>,
    overrides: &HashMap<String, ThreatOverrideRow>,
) -> Option<SlotRead> {
    let champion_id = slot.champion_id?;
    if champion_id <= 0 {
        return None;
    }
    let name = slot
        .champion_name
        .as_ref()
        .filter(|name| !name.trim().is_empty())
        .cloned()
        .unwrap_or_else(|| champion_name(champion_id, id_to_name));
    let key = normalize_key(&name);
    let (threat, classes) = if let Some(row) = overrides.get(&key) {
        (
            row.threat.clone(),
            row.classes.iter().map(|s| s.to_string()).collect(),
        )
    } else {
        let classes = tag_classes(
            &meta_by_id
                .get(&champion_id)
                .map(|m| m.tags.as_slice())
                .unwrap_or(&[]),
        );
        (infer_threat_from_tags(&classes), classes)
    };
    Some(SlotRead {
        slot: slot.clone(),
        champion_id,
        role: slot.role.clone(),
        name,
        threat,
        classes,
    })
}

fn analyze_team(
    slots: &[SlotPick],
    id_to_name: &HashMap<i32, String>,
    meta_by_id: &HashMap<i32, ChampionMeta>,
    overrides: &HashMap<String, ThreatOverrideRow>,
) -> TeamRead {
    let reads: Vec<SlotRead> = slots
        .iter()
        .filter_map(|slot| read_slot(slot, id_to_name, meta_by_id, overrides))
        .collect();
    let mut team = TeamRead {
        slots: reads,
        ..TeamRead::default()
    };
    for read in team.slots.iter() {
        match read.threat.as_str() {
            "ad" => team.ad += 1.0,
            "ap" => team.ap += 1.0,
            "hybrid" => team.hybrid += 1.0,
            "utility" => team.utility += 1.0,
            _ => {}
        }
        let c = &read.classes;
        if c.contains("tank") {
            team.tanks += 1.0;
        }
        if c.contains("fighter") {
            team.fighters += 1.0;
        }
        if c.contains("mage") {
            team.mages += 1.0;
        }
        if c.contains("marksman") {
            team.marksmen += 1.0;
        }
        if c.contains("support") {
            team.supports += 1.0;
        }
        if c.contains("assassin") {
            team.assassins += 1.0;
        }
        if c.contains("tank") || c.contains("fighter") {
            team.frontline += 1.0;
        }
        if c.contains("tank") || c.contains("fighter") || c.contains("assassin") {
            team.engage += 1.0;
        }
        if c.contains("mage") || c.contains("marksman") {
            team.poke += 1.0;
        }
        if c.contains("assassin") || c.contains("support") || c.contains("mage") {
            team.pick += 1.0;
        }
        if c.contains("assassin") || c.contains("fighter") || c.contains("tank") {
            team.dive += 1.0;
        }
        if c.contains("marksman") || c.contains("mage") {
            team.scaling += 1.0;
        }
        if c.contains("support") || c.contains("tank") {
            team.sustain += 1.0;
        }
    }
    team
}

fn likely_lane_opponent<'a>(
    snapshot: Option<&'a DraftSnapshot>,
    my_role: &str,
    enemy_role_inference: &[EnemyRoleInference],
) -> Option<&'a SlotPick> {
    if my_role == "unknown" {
        return None;
    }
    let snapshot = snapshot?;
    let mut best: Option<(&SlotPick, f64)> = None;
    for (i, slot) in snapshot.enemy.iter().enumerate() {
        let Some(champion_id) = slot.champion_id else {
            continue;
        };
        if champion_id <= 0 {
            continue;
        }
        let inferred = enemy_role_inference
            .iter()
            .find(|row| row.enemy_index == i && row.champion_id == champion_id);
        let score = inferred
            .and_then(|row| row.role_probabilities.get(my_role).copied())
            .unwrap_or_else(|| if slot.role == my_role { 1.0 } else { 0.0 });
        if best
            .map(|(_, best_score)| score > best_score)
            .unwrap_or(true)
        {
            best = Some((slot, score));
        }
    }
    best.map(|(slot, _)| slot)
}

fn team_damage_counts(team: &TeamRead) -> (f64, f64) {
    (team.ap + team.hybrid * 0.5, team.ad + team.hybrid * 0.5)
}

fn has_suggestion_class(s: &PickSuggestion, cls: &str) -> bool {
    let tags = s
        .build_profile
        .as_ref()
        .map(|p| p.tags_line.to_lowercase())
        .unwrap_or_default();
    let archetype = s
        .build_profile
        .as_ref()
        .map(|p| p.archetype.to_lowercase())
        .unwrap_or_default();
    tags.contains(cls) || archetype.contains(cls)
}

fn threat_for_name(name: &str, overrides: &HashMap<String, ThreatOverrideRow>) -> Option<String> {
    overrides
        .get(&normalize_key(name))
        .map(|row| row.threat.clone())
}

fn classes_for_name(name: &str, overrides: &HashMap<String, ThreatOverrideRow>) -> Vec<String> {
    overrides
        .get(&normalize_key(name))
        .map(|row| row.classes.clone())
        .unwrap_or_default()
}

fn summoner_spells(
    my_role: &str,
    enemy: &TeamRead,
    lane_opponent: Option<&SlotPick>,
    overrides: &HashMap<String, ThreatOverrideRow>,
) -> String {
    let heavy_cc = enemy.tanks + enemy.supports >= 2.0;
    let lane_assassin = lane_opponent
        .and_then(|slot| slot.champion_name.as_ref())
        .map(|name| {
            classes_for_name(name, overrides)
                .iter()
                .any(|cls| cls == "assassin")
        })
        .unwrap_or(false);
    let burst = enemy.assassins >= 2.0 || lane_assassin;
    match my_role {
        "jungle" => "Flash + Smite".to_string(),
        "bottom" | "middle" if heavy_cc => "Flash + Cleanse".to_string(),
        "bottom" | "middle" | "support" if burst => "Flash + Exhaust".to_string(),
        "top" if enemy.frontline >= 3.0 => "Flash + Ghost/Teleport".to_string(),
        "top" => "Flash + Teleport".to_string(),
        "support" if enemy.dive >= 2.0 => "Flash + Exhaust".to_string(),
        "support" => "Flash + Ignite/Exhaust".to_string(),
        "bottom" => "Flash + Heal/Cleanse".to_string(),
        _ => "Flash + Teleport/Ignite".to_string(),
    }
}

fn starting_item(
    s: &PickSuggestion,
    my_role: &str,
    enemy: &TeamRead,
    lane_opponent: Option<&SlotPick>,
    overrides: &HashMap<String, ThreatOverrideRow>,
) -> String {
    let dmg = s.build_profile.as_ref().map(|p| p.damage.as_str());
    let lane_name = lane_opponent
        .and_then(|slot| slot.champion_name.as_deref())
        .unwrap_or("");
    let lane_classes = classes_for_name(lane_name, overrides);
    let lane_ranged = lane_classes
        .iter()
        .any(|cls| cls == "marksman" || cls == "mage");
    match my_role {
        "jungle" => {
            "Jungle pet start; consider early Gluttonous Greaves when sustain converts into tempo."
                .to_string()
        }
        "support" if has_suggestion_class(s, "tank") => {
            "World Atlas plus defensive potions; play for engage windows.".to_string()
        }
        "support" => "World Atlas plus lane control; keep first ward timing clean.".to_string(),
        "bottom" if has_suggestion_class(s, "marksman") && !lane_ranged => {
            "Doran's Bow is the greed start when you can auto safely.".to_string()
        }
        "bottom" if lane_ranged => {
            "Doran's Shield into poke, or Doran's Blade if your support owns level 2.".to_string()
        }
        "bottom" => "Doran's Blade/Bow depending on matchup volatility.".to_string(),
        "top" if enemy.frontline >= 2.0 || lane_classes.iter().any(|cls| cls == "tank") => {
            "Doran's Helm is strong when you can use both resistances and last-hit help."
                .to_string()
        }
        "top" if lane_ranged => {
            "Doran's Shield into ranged/poke lanes; trade health for wave control.".to_string()
        }
        "top" if dmg == Some("ap") => "Doran's Ring or Shield if the lane is hostile.".to_string(),
        "top" => "Doran's Blade for pressure, Shield for hard lanes.".to_string(),
        "middle" if enemy.assassins >= 1.0 => {
            "Doran's Shield/early defensive boots if burst can deny your first reset.".to_string()
        }
        "middle" if dmg == Some("ad") => {
            "Long Sword/Doran's Blade for AD mids; Doran's Ring or Tear for mages.".to_string()
        }
        "middle" => "Doran's Ring unless you need Tear scaling or Shield into poke.".to_string(),
        _ => "Use the safest standard start, then adapt boots to enemy damage.".to_string(),
    }
}

fn first_recall(s: &PickSuggestion, my_role: &str, enemy: &TeamRead) -> String {
    let dmg = s.build_profile.as_ref().map(|p| p.damage.as_str());
    if my_role == "support" {
        return "Boots + control wards; rush the lane item upgrade that matches engage or shielding.".to_string();
    }
    if my_role == "jungle" {
        return if enemy.ap >= enemy.ad {
            "Boots plus MR/clear component; sustain boots are viable after a winning first clear."
                .to_string()
        } else {
            "Boots plus damage/clear component; Gluttonous Greaves can snowball skirmish sustain."
                .to_string()
        };
    }
    if has_suggestion_class(s, "marksman") {
        return "Pickaxe/attack speed component; on-hit users can plan toward reworked Statikk Shiv.".to_string();
    }
    if has_suggestion_class(s, "assassin") {
        return "Serrated Dirk timing; Voltaic Cyclosword is the upfront burst option, Axiom is less early-loaded.".to_string();
    }
    if dmg == Some("ap") {
        return "Lost Chapter/amp tome path; Staff of Flowing Water users now value the restored haste.".to_string();
    }
    if has_suggestion_class(s, "fighter") {
        return "Long Sword/Ruby Crystal plus boots; Gluttonous Greaves are a sustain option if fights are extended.".to_string();
    }
    "Boots plus core component; buy resist shards if the inferred lane opponent is the real threat."
        .to_string()
}

fn can_add_magic_damage(s: &PickSuggestion) -> bool {
    matches!(
        s.build_profile.as_ref().map(|p| p.damage.as_str()),
        Some("ap" | "mixed" | "flex")
    ) || has_suggestion_class(s, "mage")
}

fn can_add_physical_damage(s: &PickSuggestion) -> bool {
    matches!(
        s.build_profile.as_ref().map(|p| p.damage.as_str()),
        Some("ad" | "mixed" | "flex")
    ) || has_suggestion_class(s, "marksman")
        || has_suggestion_class(s, "fighter")
}

fn add_unique(lines: &mut Vec<String>, line: &str) {
    if !lines.iter().any(|existing| existing == line) {
        lines.push(line.to_string());
    }
}

fn core_item_plan(s: &PickSuggestion, my_role: &str, enemy: &TeamRead) -> String {
    if let Some(profile) = &s.build_profile {
        if let Some(hint) = &profile.item_hint {
            if !hint.is_empty() {
                return hint.clone();
            }
        }
        if !profile.build_hint.is_empty() {
            return profile.build_hint.clone();
        }
    }
    if my_role == "support" {
        return if has_suggestion_class(s, "tank") {
            "Support quest into engage durability; buy the aura or peel item that answers their fed carry.".to_string()
        } else {
            "Support quest into haste and vision control; add peel or anti-heal when fights group early.".to_string()
        };
    }
    if has_suggestion_class(s, "marksman") {
        return if enemy.frontline >= 2.0 {
            "Sustained DPS core first, then an anti-tank slot before the third major fight."
                .to_string()
        } else {
            "Standard DPS curve first; keep one slot open for burst defense if enemy dive gets ahead.".to_string()
        };
    }
    if has_suggestion_class(s, "mage") {
        return if enemy.frontline >= 2.0 {
            "Mana/AP core into burn or magic penetration so tanks cannot ignore you.".to_string()
        } else {
            "AP haste or burst core; protect your first two-item spike with vision before objectives.".to_string()
        };
    }
    if has_suggestion_class(s, "assassin") {
        return "First lethality or burst spike matters most; delay greed if the enemy has point-and-click lockdown.".to_string();
    }
    if has_suggestion_class(s, "fighter") {
        return "Bruiser damage plus durability is the default; choose sustain for long fights and penetration into tanks.".to_string();
    }
    if has_suggestion_class(s, "tank") {
        return "First full tank item should match the enemy carry damage, then pivot into teamfight utility.".to_string();
    }
    "Follow the champion standard core, then adapt second item to the strongest enemy damage source.".to_string()
}

fn boots_item_plan(s: &PickSuggestion, my_role: &str, enemy: &TeamRead) -> String {
    let (magic, physical) = team_damage_counts(enemy);
    let heavy_cc = enemy.tanks + enemy.supports + enemy.pick >= 3.0;
    if magic >= 4.0 || (magic > physical + 1.0 && heavy_cc) {
        return "Mercury's Treads when AP/CC is the main threat; keep damage boots only if lane is controlled.".to_string();
    }
    if physical >= 4.0 || enemy.marksmen >= 2.0 {
        return "Plated Steelcaps into AD/auto attackers; greed damage boots only when your team can peel.".to_string();
    }
    if my_role == "support" || my_role == "jungle" {
        return "Early movement boots for tempo, then upgrade toward the enemy damage split."
            .to_string();
    }
    if has_suggestion_class(s, "mage") {
        return "Sorcerer's or haste boots for tempo; swap to Mercs if CC prevents spell rotations.".to_string();
    }
    if has_suggestion_class(s, "marksman") {
        return "Attack-speed or Swifties-style boots unless burst forces Steelcaps or Mercs."
            .to_string();
    }
    "Use champion-standard boots, then pivot to Mercs or Steelcaps when one damage type is stacked."
        .to_string()
}

fn defensive_item_plan(
    s: &PickSuggestion,
    enemy: &TeamRead,
    lane_opponent: Option<&SlotPick>,
    overrides: &HashMap<String, ThreatOverrideRow>,
) -> String {
    let (magic, physical) = team_damage_counts(enemy);
    let lane_threat = lane_opponent
        .and_then(|slot| slot.champion_name.as_deref())
        .and_then(|name| threat_for_name(name, overrides));
    if enemy.assassins >= 2.0 || enemy.dive >= 3.0 {
        return if has_suggestion_class(s, "marksman") || has_suggestion_class(s, "mage") {
            "Reserve an early defensive slot against dive; stopwatch, shield, or lifesteal value beats pure greed.".to_string()
        } else {
            "Add health/resists before side-laning deep; survive the first burst rotation, then re-engage.".to_string()
        };
    }
    if magic >= 4.0 || lane_threat.as_deref() == Some("ap") {
        return "Buy an early MR component if the AP lane or jungle can burst your first reset."
            .to_string();
    }
    if physical >= 4.0 || lane_threat.as_deref() == Some("ad") {
        return "Buy armor before the second big fight if AD damage is stacked or lane trades are unavoidable.".to_string();
    }
    if enemy.poke >= 3.0 {
        return "Sustain and safer recalls matter into poke; do not delay defense just to finish a greedy component.".to_string();
    }
    "Default defense can wait, but keep gold flexible for the enemy carry who gets ahead first."
        .to_string()
}

fn situational_item_plans(
    s: &PickSuggestion,
    my_role: &str,
    ally: &TeamRead,
    enemy: &TeamRead,
) -> Vec<String> {
    let mut lines = Vec::new();
    let (ally_magic, ally_physical) = team_damage_counts(ally);
    if enemy.frontline >= 3.0 || enemy.tanks >= 2.0 {
        if has_suggestion_class(s, "mage")
            || s.build_profile.as_ref().map(|p| p.damage.as_str()) == Some("ap")
        {
            add_unique(&mut lines, "Anti-tank: add burn or magic penetration before enemy frontline reaches full resist stacks.");
        } else if has_suggestion_class(s, "marksman")
            || has_suggestion_class(s, "fighter")
            || s.build_profile.as_ref().map(|p| p.damage.as_str()) == Some("ad")
        {
            add_unique(&mut lines, "Anti-tank: plan armor penetration, Black Cleaver-style shred, or on-hit DPS before late objectives.");
        } else {
            add_unique(&mut lines, "Anti-tank: help your carry access frontline with peel, slows, or resistance shred.");
        }
    }
    if enemy.sustain >= 2.0 || enemy.supports >= 2.0 {
        add_unique(&mut lines, "Anti-heal: buy it early when enchanters, drain tanks, or bruiser sustain decide extended fights.");
    }
    if enemy.supports >= 2.0
        && (has_suggestion_class(s, "assassin")
            || s.build_profile.as_ref().map(|p| p.damage.as_str()) == Some("ad"))
    {
        add_unique(&mut lines, "Shield pressure: consider shield-break or target the enchanter first if shields block burst windows.");
    }
    if enemy.poke >= 3.0 {
        add_unique(&mut lines, "Poke answer: choose sustain, engage speed, or waveclear before grouping for neutral objectives.");
    }
    if enemy.assassins >= 2.0
        && (my_role == "bottom"
            || my_role == "middle"
            || has_suggestion_class(s, "marksman")
            || has_suggestion_class(s, "mage"))
    {
        add_unique(&mut lines, "Anti-burst: a defensive second or third item is usually better than one more damage component.");
    }
    if ally.slots.len() >= 3 && ally_magic < 1.0 && can_add_magic_damage(s) {
        add_unique(
            &mut lines,
            "Team damage: lean into the AP or magic-damage path so armor stacking is punishable.",
        );
    }
    if ally.slots.len() >= 3 && ally_physical < 1.0 && can_add_physical_damage(s) {
        add_unique(
            &mut lines,
            "Team damage: preserve physical DPS instead of over-indexing on utility or tank stats.",
        );
    }
    if ally.slots.len() >= 3
        && ally.frontline < 1.0
        && (has_suggestion_class(s, "tank") || has_suggestion_class(s, "fighter"))
    {
        add_unique(
            &mut lines,
            "Team shape: a bulkier frontline build may be worth more than maximum personal damage.",
        );
    }
    if ally.engage < 1.0 && my_role == "support" {
        add_unique(&mut lines, "Team shape: prioritize an engage or pick tool if your team has no reliable fight starter.");
    }
    lines.into_iter().take(5).collect()
}

fn item_notes(
    s: &PickSuggestion,
    my_role: &str,
    ally: &TeamRead,
    enemy: &TeamRead,
    lane_opponent: Option<&SlotPick>,
    overrides: &HashMap<String, ThreatOverrideRow>,
) -> Vec<String> {
    let mut notes = Vec::new();
    let (ally_magic, ally_physical) = team_damage_counts(ally);
    if let Some(name) = lane_opponent.and_then(|slot| slot.champion_name.as_deref()) {
        match threat_for_name(name, overrides).as_deref() {
            Some("ap") => add_unique(
                &mut notes,
                &format!("Lane check: {name} is AP-leaning; do not ignore early MR."),
            ),
            Some("ad") => add_unique(
                &mut notes,
                &format!(
                    "Lane check: {name} is AD-leaning; armor boots/components are live options."
                ),
            ),
            Some("utility") => add_unique(
                &mut notes,
                &format!("Lane check: {name} brings setup; value tenacity, spacing, and vision."),
            ),
            _ => {}
        }
    }
    if ally.slots.len() >= 3 && ally_magic < 1.0 && !can_add_magic_damage(s) {
        add_unique(&mut notes, "Team warning: allies are light on magic damage, so avoid low-value physical damage when behind.");
    }
    if ally.slots.len() >= 3 && ally_physical < 1.0 && !can_add_physical_damage(s) {
        add_unique(
            &mut notes,
            "Team warning: allies are light on physical DPS; protect whoever can hit objectives.",
        );
    }
    if enemy.frontline >= 3.0 && ally.scaling >= 2.0 {
        add_unique(&mut notes, "Fight length: expect front-to-back fights, so second/third items should scale into long objectives.");
    }
    if my_role == "jungle" && enemy.dive >= 2.0 {
        add_unique(&mut notes, "Jungle tempo: defensive boots can be the difference between covering dives and arriving late.");
    }
    notes.into_iter().take(4).collect()
}

fn fallback_item_plan(
    s: &PickSuggestion,
    my_role: &str,
    ally: &TeamRead,
    enemy: &TeamRead,
    lane_opponent: Option<&SlotPick>,
    overrides: &HashMap<String, ThreatOverrideRow>,
) -> DraftItemPlan {
    DraftItemPlan {
        core: core_item_plan(s, my_role, enemy),
        boots: boots_item_plan(s, my_role, enemy),
        defensive: defensive_item_plan(s, enemy, lane_opponent, overrides),
        situational: situational_item_plans(s, my_role, ally, enemy),
        notes: item_notes(s, my_role, ally, enemy, lane_opponent, overrides),
        default_build_source: None,
        default_item_ids: None,
        starting: None,
        first_recall: None,
        boot_choice: None,
        boot_alternatives: None,
        core_build: None,
        final_build: None,
        situational_items: None,
        matrix_rows: None,
        threat_summary: None,
    }
}

fn normalize_rules_text(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut in_tag = false;
    let mut last_space = false;
    for ch in value
        .replace("&nbsp;", " ")
        .replace("&#160;", " ")
        .replace("&amp;", "&")
        .chars()
    {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if in_tag => {}
            _ if ch.is_whitespace() => {
                if !last_space {
                    out.push(' ');
                    last_space = true;
                }
            }
            _ => {
                out.push(ch);
                last_space = false;
            }
        }
    }
    out.trim().to_string()
}

fn text_for_item(item: &ItemLite) -> String {
    format!(
        "{} {} {} {}",
        item.name,
        item.plaintext,
        normalize_rules_text(&item.description),
        item.tags.join(" ")
    )
}

fn has_any(text: &str, needles: &[&str]) -> bool {
    needles
        .iter()
        .any(|needle| text.contains(&needle.to_lowercase()))
}

fn stat(item: &ItemLite, key: &str) -> f64 {
    item.stats
        .get(key)
        .copied()
        .filter(|n| n.is_finite())
        .unwrap_or(0.0)
}

fn classify_item(item: &ItemLite) -> ItemProfile {
    let mut tags: HashSet<String> = HashSet::new();
    let lower = text_for_item(item).to_lowercase();
    let riot_tags: Vec<String> = item.tags.iter().map(|tag| tag.to_lowercase()).collect();
    let name = item.name.to_lowercase();
    let total = item.gold.total;
    let boot = riot_tags.iter().any(|tag| tag == "boots")
        || ["boots", "greaves", "treads", "steelcaps", "shoes"]
            .iter()
            .any(|needle| name.contains(needle));
    let consumable = item.consumed == Some(true)
        || riot_tags.iter().any(|tag| tag == "consumable")
        || has_any(&lower, &["potion", "elixir", "control ward"]);
    let starter = !boot
        && !consumable
        && total > 0.0
        && total <= 700.0
        && has_any(
            &lower,
            &[
                "doran",
                "world atlas",
                "jungle",
                "scorchclaw",
                "gustwalker",
                "mosstomper",
                "cull",
                "tear of the goddess",
            ],
        );
    let component = !boot
        && !starter
        && item
            .into
            .as_ref()
            .map(|rows| !rows.is_empty())
            .unwrap_or(false);
    let completed = !boot
        && !starter
        && !consumable
        && (!item
            .into
            .as_ref()
            .map(|rows| !rows.is_empty())
            .unwrap_or(false)
            || total >= 2200.0
            || item.depth.unwrap_or(0) >= 3);
    let phase = if boot {
        "boots"
    } else if consumable {
        "consumable"
    } else if starter {
        "starter"
    } else if component {
        "component"
    } else if completed {
        "completed"
    } else {
        "component"
    }
    .to_string();

    add_tag(&mut tags, boot, "boots");
    add_tag(&mut tags, starter, "starter");
    add_tag(&mut tags, component, "component");
    add_tag(&mut tags, completed, "completed");
    add_tag(
        &mut tags,
        stat(item, "FlatPhysicalDamageMod") > 0.0
            || riot_tags.iter().any(|t| t == "damage")
            || has_any(&lower, &["attack damage"]),
        "ad",
    );
    add_tag(
        &mut tags,
        stat(item, "FlatMagicDamageMod") > 0.0
            || riot_tags.iter().any(|t| t == "spell_damage")
            || has_any(&lower, &["ability power"]),
        "ap",
    );
    add_tag(
        &mut tags,
        stat(item, "FlatArmorMod") > 0.0 || has_any(&lower, &["armor"]),
        "armor",
    );
    add_tag(
        &mut tags,
        stat(item, "FlatSpellBlockMod") > 0.0 || has_any(&lower, &["magic resist"]),
        "mr",
    );
    add_tag(
        &mut tags,
        stat(item, "FlatHPPoolMod") > 0.0 || has_any(&lower, &["health"]),
        "health",
    );
    add_tag(
        &mut tags,
        stat(item, "FlatMPPoolMod") > 0.0 || has_any(&lower, &["mana"]),
        "mana",
    );
    add_tag(
        &mut tags,
        stat(item, "PercentAttackSpeedMod") > 0.0
            || riot_tags.iter().any(|t| t == "attack_speed")
            || has_any(&lower, &["attack speed"]),
        "attack-speed",
    );
    add_tag(
        &mut tags,
        stat(item, "FlatCritChanceMod") > 0.0
            || riot_tags.iter().any(|t| t == "critical_strike")
            || has_any(&lower, &["critical strike", "crit chance"]),
        "crit",
    );
    add_tag(
        &mut tags,
        stat(item, "FlatMovementSpeedMod") > 0.0
            || boot
            || has_any(&lower, &["move speed", "movement speed"]),
        "move-speed",
    );
    add_tag(
        &mut tags,
        has_any(&lower, &["ability haste", "haste", "cooldown"]),
        "haste",
    );
    add_tag(
        &mut tags,
        has_any(&lower, &["life steal", "lifesteal", "omnivamp", "vamp"]),
        "lifesteal",
    );
    add_tag(&mut tags, has_any(&lower, &["lethality"]), "lethality");
    add_tag(
        &mut tags,
        has_any(&lower, &["magic penetration", "magic pen"]),
        "magic-pen",
    );
    add_tag(
        &mut tags,
        has_any(
            &lower,
            &[
                "armor penetration",
                "armor pen",
                "armor reduction",
                "armor shred",
            ],
        ),
        "armor-pen",
    );
    add_tag(
        &mut tags,
        has_any(&lower, &["grievous wounds"])
            || [
                "executioner",
                "oblivion orb",
                "bramble vest",
                "mortal reminder",
                "morellonomicon",
                "thornmail",
            ]
            .iter()
            .any(|needle| name.contains(needle)),
        "anti-heal",
    );
    add_tag(
        &mut tags,
        has_any(&lower, &["shield reaver"]) || name.contains("serpent's fang"),
        "anti-shield",
    );
    add_tag(
        &mut tags,
        has_any(
            &lower,
            &["percent health", "maximum health", "current health", "burn"],
        ) || [
            "black cleaver",
            "liandry",
            "void staff",
            "cryptbloom",
            "terminus",
            "lord dominik",
            "blade of the ruined king",
            "kraken",
        ]
        .iter()
        .any(|needle| name.contains(needle)),
        "anti-tank",
    );
    add_tag(
        &mut tags,
        has_any(
            &lower,
            &["stasis", "spell shield", "lifeline", "resurrect", "revives"],
        ) || [
            "zhonya",
            "banshee",
            "guardian angel",
            "shieldbow",
            "sterak",
            "maw of malmortius",
            "death's dance",
            "jak",
            "randuin",
        ]
        .iter()
        .any(|needle| name.contains(needle)),
        "anti-burst",
    );
    add_tag(
        &mut tags,
        has_any(
            &lower,
            &[
                "tenacity",
                "slow resist",
                "cleanse",
                "quicksilver",
                "remove all crowd control",
            ],
        ) || ["mercury", "mikael", "merc scimitar", "qss"]
            .iter()
            .any(|needle| name.contains(needle)),
        "anti-cc",
    );
    let has_lifesteal_tag = tags.contains("lifesteal");
    add_tag(
        &mut tags,
        has_any(
            &lower,
            &[
                "regeneration",
                "regen",
                "heal and shield power",
                "redemption",
                "warmog",
            ],
        ) || has_lifesteal_tag,
        "sustain",
    );
    add_tag(
        &mut tags,
        riot_tags.iter().any(|t| t == "goldper" || t == "vision")
            || has_any(&lower, &["ward", "support quest", "heal and shield power"]),
        "support",
    );
    add_tag(
        &mut tags,
        has_any(&lower, &["jungle monster", "jungle companion", "smite"])
            || ["scorchclaw", "gustwalker", "mosstomper"]
                .iter()
                .any(|needle| name.contains(needle)),
        "jungle",
    );
    add_tag(
        &mut tags,
        has_any(&lower, &["shield", "heal and shield power", "ally"]),
        "enchanter",
    );
    add_tag(
        &mut tags,
        has_any(&lower, &["on-hit", "basic attacks", "attack speed"]),
        "marksman",
    );
    add_tag(
        &mut tags,
        has_any(&lower, &["ability power", "magic damage", "mana"]),
        "mage",
    );
    let has_ad_tag = tags.contains("ad");
    let has_ap_tag = tags.contains("ap");
    let has_health_tag = tags.contains("health");
    let has_haste_tag = tags.contains("haste");
    let has_lethality_tag = tags.contains("lethality");
    add_tag(
        &mut tags,
        has_any(&lower, &["armor", "magic resist", "health"]) && !has_ad_tag && !has_ap_tag,
        "tank",
    );
    add_tag(
        &mut tags,
        has_ad_tag && (has_health_tag || has_lifesteal_tag || has_haste_tag),
        "bruiser",
    );
    add_tag(
        &mut tags,
        has_lethality_tag || has_any(&lower, &["burst", "dash"]),
        "assassin",
    );

    let mut tags: Vec<String> = tags.into_iter().collect();
    tags.sort();
    ItemProfile { phase, tags }
}

fn add_tag(tags: &mut HashSet<String>, condition: bool, tag: &str) {
    if condition {
        tags.insert(tag.to_string());
    }
}

fn champion_kit_profile(texts: &[String]) -> KitProfile {
    let text = normalize_rules_text(&texts.join(" ")).to_lowercase();
    let hard_cc = [
        "stun",
        "root",
        "snare",
        "charm",
        "fear",
        "taunt",
        "knock up",
        "knocked up",
        "airborne",
        "suppress",
        "suppression",
        "sleep",
        "polymorph",
        "silence",
        "daze",
    ]
    .iter()
    .any(|needle| text.contains(needle));
    let heal = ["heal", "restore health", "regenerate"]
        .iter()
        .any(|needle| text.contains(needle));
    KitProfile {
        hard_cc,
        shield: text.contains("shield") || text.contains("barrier"),
        heal,
        mobility: [
            "dash", "blink", "leap", "teleport", "lunge", "vault", "charge",
        ]
        .iter()
        .any(|needle| text.contains(needle)),
        poke: [
            "range",
            "missile",
            "projectile",
            "poke",
            "line",
            "beam",
            "long range",
        ]
        .iter()
        .any(|needle| text.contains(needle)),
        burst: [
            "burst",
            "detonate",
            "explod",
            "critical",
            "execute",
            "bonus damage",
        ]
        .iter()
        .any(|needle| text.contains(needle)),
        sustain: heal
            || ["life steal", "omnivamp", "regenerate"]
                .iter()
                .any(|needle| text.contains(needle)),
        execute: text.contains("execute") || text.contains("missing health"),
    }
}

fn kit_texts(meta: Option<&ChampionMeta>) -> Vec<String> {
    let Some(meta) = meta else {
        return Vec::new();
    };
    let mut out = Vec::new();
    if let Some(passive) = &meta.passive {
        out.push(passive.name.clone());
        out.push(passive.description.clone());
        out.push(passive.tooltip.clone());
    }
    if let Some(spells) = &meta.spells {
        for spell in spells {
            out.push(spell.name.clone());
            out.push(spell.description.clone());
            out.push(spell.tooltip.clone());
        }
    }
    out.into_iter().filter(|line| !line.is_empty()).collect()
}

fn team_kit_signals(
    team: &TeamRead,
    meta_by_id: &HashMap<i32, ChampionMeta>,
) -> (f64, f64, f64, f64, f64) {
    let mut hard_cc = 0.0;
    let mut healing = 0.0;
    let mut shielding = 0.0;
    let mut mobility = 0.0;
    let mut burst = 0.0;
    for slot in team.slots.iter() {
        let kit = champion_kit_profile(&kit_texts(meta_by_id.get(&slot.champion_id)));
        if kit.hard_cc {
            hard_cc += 1.0;
        }
        if kit.heal || kit.sustain {
            healing += 1.0;
        }
        if kit.shield {
            shielding += 1.0;
        }
        if kit.mobility {
            mobility += 1.0;
        }
        if kit.burst || kit.execute {
            burst += 1.0;
        }
    }
    (hard_cc, healing, shielding, mobility, burst)
}

fn item_ref(item: &ItemLite, score: f64, profile: &ItemProfile, reason: String) -> DraftItemRef {
    DraftItemRef {
        item_id: item.id,
        name: item.name.clone(),
        reason,
        score: round1(score),
        tags: profile.tags.clone(),
        phase: profile.phase.clone(),
        cost: item.gold.total,
    }
}

fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn phase_for_default(item: &ItemLite, bucket: &str) -> String {
    if bucket == "boots" || item.tags.iter().any(|tag| tag.to_lowercase() == "boots") {
        "boots".to_string()
    } else if bucket == "starting" {
        "starter".to_string()
    } else if item
        .into
        .as_ref()
        .map(|rows| !rows.is_empty())
        .unwrap_or(false)
    {
        "component".to_string()
    } else {
        "completed".to_string()
    }
}

fn default_ref_for(item: &ItemLite, bucket: &str, score: f64) -> DraftItemRef {
    DraftItemRef {
        item_id: item.id,
        name: item.name.clone(),
        reason: "Default build path".to_string(),
        score,
        tags: item.tags.clone(),
        phase: phase_for_default(item, bucket),
        cost: item.gold.total,
    }
}

fn default_refs_for(
    ids: Option<&Vec<i32>>,
    by_id: &HashMap<i32, ItemLite>,
    bucket: &str,
) -> Vec<DraftItemRef> {
    ids.map(|ids| {
        ids.iter()
            .enumerate()
            .filter_map(|(idx, id)| {
                by_id
                    .get(id)
                    .map(|item| default_ref_for(item, bucket, 100.0 - idx as f64))
            })
            .collect()
    })
    .unwrap_or_default()
}

fn dedupe_item_ids(rows: &[DraftItemRef]) -> Vec<i32> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for row in rows {
        if seen.insert(row.item_id) {
            out.push(row.item_id);
        }
    }
    out
}

fn get_ugg_default_item_build(
    champion_id: i32,
    role: &str,
    item_catalog: &[ItemLite],
    ugg_seed: &UggSeed,
) -> Option<DefaultBuild> {
    if role == "unknown" || item_catalog.is_empty() {
        return None;
    }
    let row = ugg_seed
        .builds
        .iter()
        .find(|entry| entry.champion_id == champion_id && entry.role == role)?;
    let by_id: HashMap<i32, ItemLite> = item_catalog
        .iter()
        .filter(|item| is_recommendable_sr_item(item))
        .map(|item| (item.id, item.clone()))
        .collect();
    let starting = default_refs_for(row.starting.as_ref(), &by_id, "starting");
    let boots = default_refs_for(row.boots.as_ref(), &by_id, "boots");
    let core = default_refs_for(row.core.as_ref(), &by_id, "core");
    let final_items = default_refs_for(row.final_items.as_ref(), &by_id, "final");
    let mut all = Vec::new();
    all.extend(starting.clone());
    all.extend(boots.clone());
    all.extend(core.clone());
    all.extend(final_items.clone());
    let default_item_ids = dedupe_item_ids(&all);
    if default_item_ids.is_empty() {
        return None;
    }
    Some(DefaultBuild {
        starting,
        boots,
        core,
        final_items,
        default_item_ids,
    })
}

fn team_item_targets(
    team: &TeamRead,
    meta_by_id: &HashMap<i32, ChampionMeta>,
    item_catalog: &[ItemLite],
    ugg_seed: &UggSeed,
) -> Vec<EnemyDetail> {
    team.slots
        .iter()
        .map(|slot| {
            let kit = champion_kit_profile(&kit_texts(meta_by_id.get(&slot.champion_id)));
            let default_build =
                get_ugg_default_item_build(slot.champion_id, &slot.role, item_catalog, ugg_seed);
            let mut tags = HashSet::new();
            if let Some(default_build) = default_build {
                let all: Vec<i32> = default_build
                    .starting
                    .iter()
                    .chain(default_build.boots.iter())
                    .chain(default_build.core.iter())
                    .chain(default_build.final_items.iter())
                    .map(|row| row.item_id)
                    .collect();
                for id in all {
                    if let Some(item) = item_catalog.iter().find(|candidate| candidate.id == id) {
                        for tag in classify_item(item).tags {
                            tags.insert(tag);
                        }
                    }
                }
            }
            EnemyDetail {
                champion_id: slot.champion_id,
                name: slot.name.clone(),
                threat: slot.threat.clone(),
                classes: slot.classes.iter().cloned().collect(),
                hard_cc: kit.hard_cc,
                healing: kit.heal || kit.sustain,
                shielding: kit.shield,
                mobility: kit.mobility,
                burst: kit.burst || kit.execute,
                poke: kit.poke,
                default_build_tags: tags.into_iter().collect(),
            }
        })
        .collect()
}

fn item_plan(
    s: &PickSuggestion,
    my_role: &str,
    ally: &TeamRead,
    enemy: &TeamRead,
    lane_opponent: Option<&SlotPick>,
    meta_by_id: &HashMap<i32, ChampionMeta>,
    item_catalog: &[ItemLite],
    ugg_seed: &UggSeed,
    overrides: &HashMap<String, ThreatOverrideRow>,
) -> DraftItemPlan {
    let fallback = fallback_item_plan(s, my_role, ally, enemy, lane_opponent, overrides);
    if item_catalog.is_empty() {
        return fallback;
    }
    let (ally_magic, ally_physical) = team_damage_counts(ally);
    let (enemy_magic, enemy_physical) = team_damage_counts(enemy);
    let (hard_cc, healing, shielding, mobility, burst) = team_kit_signals(enemy, meta_by_id);
    let lane_threat = lane_opponent
        .and_then(|slot| slot.champion_name.as_deref())
        .and_then(|name| threat_for_name(name, overrides));
    let default_build = get_ugg_default_item_build(s.champion_id, my_role, item_catalog, ugg_seed);
    build_adaptive_item_plan(
        item_catalog,
        AdaptiveItemContext {
            champion_name: &s.champion_name,
            role: my_role,
            build_profile: s.build_profile.as_ref(),
            ally: AllyItemSignals {
                magic: ally_magic,
                physical: ally_physical,
                frontline: ally.frontline,
                engage: ally.engage,
                scaling: ally.scaling,
                slots: ally.slots.len(),
            },
            enemy: EnemyItemSignals {
                magic: enemy_magic,
                physical: enemy_physical,
                frontline: enemy.frontline,
                tanks: enemy.tanks,
                assassins: enemy.assassins,
                supports: enemy.supports,
                dive: enemy.dive,
                poke: enemy.poke,
                pick: enemy.pick,
                sustain: enemy.sustain,
                marksmen: enemy.marksmen,
                hard_cc,
                healing,
                shielding,
                mobility,
                burst,
            },
            enemy_details: team_item_targets(enemy, meta_by_id, item_catalog, ugg_seed),
            default_build,
            lane_threat,
            fallback,
        },
    )
}

fn champion_classes(profile: Option<&ChampionBuildProfile>) -> Vec<String> {
    let tags = profile
        .map(|p| format!("{} {}", p.tags_line, p.archetype).to_lowercase())
        .unwrap_or_default();
    ["marksman", "mage", "fighter", "tank", "support", "assassin"]
        .iter()
        .filter(|cls| tags.contains(**cls))
        .map(|cls| cls.to_string())
        .collect()
}

fn includes_static(rows: &[&str], value: &str) -> bool {
    rows.iter().any(|row| *row == value)
}

fn is_on_hit_carry(value: &str) -> bool {
    matches!(
        normalize_key(value).as_str(),
        "ashe"
            | "kaisa"
            | "kalista"
            | "kayle"
            | "kogmaw"
            | "teemo"
            | "twitch"
            | "varus"
            | "vayne"
            | "zeri"
    )
}

fn is_hybrid_carry(value: &str) -> bool {
    matches!(
        normalize_key(value).as_str(),
        "corki" | "ezreal" | "kaisa" | "kennen" | "kogmaw" | "teemo" | "varus" | "zeri"
    )
}

fn score_item(item: &ItemLite, profile: &ItemProfile, ctx: &AdaptiveItemContext) -> f64 {
    let p = &profile.tags;
    let classes = champion_classes(ctx.build_profile);
    let damage = ctx
        .build_profile
        .map(|profile| profile.damage.as_str())
        .unwrap_or("flex");
    let item_key = canonical_item_name(&item.name);
    let mut score = 35.0;
    if profile.phase == "completed" {
        score += 20.0;
    }
    if profile.phase == "component" {
        score += 7.0;
    }
    if profile.phase == "starter" {
        score += 8.0;
    }
    if profile.phase == "boots" {
        score += 12.0;
    }
    if damage == "ap" {
        score += if includes(p, "ap") {
            22.0
        } else if includes(p, "ad") {
            -26.0
        } else {
            0.0
        };
    }
    if damage == "ad" {
        score += if includes(p, "ad") {
            22.0
        } else if includes(p, "ap") {
            -26.0
        } else {
            0.0
        };
    }
    if damage == "mixed" || damage == "flex" {
        score += if includes(p, "ap") || includes(p, "ad") {
            12.0
        } else {
            0.0
        };
    }
    if includes(&classes, "marksman") {
        score += if includes(p, "marksman")
            || includes(p, "crit")
            || includes(p, "attack-speed")
            || includes(p, "ad")
        {
            13.0
        } else {
            0.0
        };
    }
    if includes(&classes, "mage") {
        score += if includes(p, "mage")
            || includes(p, "ap")
            || includes(p, "mana")
            || includes(p, "haste")
        {
            13.0
        } else {
            0.0
        };
    }
    if includes(&classes, "fighter") {
        score += if includes(p, "bruiser")
            || includes(p, "health")
            || includes(p, "ad")
            || includes(p, "lifesteal")
        {
            11.0
        } else {
            0.0
        };
    }
    if includes(&classes, "tank") {
        score += if includes(p, "tank")
            || includes(p, "health")
            || includes(p, "armor")
            || includes(p, "mr")
        {
            14.0
        } else {
            0.0
        };
    }
    if includes(&classes, "support") {
        score += if includes(p, "support") || includes(p, "enchanter") || includes(p, "tank") {
            14.0
        } else {
            0.0
        };
    }
    if includes(&classes, "assassin") {
        score += if includes(p, "assassin")
            || includes(p, "lethality")
            || includes(p, "ad")
            || includes(p, "ap")
        {
            10.0
        } else {
            0.0
        };
    }
    if ctx.enemy.magic >= 3.0 || ctx.lane_threat.as_deref() == Some("ap") {
        score += if includes(p, "mr") { 17.0 } else { 0.0 };
    }
    if ctx.enemy.physical >= 3.0
        || ctx.lane_threat.as_deref() == Some("ad")
        || ctx.enemy.marksmen >= 2.0
    {
        score += if includes(p, "armor") { 17.0 } else { 0.0 };
    }
    if ctx.enemy.hard_cc >= 2.0 || ctx.enemy.pick >= 3.0 {
        score += if includes(p, "anti-cc") { 18.0 } else { 0.0 };
    }
    if ctx.enemy.healing >= 2.0 || ctx.enemy.sustain >= 2.0 || ctx.enemy.supports >= 2.0 {
        score += if includes(p, "anti-heal") { 22.0 } else { 0.0 };
    }
    if ctx.enemy.shielding >= 2.0 || ctx.enemy.supports >= 2.0 {
        score += if includes(p, "anti-shield") {
            18.0
        } else {
            0.0
        };
    }
    if ctx.enemy.frontline >= 3.0 || ctx.enemy.tanks >= 2.0 {
        score += if includes(p, "anti-tank") || includes(p, "armor-pen") || includes(p, "magic-pen")
        {
            21.0
        } else {
            0.0
        };
    }
    if ctx.enemy.assassins >= 2.0 || ctx.enemy.dive >= 3.0 || ctx.enemy.burst >= 2.0 {
        score += if includes(p, "anti-burst") || includes(p, "health") {
            18.0
        } else {
            0.0
        };
    }
    if ctx.enemy.poke >= 3.0 {
        score += if includes(p, "sustain") || includes(p, "move-speed") {
            12.0
        } else {
            0.0
        };
    }
    if ctx.ally.magic < 1.0 {
        score += if includes(p, "ap") {
            12.0
        } else if includes(p, "ad") {
            -5.0
        } else {
            0.0
        };
    }
    if ctx.ally.physical < 1.0 {
        score += if includes(p, "ad") {
            12.0
        } else if includes(p, "ap") {
            -5.0
        } else {
            0.0
        };
    }
    if ctx.ally.frontline < 1.0 && (includes(&classes, "tank") || includes(&classes, "fighter")) {
        score += if includes(p, "health") || includes(p, "armor") || includes(p, "mr") {
            12.0
        } else {
            0.0
        };
    }
    if ctx.role != "support" && includes(p, "support") {
        score -= 28.0;
    }
    if ctx.role != "jungle" && includes(p, "jungle") {
        score -= 60.0;
    }
    if ctx.role == "jungle" && includes(p, "jungle") && profile.phase == "starter" {
        score += 28.0;
    }
    if ctx.role == "support" && includes(p, "support") {
        score += 18.0;
    }
    if ctx.role == "bottom" && includes(&classes, "marksman") && damage == "ad" {
        if includes_static(
            &[
                "guinsoo's rageblade",
                "hextech gunblade",
                "nashor's tooth",
                "statikk shiv",
                "terminus",
                "wit's end",
            ],
            &item_key,
        ) && !is_on_hit_carry(ctx.champion_name)
        {
            score -= 36.0;
        }
        if includes(p, "ap") && !includes(p, "crit") && !is_hybrid_carry(ctx.champion_name) {
            score -= 34.0;
        }
    }
    if let Some(required) = &item.required_champion {
        if required.to_lowercase() != ctx.champion_name.to_lowercase() {
            score -= 100.0;
        }
    }
    if profile.phase == "consumable" {
        score -= 25.0;
    }
    score
}

fn includes(rows: &[String], value: &str) -> bool {
    rows.iter().any(|row| row == value)
}

fn tag_reason(tag: &str) -> String {
    match tag {
        "anti-heal" => "healing",
        "anti-shield" => "shields",
        "anti-tank" => "frontline",
        "anti-burst" => "burst",
        "anti-cc" => "hard CC",
        "armor" => "physical damage",
        "mr" => "magic damage",
        "sustain" => "poke/sustain",
        other => other,
    }
    .to_string()
}

fn push_target(targets: &mut Vec<DraftItemEnemyTarget>, target: DraftItemEnemyTarget) {
    if !targets
        .iter()
        .any(|row| row.champion_id == target.champion_id && row.reason == target.reason)
    {
        targets.push(target);
    }
}

fn enemy_targets(profile: &ItemProfile, ctx: &AdaptiveItemContext) -> Vec<DraftItemEnemyTarget> {
    let mut targets = Vec::new();
    for enemy in ctx.enemy_details.iter() {
        let classes: HashSet<String> = enemy.classes.iter().cloned().collect();
        let default_tags: HashSet<String> = enemy.default_build_tags.iter().cloned().collect();
        let p = &profile.tags;
        let base_name = enemy.name.clone();
        if includes(p, "mr")
            && (enemy.threat == "ap" || enemy.threat == "hybrid" || classes.contains("mage"))
        {
            push_target(
                &mut targets,
                target(enemy, &base_name, "magic damage", "teamThreat"),
            );
        }
        if includes(p, "armor")
            && (enemy.threat == "ad"
                || enemy.threat == "hybrid"
                || classes.contains("marksman")
                || classes.contains("assassin")
                || classes.contains("fighter"))
        {
            push_target(
                &mut targets,
                target(
                    enemy,
                    &base_name,
                    if classes.contains("marksman") {
                        "crit DPS"
                    } else {
                        "physical damage"
                    },
                    "teamThreat",
                ),
            );
        }
        if includes(p, "anti-heal")
            && (enemy.healing
                || classes.contains("support")
                || default_tags.contains("lifesteal")
                || default_tags.contains("sustain"))
        {
            let default_sustain =
                default_tags.contains("lifesteal") || default_tags.contains("sustain");
            push_target(
                &mut targets,
                target(
                    enemy,
                    &base_name,
                    if default_sustain {
                        "default sustain"
                    } else {
                        "healing"
                    },
                    if default_sustain {
                        "defaultBuild"
                    } else {
                        "kit"
                    },
                ),
            );
        }
        if includes(p, "anti-shield")
            && (enemy.shielding
                || classes.contains("support")
                || default_tags.contains("anti-burst"))
        {
            let defensive_default = default_tags.contains("anti-burst");
            push_target(
                &mut targets,
                target(
                    enemy,
                    &base_name,
                    if defensive_default {
                        "defensive default"
                    } else {
                        "shields"
                    },
                    if defensive_default {
                        "defaultBuild"
                    } else {
                        "kit"
                    },
                ),
            );
        }
        if includes(p, "anti-tank")
            && (classes.contains("tank")
                || classes.contains("fighter")
                || default_tags.contains("health")
                || default_tags.contains("tank"))
        {
            let health_stack = default_tags.contains("health") || default_tags.contains("tank");
            push_target(
                &mut targets,
                target(
                    enemy,
                    &base_name,
                    if health_stack {
                        "health stack"
                    } else {
                        "frontline"
                    },
                    if health_stack {
                        "defaultBuild"
                    } else {
                        "teamThreat"
                    },
                ),
            );
        }
        if includes(p, "armor-pen")
            && (classes.contains("tank")
                || classes.contains("fighter")
                || enemy.threat == "ad"
                || default_tags.contains("armor"))
        {
            push_target(
                &mut targets,
                target(
                    enemy,
                    &base_name,
                    if default_tags.contains("armor") {
                        "armor stack"
                    } else {
                        "frontline armor"
                    },
                    if default_tags.contains("armor") {
                        "defaultBuild"
                    } else {
                        "teamThreat"
                    },
                ),
            );
        }
        if includes(p, "magic-pen")
            && (classes.contains("tank")
                || classes.contains("fighter")
                || enemy.threat == "ap"
                || enemy.threat == "hybrid"
                || default_tags.contains("mr"))
        {
            push_target(
                &mut targets,
                target(
                    enemy,
                    &base_name,
                    if default_tags.contains("mr") {
                        "MR stack"
                    } else {
                        "frontline MR"
                    },
                    if default_tags.contains("mr") {
                        "defaultBuild"
                    } else {
                        "teamThreat"
                    },
                ),
            );
        }
        if includes(p, "anti-burst")
            && (enemy.burst
                || classes.contains("assassin")
                || enemy.mobility
                || default_tags.contains("crit")
                || default_tags.contains("attack-speed"))
        {
            let default_dps =
                default_tags.contains("crit") || default_tags.contains("attack-speed");
            push_target(
                &mut targets,
                target(
                    enemy,
                    &base_name,
                    if default_dps {
                        "default DPS path"
                    } else {
                        "burst/dive"
                    },
                    if default_dps { "defaultBuild" } else { "kit" },
                ),
            );
        }
        if includes(p, "anti-cc")
            && (enemy.hard_cc || classes.contains("tank") || classes.contains("support"))
        {
            push_target(&mut targets, target(enemy, &base_name, "hard CC", "kit"));
        }
        if includes(p, "sustain")
            && (enemy.poke || classes.contains("mage") || classes.contains("marksman"))
        {
            push_target(&mut targets, target(enemy, &base_name, "poke", "kit"));
        }
    }
    targets.into_iter().take(4).collect()
}

fn target(enemy: &EnemyDetail, name: &str, reason: &str, source: &str) -> DraftItemEnemyTarget {
    DraftItemEnemyTarget {
        champion_id: enemy.champion_id,
        champion_name: name.to_string(),
        reason: reason.to_string(),
        source: source.to_string(),
    }
}

fn good_against(targets: &[DraftItemEnemyTarget]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for target in targets {
        if seen.insert(target.champion_name.clone()) {
            out.push(target.champion_name.clone());
        }
        if out.len() >= 4 {
            break;
        }
    }
    out
}

fn build_reason(profile: &ItemProfile, ctx: &AdaptiveItemContext, score: f64) -> String {
    let mut reasons = Vec::new();
    for tag in [
        "anti-heal",
        "anti-shield",
        "anti-tank",
        "anti-burst",
        "anti-cc",
        "armor",
        "mr",
        "sustain",
    ] {
        if includes(&profile.tags, tag) {
            reasons.push(format!("answers {}", tag_reason(tag)));
        }
    }
    let expected_damage = if ctx.build_profile.map(|p| p.damage.as_str()) == Some("ap") {
        "ap"
    } else {
        "ad"
    };
    if includes(&profile.tags, expected_damage) {
        reasons.push("fits champion damage".to_string());
    }
    if ctx.ally.magic < 1.0 && includes(&profile.tags, "ap") {
        reasons.push("adds missing AP".to_string());
    }
    if ctx.ally.physical < 1.0 && includes(&profile.tags, "ad") {
        reasons.push("adds missing AD".to_string());
    }
    if reasons.is_empty() {
        reasons.push(
            if score >= 70.0 {
                "strong general fit"
            } else {
                "situational option"
            }
            .to_string(),
        );
    }
    reasons.into_iter().take(3).collect::<Vec<_>>().join(", ")
}

fn avoid_when(profile: &ItemProfile, ctx: &AdaptiveItemContext) -> Vec<String> {
    let mut out = Vec::new();
    if includes(&profile.tags, "mr") && ctx.enemy.magic < 2.0 {
        out.push("enemy AP is low".to_string());
    }
    if includes(&profile.tags, "armor") && ctx.enemy.physical < 2.0 {
        out.push("enemy AD is low".to_string());
    }
    if includes(&profile.tags, "anti-heal") && ctx.enemy.healing < 2.0 && ctx.enemy.sustain < 2.0 {
        out.push("healing is low".to_string());
    }
    if includes(&profile.tags, "anti-shield") && ctx.enemy.shielding < 2.0 {
        out.push("shielding is low".to_string());
    }
    if includes(&profile.tags, "support") && ctx.role != "support" {
        out.push("not support role".to_string());
    }
    if includes(&profile.tags, "jungle") && ctx.role != "jungle" {
        out.push("not jungle role".to_string());
    }
    out.into_iter().take(3).collect()
}

fn top_refs<T: Clone + HasPhase>(rows: &[T], phase: &str, limit: usize) -> Vec<T> {
    rows.iter()
        .filter(|row| row.phase() == phase)
        .take(limit)
        .cloned()
        .collect()
}

trait HasPhase {
    fn phase(&self) -> &str;
    fn item_id(&self) -> i32;
    fn item_name(&self) -> &str;
}

impl HasPhase for DraftItemRef {
    fn phase(&self) -> &str {
        &self.phase
    }
    fn item_id(&self) -> i32 {
        self.item_id
    }
    fn item_name(&self) -> &str {
        &self.name
    }
}

impl HasPhase for DraftItemMatrixRow {
    fn phase(&self) -> &str {
        &self.phase
    }
    fn item_id(&self) -> i32 {
        self.item_id
    }
    fn item_name(&self) -> &str {
        &self.name
    }
}

fn dedupe_refs<T: Clone + HasPhase>(rows: &[T], limit: usize) -> Vec<T> {
    let mut seen = HashSet::new();
    let mut seen_names = HashSet::new();
    let mut out = Vec::new();
    for row in rows {
        let name_key = canonical_item_name(row.item_name());
        if seen.contains(&row.item_id()) || (!name_key.is_empty() && seen_names.contains(&name_key))
        {
            continue;
        }
        seen.insert(row.item_id());
        if !name_key.is_empty() {
            seen_names.insert(name_key);
        }
        out.push(row.clone());
        if out.len() >= limit {
            break;
        }
    }
    out
}

fn ref_to_matrix(row: DraftItemRef) -> DraftItemMatrixRow {
    DraftItemMatrixRow {
        item_id: row.item_id,
        name: row.name,
        reason: row.reason,
        score: row.score,
        tags: row.tags,
        phase: row.phase,
        cost: row.cost,
        good_into: vec!["default path".to_string()],
        good_against: Vec::new(),
        avoid_when: Vec::new(),
        enemy_targets: Vec::new(),
    }
}

fn matrix_to_ref(row: &DraftItemMatrixRow) -> DraftItemRef {
    DraftItemRef {
        item_id: row.item_id,
        name: row.name.clone(),
        reason: row.reason.clone(),
        score: row.score,
        tags: row.tags.clone(),
        phase: row.phase.clone(),
        cost: row.cost,
    }
}

fn threat_summary(ctx: &AdaptiveItemContext) -> Vec<DraftItemThreat> {
    let mut out = Vec::new();
    if ctx.enemy.magic >= 3.0 {
        out.push(threat(
            "Heavy AP",
            "danger",
            "Enemy magic damage is stacked.",
        ));
    }
    if ctx.enemy.physical >= 3.0 || ctx.enemy.marksmen >= 2.0 {
        out.push(threat(
            "Heavy AD",
            "danger",
            "Enemy physical damage is stacked.",
        ));
    }
    if ctx.enemy.hard_cc >= 2.0 || ctx.enemy.pick >= 3.0 {
        out.push(threat(
            "Hard CC",
            "danger",
            "Enemy lockdown can deny rotations.",
        ));
    }
    if ctx.enemy.healing >= 2.0 || ctx.enemy.sustain >= 2.0 {
        out.push(threat("Healing", "warning", "Anti-heal gains value."));
    }
    if ctx.enemy.shielding >= 2.0 {
        out.push(threat(
            "Shields",
            "warning",
            "Shield pressure or target selection matters.",
        ));
    }
    if ctx.enemy.frontline >= 3.0 || ctx.enemy.tanks >= 2.0 {
        out.push(threat(
            "Frontline",
            "warning",
            "Anti-tank damage gains value.",
        ));
    }
    if ctx.enemy.dive >= 3.0 || ctx.enemy.assassins >= 2.0 {
        out.push(threat("Dive", "danger", "Defensive slots are high value."));
    }
    if ctx.enemy.poke >= 3.0 {
        out.push(threat(
            "Poke",
            "warning",
            "Sustain, engage speed, or waveclear helps.",
        ));
    }
    if ctx.ally.magic < 1.0 && ctx.ally.slots >= 3 {
        out.push(threat(
            "Missing AP",
            "info",
            "Your team may need magic damage.",
        ));
    }
    if ctx.ally.physical < 1.0 && ctx.ally.slots >= 3 {
        out.push(threat(
            "Missing AD",
            "info",
            "Your team may need physical DPS.",
        ));
    }
    if ctx.ally.frontline < 1.0 && ctx.ally.slots >= 3 {
        out.push(threat(
            "No Frontline",
            "info",
            "Bulkier builds can stabilize fights.",
        ));
    }
    out.into_iter().take(10).collect()
}

fn threat(label: &str, tone: &str, reason: &str) -> DraftItemThreat {
    DraftItemThreat {
        label: label.to_string(),
        tone: tone.to_string(),
        reason: reason.to_string(),
    }
}

fn build_adaptive_item_plan(items: &[ItemLite], ctx: AdaptiveItemContext) -> DraftItemPlan {
    let mut scored: Vec<(ItemLite, ItemProfile, f64)> = items
        .iter()
        .filter(|item| is_recommendable_sr_item(item))
        .map(|item| {
            let profile = classify_item(item);
            let score = score_item(item, &profile, &ctx);
            (item.clone(), profile, score)
        })
        .filter(|(item, profile, score)| {
            *score > 20.0
                && item.gold.total > 0.0
                && item.consumed != Some(true)
                && profile.phase != "consumable"
        })
        .collect();
    scored.sort_by(|a, b| {
        b.2.partial_cmp(&a.2)
            .unwrap_or(Ordering::Equal)
            .then_with(|| {
                b.0.gold
                    .total
                    .partial_cmp(&a.0.gold.total)
                    .unwrap_or(Ordering::Equal)
            })
            .then_with(|| a.0.name.cmp(&b.0.name))
    });
    let mut seen_scored_ids = HashSet::new();
    let mut seen_scored_names = HashSet::new();
    scored.retain(|(item, _, _)| {
        let name_key = canonical_item_name(&item.name);
        if seen_scored_ids.contains(&item.id)
            || (!name_key.is_empty() && seen_scored_names.contains(&name_key))
        {
            return false;
        }
        seen_scored_ids.insert(item.id);
        if !name_key.is_empty() {
            seen_scored_names.insert(name_key);
        }
        true
    });

    let adaptive_rows: Vec<DraftItemMatrixRow> = scored
        .iter()
        .take(60)
        .map(|(item, profile, score)| {
            let targets = enemy_targets(profile, &ctx);
            let mut good_into = Vec::new();
            let mut seen = HashSet::new();
            for tag in profile.tags.iter().map(|tag| tag_reason(tag)) {
                if seen.insert(tag.clone()) {
                    good_into.push(tag);
                }
                if good_into.len() >= 4 {
                    break;
                }
            }
            let reference = item_ref(item, *score, profile, build_reason(profile, &ctx, *score));
            DraftItemMatrixRow {
                item_id: reference.item_id,
                name: reference.name,
                reason: reference.reason,
                score: reference.score,
                tags: reference.tags,
                phase: reference.phase,
                cost: reference.cost,
                good_into,
                good_against: good_against(&targets),
                avoid_when: avoid_when(profile, &ctx),
                enemy_targets: targets,
            }
        })
        .collect();
    let default_rows: Vec<DraftItemMatrixRow> = ctx
        .default_build
        .as_ref()
        .map(|default_build| {
            default_build
                .starting
                .iter()
                .chain(default_build.boots.iter())
                .chain(default_build.core.iter())
                .chain(default_build.final_items.iter())
                .cloned()
                .map(ref_to_matrix)
                .collect()
        })
        .unwrap_or_default();
    let mut combined = default_rows;
    combined.extend(adaptive_rows.clone());
    let matrix_rows = dedupe_refs(&combined, 24);
    let starting: Vec<DraftItemRef> = ctx
        .default_build
        .as_ref()
        .filter(|b| !b.starting.is_empty())
        .map(|b| b.starting.iter().take(2).cloned().collect())
        .unwrap_or_else(|| {
            top_refs(&adaptive_rows, "starter", 2)
                .iter()
                .map(matrix_to_ref)
                .collect()
        });
    let first_recall: Vec<DraftItemRef> = top_refs(&adaptive_rows, "component", 3)
        .iter()
        .map(matrix_to_ref)
        .collect();
    let boots: Vec<DraftItemRef> = ctx
        .default_build
        .as_ref()
        .filter(|b| !b.boots.is_empty())
        .map(|b| b.boots.iter().take(3).cloned().collect())
        .unwrap_or_else(|| {
            top_refs(&adaptive_rows, "boots", 3)
                .iter()
                .map(matrix_to_ref)
                .collect()
        });
    let completed = top_refs(&matrix_rows, "completed", 20);
    let core_build: Vec<DraftItemRef> = ctx
        .default_build
        .as_ref()
        .filter(|b| !b.core.is_empty())
        .map(|b| b.core.iter().take(3).cloned().collect())
        .unwrap_or_else(|| {
            let filtered: Vec<DraftItemMatrixRow> = completed
                .iter()
                .filter(|row| !includes(&row.tags, "support") || ctx.role == "support")
                .cloned()
                .collect();
            dedupe_refs(&filtered, 3)
                .iter()
                .map(matrix_to_ref)
                .collect()
        });
    let situational_source: Vec<DraftItemMatrixRow> = adaptive_rows
        .iter()
        .filter(|row| {
            row.tags.iter().any(|tag| {
                matches!(
                    tag.as_str(),
                    "anti-heal"
                        | "anti-shield"
                        | "anti-tank"
                        | "anti-burst"
                        | "anti-cc"
                        | "armor"
                        | "mr"
                        | "sustain"
                )
            })
        })
        .cloned()
        .collect();
    let situational_items: Vec<DraftItemRef> = dedupe_refs(&situational_source, 8)
        .iter()
        .map(matrix_to_ref)
        .collect();
    let seeded_final = ctx
        .default_build
        .as_ref()
        .filter(|b| !b.final_items.is_empty())
        .map(|b| b.final_items.clone())
        .unwrap_or_default();
    let mut final_source = seeded_final.clone();
    final_source.extend(core_build.clone());
    final_source.extend(situational_items.clone());
    final_source.extend(completed.iter().map(matrix_to_ref));
    let final_build = dedupe_refs(&final_source, 5);
    let boot_choice = boots.first().cloned();
    let mut final_with_boots_source = Vec::new();
    if let Some(boot) = &boot_choice {
        final_with_boots_source.push(boot.clone());
    }
    final_with_boots_source.extend(final_build.clone());
    let final_with_boots = if boot_choice.is_some() {
        dedupe_refs(&final_with_boots_source, 6)
    } else {
        final_build.into_iter().take(6).collect()
    };
    let default_item_ids = ctx
        .default_build
        .as_ref()
        .filter(|b| !b.default_item_ids.is_empty())
        .map(|b| b.default_item_ids.clone())
        .unwrap_or_else(|| {
            let mut rows = starting.clone();
            if let Some(boot) = &boot_choice {
                rows.push(boot.clone());
            }
            rows.extend(core_build.clone());
            rows.extend(final_with_boots.clone());
            dedupe_refs(&rows, 12)
                .into_iter()
                .map(|row| row.item_id)
                .collect()
        });
    let names = |rows: &[DraftItemRef]| {
        rows.iter()
            .map(|row| row.name.clone())
            .collect::<Vec<_>>()
            .join(" -> ")
    };
    let threats = threat_summary(&ctx);
    let mut notes = Vec::new();
    if !threats.is_empty() {
        notes.push(format!(
            "Threats: {}.",
            threats
                .iter()
                .map(|threat| threat.label.clone())
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    notes.extend(ctx.fallback.notes.clone());
    notes.truncate(4);
    DraftItemPlan {
        core: if core_build.is_empty() {
            ctx.fallback.core
        } else {
            names(&core_build)
        },
        boots: boot_choice
            .as_ref()
            .map(|boot| format!("{}: {}", boot.name, boot.reason))
            .unwrap_or(ctx.fallback.boots),
        defensive: situational_items
            .first()
            .map(|row| format!("{}: {}", row.name, row.reason))
            .unwrap_or(ctx.fallback.defensive),
        situational: situational_items
            .iter()
            .take(5)
            .map(|row| format!("{}: {}", row.name, row.reason))
            .collect(),
        notes,
        default_build_source: Some(
            if ctx.default_build.is_some() {
                "ugg"
            } else {
                "adaptive"
            }
            .to_string(),
        ),
        default_item_ids: Some(default_item_ids),
        starting: Some(starting),
        first_recall: Some(first_recall),
        boot_choice: Some(boot_choice),
        boot_alternatives: Some(boots.into_iter().skip(1).take(2).collect()),
        core_build: Some(core_build),
        final_build: Some(final_with_boots),
        situational_items: Some(situational_items),
        matrix_rows: Some(matrix_rows),
        threat_summary: Some(threats),
    }
}

fn rune_export(runes: Option<&RuneLoadoutHint>) -> String {
    match runes {
        None => "No rune page hint available for this pick yet.".to_string(),
        Some(runes) => {
            let note = runes
                .note
                .as_ref()
                .map(|note| format!(" - {note}"))
                .unwrap_or_default();
            format!(
                "{}: {} / Secondary: {}{}",
                runes.primary_tree, runes.keystone, runes.secondary, note
            )
        }
    }
}

fn plan_line(
    s: &PickSuggestion,
    my_role: &str,
    ally: &TeamRead,
    enemy: &TeamRead,
    lane_opponent: Option<&SlotPick>,
) -> String {
    let lane = lane_opponent
        .and_then(|slot| slot.champion_name.as_ref())
        .map(|name| format!(" into {name}"))
        .unwrap_or_default();
    if my_role == "jungle" {
        return if ally.engage >= 2.0 {
            "Path toward lanes with setup, then chain objectives after first successful fight."
                .to_string()
        } else {
            "Track the enemy jungler, cover volatile lanes, and avoid flipping without lane priority.".to_string()
        };
    }
    if my_role == "bottom" || my_role == "support" {
        return if enemy.dive >= 2.0 {
            format!("Hold cooldowns for the dive{lane}; winning the second wave matters less than surviving first engage.")
        } else {
            format!("Play the 2v2 around support cooldowns{lane}, then convert push into dragon vision.")
        };
    }
    if s.reasons.iter().any(|reason| reason == "lane_counter") {
        return format!(
            "Use the lane edge{lane} to get first move; do not trade it for low-value roams."
        );
    }
    if enemy.poke >= 3.0 {
        return format!("Short trades and flank timers matter{lane}; avoid neutral-objective standoffs before sustain arrives.");
    }
    format!("Keep wave states clean{lane}; this pick is strongest when its draft role and damage profile stay coherent.")
}

fn matchup_plans(
    suggestions: &[PickSuggestion],
    snapshot: Option<&DraftSnapshot>,
    my_role: &str,
    ally: &TeamRead,
    enemy: &TeamRead,
    id_to_name: &HashMap<i32, String>,
    meta_by_id: &HashMap<i32, ChampionMeta>,
    enemy_role_inference: &[EnemyRoleInference],
    item_catalog: &[ItemLite],
    ugg_seed: &UggSeed,
    overrides: &HashMap<String, ThreatOverrideRow>,
    include_item_plans: bool,
    limit: usize,
) -> Vec<DraftMatchupPlan> {
    let lane_opponent = likely_lane_opponent(snapshot, my_role, enemy_role_inference);
    let lane_opponent_id = lane_opponent.and_then(|slot| slot.champion_id);
    let lane_opponent_name = lane_opponent_id.map(|id| {
        lane_opponent
            .and_then(|slot| slot.champion_name.clone())
            .unwrap_or_else(|| champion_name(id, id_to_name))
    });
    suggestions
        .iter()
        .take(limit)
        .map(|s| DraftMatchupPlan {
            champion_id: s.champion_id,
            champion_name: s.champion_name.clone(),
            lane_opponent_id,
            lane_opponent_name: lane_opponent_name.clone(),
            summoner_spells: summoner_spells(my_role, enemy, lane_opponent, overrides),
            starting_item: starting_item(s, my_role, enemy, lane_opponent, overrides),
            first_recall: first_recall(s, my_role, enemy),
            rune_export: rune_export(s.runes.as_ref()),
            game_plan: plan_line(s, my_role, ally, enemy, lane_opponent),
            item_plan: if include_item_plans {
                Some(item_plan(
                    s,
                    my_role,
                    ally,
                    enemy,
                    lane_opponent,
                    meta_by_id,
                    item_catalog,
                    ugg_seed,
                    overrides,
                ))
            } else {
                None
            },
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: i32, name: &str, description: &str, tags: &[&str], total: f64) -> ItemLite {
        let mut maps = HashMap::new();
        maps.insert("11".to_string(), true);
        ItemLite {
            id,
            name: name.to_string(),
            description: description.to_string(),
            plaintext: String::new(),
            tags: tags.iter().map(|tag| tag.to_string()).collect(),
            stats: HashMap::new(),
            gold: Gold {
                base: total,
                total,
                sell: 0.0,
                purchasable: true,
            },
            from: None,
            into: None,
            maps,
            depth: None,
            required_champion: None,
            consumed: None,
            consume_on_full: None,
        }
    }

    #[test]
    fn item_classifier_detects_counter_tags() {
        let mortal = item(
            3033,
            "Mortal Reminder",
            "Applies Grievous Wounds and armor penetration.",
            &["Damage"],
            3000.0,
        );
        let profile = classify_item(&mortal);
        assert!(profile.tags.contains(&"ad".to_string()));
        assert!(profile.tags.contains(&"anti-heal".to_string()));
        assert!(profile.tags.contains(&"armor-pen".to_string()));

        let mercs = item(
            3111,
            "Mercury's Treads",
            "Grants magic resist and tenacity.",
            &["Boots"],
            1200.0,
        );
        let profile = classify_item(&mercs);
        assert_eq!(profile.phase, "boots");
        assert!(profile.tags.contains(&"mr".to_string()));
        assert!(profile.tags.contains(&"anti-cc".to_string()));
    }

    #[test]
    fn recommendable_item_filter_rejects_mode_only_rows() {
        let black_cleaver = item(
            3071,
            "Black Cleaver",
            "Attack damage and armor shred.",
            &["Damage", "Health"],
            3000.0,
        );
        let demon_crown = item(
            443056,
            "Demon King's Crown",
            "Arena-only scaling crown.",
            &["Health"],
            2500.0,
        );
        let protoplasm = item(
            2525,
            "Protoplasm Harness",
            "Current ranked health item.",
            &["Health"],
            2500.0,
        );
        let protoplasm_arena = item(
            222525,
            "Protoplasm Harness",
            "Arena-only duplicate.",
            &["Health"],
            2500.0,
        );
        let mut champion_locked = item(
            9005,
            "Champion Locked Item",
            "Champion specific item.",
            &["Damage"],
            2600.0,
        );
        champion_locked.required_champion = Some("ModeOnly".to_string());

        assert!(is_recommendable_sr_item(&black_cleaver));
        assert!(is_recommendable_sr_item(&protoplasm));
        assert!(!is_recommendable_sr_item(&demon_crown));
        assert!(!is_recommendable_sr_item(&protoplasm_arena));
        assert!(!is_recommendable_sr_item(&champion_locked));
    }

    #[test]
    fn matrix_generation_respects_limit() {
        let suggestions = (0..50)
            .map(|i| PickSuggestion {
                champion_id: i,
                champion_name: format!("Champ {i}"),
                score: 1.0,
                reasons: Vec::new(),
                runes: None,
                build_profile: Some(ChampionBuildProfile {
                    damage: "ad".to_string(),
                    archetype: "Marksman".to_string(),
                    build_hint: String::new(),
                    item_hint: None,
                    tags_line: "Marksman".to_string(),
                    partype: "Mana".to_string(),
                }),
            })
            .collect();
        let input = RustItemMatrixInput {
            snapshot: None,
            my_role: "bottom".to_string(),
            suggestions,
            id_to_name: Vec::new(),
            champion_meta_by_id: Vec::new(),
            enemy_role_inference: Vec::new(),
            item_catalog: vec![item(
                3006,
                "Berserker's Greaves",
                "attack speed boots",
                &["Boots"],
                1100.0,
            )],
            ugg_seed: UggSeed {
                patch: None,
                source: None,
                builds: Vec::new(),
            },
            champion_threat_overrides: Vec::new(),
            focus_champion_id: None,
            limit: None,
        };
        let rows = build_item_matrix_plans(&input);
        assert_eq!(rows.len(), 40);
    }

    #[test]
    fn dedupe_refs_collapses_duplicate_item_names() {
        let rows = vec![
            DraftItemRef {
                item_id: 3504,
                name: "Ardent Censer".to_string(),
                reason: "Default build path".to_string(),
                score: 100.0,
                tags: Vec::new(),
                phase: "completed".to_string(),
                cost: 2200.0,
            },
            DraftItemRef {
                item_id: 9504,
                name: "Ardent Censer".to_string(),
                reason: "situational option".to_string(),
                score: 90.0,
                tags: Vec::new(),
                phase: "completed".to_string(),
                cost: 2200.0,
            },
        ];
        let deduped = dedupe_refs(&rows, 8);
        assert_eq!(deduped.len(), 1);
        assert_eq!(deduped[0].item_id, 3504);
    }

    #[test]
    fn pure_marksman_fallback_does_not_force_specialist_on_hit_core() {
        let catalog = vec![
            item(
                6676,
                "The Collector",
                "Attack damage, critical strike, and armor penetration.",
                &["Damage", "CriticalStrike"],
                3000.0,
            ),
            item(
                3031,
                "Infinity Edge",
                "Attack damage and critical strike.",
                &["Damage", "CriticalStrike"],
                3500.0,
            ),
            item(
                3036,
                "Lord Dominik's Regards",
                "Attack damage, critical strike, and armor penetration.",
                &["Damage", "CriticalStrike"],
                3300.0,
            ),
            item(
                3124,
                "Guinsoo's Rageblade",
                "Attack damage, ability power, attack speed, and on-hit damage.",
                &["Damage", "SpellDamage", "AttackSpeed", "OnHit"],
                3000.0,
            ),
            item(
                3146,
                "Hextech Gunblade",
                "Attack damage, ability power, and omnivamp.",
                &["Damage", "SpellDamage"],
                3000.0,
            ),
            item(
                3087,
                "Statikk Shiv",
                "Attack damage, ability power, attack speed, and on-hit chain lightning.",
                &["Damage", "SpellDamage", "AttackSpeed", "OnHit"],
                3000.0,
            ),
        ];
        let profile = ChampionBuildProfile {
            damage: "ad".to_string(),
            archetype: "Marksman".to_string(),
            build_hint: "Crit carry.".to_string(),
            item_hint: Some("Default crit path.".to_string()),
            tags_line: "Marksman".to_string(),
            partype: "Mana".to_string(),
        };
        let plan = build_adaptive_item_plan(
            &catalog,
            AdaptiveItemContext {
                champion_name: "Caitlyn",
                role: "bottom",
                build_profile: Some(&profile),
                ally: AllyItemSignals {
                    magic: 1.0,
                    physical: 2.0,
                    frontline: 1.0,
                    engage: 1.0,
                    scaling: 2.0,
                    slots: 4,
                },
                enemy: EnemyItemSignals {
                    magic: 1.0,
                    physical: 2.0,
                    frontline: 2.0,
                    tanks: 1.0,
                    assassins: 1.0,
                    supports: 1.0,
                    dive: 1.0,
                    poke: 1.0,
                    pick: 1.0,
                    sustain: 1.0,
                    marksmen: 1.0,
                    hard_cc: 1.0,
                    healing: 1.0,
                    shielding: 1.0,
                    mobility: 1.0,
                    burst: 1.0,
                },
                enemy_details: Vec::new(),
                default_build: None,
                lane_threat: Some("ad".to_string()),
                fallback: DraftItemPlan {
                    core: "Fallback core".to_string(),
                    boots: "Fallback boots".to_string(),
                    defensive: "Fallback defense".to_string(),
                    situational: Vec::new(),
                    notes: Vec::new(),
                    default_build_source: None,
                    default_item_ids: None,
                    starting: None,
                    first_recall: None,
                    boot_choice: None,
                    boot_alternatives: None,
                    core_build: None,
                    final_build: None,
                    situational_items: None,
                    matrix_rows: None,
                    threat_summary: None,
                },
            },
        );
        let names: Vec<String> = plan
            .core_build
            .unwrap_or_default()
            .into_iter()
            .map(|row| row.name)
            .collect();
        assert_eq!(names.len(), 3);
        assert!(names.contains(&"Infinity Edge".to_string()));
        assert!(names.contains(&"Lord Dominik's Regards".to_string()));
        assert!(names.contains(&"The Collector".to_string()));
        assert!(!names.iter().any(|name| {
            name == "Guinsoo's Rageblade" || name == "Hextech Gunblade" || name == "Statikk Shiv"
        }));
    }

    #[test]
    fn recommend_api_scores_candidates() {
        let raw = recommend_picks_json(
            r#"{
                "snapshot":{
                    "ally":[{"role":"middle","championId":null,"championName":null,"cellId":1}],
                    "enemy":[{"role":"middle","championId":238,"championName":"Zed","cellId":null}],
                    "myTeam":null,
                    "myRole":"middle",
                    "localPlayerCellId":1,
                    "bans":[],
                    "myPickOrder":null
                },
                "myRole":"middle",
                "maxResults":2,
                "monteCarloSamples":0,
                "roleChampionPools":[{"role":"middle","championIds":[103,61]}],
                "publicCandidateIds":[{"role":"middle","championIds":[]}],
                "publicBaseRates":[
                    {"role":"middle","championId":103,"rate":0.54},
                    {"role":"middle","championId":61,"rate":0.50}
                ],
                "matchupBonuses":[{"candidateId":103,"enemyId":238,"bonus":2.0}],
                "enemyRoleInference":[{"enemyIndex":0,"roleProbabilities":{"top":0,"jungle":0,"middle":1,"bottom":0,"support":0}}],
                "idToName":[{"id":103,"name":"Ahri"},{"id":61,"name":"Orianna"},{"id":238,"name":"Zed"}]
            }"#,
        );
        assert!(raw.contains("\"ok\":true"));
        assert!(raw.contains("\"championId\":103"));
        assert!(raw.contains("\"patchLabel\":\"engine-v1\""));
    }

    #[test]
    fn rust_recommender_infers_enemy_roles_when_input_omits_posteriors() {
        let snapshot = DraftSnapshot {
            ally: Vec::new(),
            enemy: vec![
                SlotPick {
                    role: "bottom".to_string(),
                    champion_id: Some(67),
                    champion_name: Some("Vayne".to_string()),
                    cell_id: Some(5),
                },
                SlotPick {
                    role: "bottom".to_string(),
                    champion_id: Some(222),
                    champion_name: Some("Jinx".to_string()),
                    cell_id: Some(6),
                },
            ],
            my_team: None,
            my_role: Some("middle".to_string()),
            local_player_cell_id: None,
            bans: None,
            my_pick_order: None,
        };
        let role_pools = HashMap::from([
            ("top".to_string(), vec![67]),
            ("bottom".to_string(), vec![67, 222]),
        ]);
        let public_candidates = role_pools.clone();
        let posteriors = infer_recommend_enemy_posteriors(&snapshot, &role_pools, &public_candidates);
        let vayne = posteriors.get(&0).expect("vayne posterior");
        let jinx = posteriors.get(&1).expect("jinx posterior");

        assert!(vayne.get("top").copied().unwrap_or(0.0) > vayne.get("bottom").copied().unwrap_or(0.0));
        assert!(jinx.get("bottom").copied().unwrap_or(0.0) > 0.75);
    }

    #[test]
    fn score_champion_api_uses_trained_base_rates() {
        let raw = score_champion_json(
            r#"{
                "championId":103,
                "snapshot":{
                    "ally":[{"role":"middle","championId":null,"championName":null,"cellId":1}],
                    "enemy":[],
                    "myTeam":null,
                    "myRole":"middle",
                    "localPlayerCellId":1,
                    "bans":[],
                    "myPickOrder":null
                },
                "myRole":"middle",
                "roleChampionPools":[{"role":"middle","championIds":[103]}],
                "publicCandidateIds":[{"role":"middle","championIds":[]}],
                "trainedBaseRates":[{"role":"middle","championId":103,"logit":1.0}],
                "hasTrainedData":true,
                "idToName":[{"id":103,"name":"Ahri"}]
            }"#,
        );
        assert!(raw.contains("\"ok\":true"));
        assert!(raw.contains("\"patchLabel\":\"engine-v1+trained\""));
        assert!(raw.contains("\"base\":0.731"));
    }
}
