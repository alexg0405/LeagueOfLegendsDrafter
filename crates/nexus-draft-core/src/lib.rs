use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;

const MATRIX_PLAN_LIMIT: usize = 40;

#[wasm_bindgen]
pub fn build_item_matrix_plans_json(input_json: &str) -> String {
    match serde_json::from_str::<RustItemMatrixInput>(input_json) {
        Ok(input) => serde_json::to_string(&build_item_matrix_plans(&input)).unwrap_or_else(|err| {
            serde_json::json!({
                "error": format!("nexus-draft-core failed: {err}")
            })
            .to_string()
        }),
        Err(err) => serde_json::json!({
            "error": format!("nexus-draft-core failed: {err}")
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuneLoadoutHint {
    primary_tree: String,
    keystone: String,
    secondary: String,
    note: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
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

#[derive(Debug, Deserialize)]
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
    let id_to_name: HashMap<i32, String> = input.id_to_name.iter().map(|row| (row.id, row.name.clone())).collect();
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
    let ally_slots = input.snapshot.as_ref().map(|s| s.ally.as_slice()).unwrap_or(&[]);
    let enemy_slots = input.snapshot.as_ref().map(|s| s.enemy.as_slice()).unwrap_or(&[]);
    let ally = analyze_team(ally_slots, &id_to_name, &meta_by_id, &overrides);
    let enemy = analyze_team(enemy_slots, &id_to_name, &meta_by_id, &overrides);
    matchup_plans(
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
        MATRIX_PLAN_LIMIT,
    )
}

fn normalize_key(value: &str) -> String {
    value.chars().filter(|c| c.is_ascii_alphanumeric()).flat_map(|c| c.to_lowercase()).collect()
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
        (row.threat.clone(), row.classes.iter().map(|s| s.to_string()).collect())
    } else {
        let classes = tag_classes(&meta_by_id.get(&champion_id).map(|m| m.tags.as_slice()).unwrap_or(&[]));
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
        if best.map(|(_, best_score)| score > best_score).unwrap_or(true) {
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
    overrides.get(&normalize_key(name)).map(|row| row.threat.clone())
}

fn classes_for_name(name: &str, overrides: &HashMap<String, ThreatOverrideRow>) -> Vec<String> {
    overrides
        .get(&normalize_key(name))
        .map(|row| row.classes.clone())
        .unwrap_or_default()
}

fn summoner_spells(my_role: &str, enemy: &TeamRead, lane_opponent: Option<&SlotPick>, overrides: &HashMap<String, ThreatOverrideRow>) -> String {
    let heavy_cc = enemy.tanks + enemy.supports >= 2.0;
    let lane_assassin = lane_opponent
        .and_then(|slot| slot.champion_name.as_ref())
        .map(|name| classes_for_name(name, overrides).iter().any(|cls| cls == "assassin"))
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

fn starting_item(s: &PickSuggestion, my_role: &str, enemy: &TeamRead, lane_opponent: Option<&SlotPick>, overrides: &HashMap<String, ThreatOverrideRow>) -> String {
    let dmg = s.build_profile.as_ref().map(|p| p.damage.as_str());
    let lane_name = lane_opponent.and_then(|slot| slot.champion_name.as_deref()).unwrap_or("");
    let lane_classes = classes_for_name(lane_name, overrides);
    let lane_ranged = lane_classes.iter().any(|cls| cls == "marksman" || cls == "mage");
    match my_role {
        "jungle" => "Jungle pet start; consider early Gluttonous Greaves when sustain converts into tempo.".to_string(),
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
            "Doran's Helm is strong when you can use both resistances and last-hit help.".to_string()
        }
        "top" if lane_ranged => "Doran's Shield into ranged/poke lanes; trade health for wave control.".to_string(),
        "top" if dmg == Some("ap") => "Doran's Ring or Shield if the lane is hostile.".to_string(),
        "top" => "Doran's Blade for pressure, Shield for hard lanes.".to_string(),
        "middle" if enemy.assassins >= 1.0 => {
            "Doran's Shield/early defensive boots if burst can deny your first reset.".to_string()
        }
        "middle" if dmg == Some("ad") => "Long Sword/Doran's Blade for AD mids; Doran's Ring or Tear for mages.".to_string(),
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
            "Boots plus MR/clear component; sustain boots are viable after a winning first clear.".to_string()
        } else {
            "Boots plus damage/clear component; Gluttonous Greaves can snowball skirmish sustain.".to_string()
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
    "Boots plus core component; buy resist shards if the inferred lane opponent is the real threat.".to_string()
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
            "Sustained DPS core first, then an anti-tank slot before the third major fight.".to_string()
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
        return "Early movement boots for tempo, then upgrade toward the enemy damage split.".to_string();
    }
    if has_suggestion_class(s, "mage") {
        return "Sorcerer's or haste boots for tempo; swap to Mercs if CC prevents spell rotations.".to_string();
    }
    if has_suggestion_class(s, "marksman") {
        return "Attack-speed or Swifties-style boots unless burst forces Steelcaps or Mercs.".to_string();
    }
    "Use champion-standard boots, then pivot to Mercs or Steelcaps when one damage type is stacked.".to_string()
}

fn defensive_item_plan(s: &PickSuggestion, enemy: &TeamRead, lane_opponent: Option<&SlotPick>, overrides: &HashMap<String, ThreatOverrideRow>) -> String {
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
        return "Buy an early MR component if the AP lane or jungle can burst your first reset.".to_string();
    }
    if physical >= 4.0 || lane_threat.as_deref() == Some("ad") {
        return "Buy armor before the second big fight if AD damage is stacked or lane trades are unavoidable.".to_string();
    }
    if enemy.poke >= 3.0 {
        return "Sustain and safer recalls matter into poke; do not delay defense just to finish a greedy component.".to_string();
    }
    "Default defense can wait, but keep gold flexible for the enemy carry who gets ahead first.".to_string()
}

fn situational_item_plans(s: &PickSuggestion, my_role: &str, ally: &TeamRead, enemy: &TeamRead) -> Vec<String> {
    let mut lines = Vec::new();
    let (ally_magic, ally_physical) = team_damage_counts(ally);
    if enemy.frontline >= 3.0 || enemy.tanks >= 2.0 {
        if has_suggestion_class(s, "mage") || s.build_profile.as_ref().map(|p| p.damage.as_str()) == Some("ap") {
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
    if enemy.supports >= 2.0 && (has_suggestion_class(s, "assassin") || s.build_profile.as_ref().map(|p| p.damage.as_str()) == Some("ad")) {
        add_unique(&mut lines, "Shield pressure: consider shield-break or target the enchanter first if shields block burst windows.");
    }
    if enemy.poke >= 3.0 {
        add_unique(&mut lines, "Poke answer: choose sustain, engage speed, or waveclear before grouping for neutral objectives.");
    }
    if enemy.assassins >= 2.0
        && (my_role == "bottom" || my_role == "middle" || has_suggestion_class(s, "marksman") || has_suggestion_class(s, "mage"))
    {
        add_unique(&mut lines, "Anti-burst: a defensive second or third item is usually better than one more damage component.");
    }
    if ally.slots.len() >= 3 && ally_magic < 1.0 && can_add_magic_damage(s) {
        add_unique(&mut lines, "Team damage: lean into the AP or magic-damage path so armor stacking is punishable.");
    }
    if ally.slots.len() >= 3 && ally_physical < 1.0 && can_add_physical_damage(s) {
        add_unique(&mut lines, "Team damage: preserve physical DPS instead of over-indexing on utility or tank stats.");
    }
    if ally.slots.len() >= 3 && ally.frontline < 1.0 && (has_suggestion_class(s, "tank") || has_suggestion_class(s, "fighter")) {
        add_unique(&mut lines, "Team shape: a bulkier frontline build may be worth more than maximum personal damage.");
    }
    if ally.engage < 1.0 && my_role == "support" {
        add_unique(&mut lines, "Team shape: prioritize an engage or pick tool if your team has no reliable fight starter.");
    }
    lines.into_iter().take(5).collect()
}

fn item_notes(s: &PickSuggestion, my_role: &str, ally: &TeamRead, enemy: &TeamRead, lane_opponent: Option<&SlotPick>, overrides: &HashMap<String, ThreatOverrideRow>) -> Vec<String> {
    let mut notes = Vec::new();
    let (ally_magic, ally_physical) = team_damage_counts(ally);
    if let Some(name) = lane_opponent.and_then(|slot| slot.champion_name.as_deref()) {
        match threat_for_name(name, overrides).as_deref() {
            Some("ap") => add_unique(&mut notes, &format!("Lane check: {name} is AP-leaning; do not ignore early MR.")),
            Some("ad") => add_unique(&mut notes, &format!("Lane check: {name} is AD-leaning; armor boots/components are live options.")),
            Some("utility") => add_unique(&mut notes, &format!("Lane check: {name} brings setup; value tenacity, spacing, and vision.")),
            _ => {}
        }
    }
    if ally.slots.len() >= 3 && ally_magic < 1.0 && !can_add_magic_damage(s) {
        add_unique(&mut notes, "Team warning: allies are light on magic damage, so avoid low-value physical damage when behind.");
    }
    if ally.slots.len() >= 3 && ally_physical < 1.0 && !can_add_physical_damage(s) {
        add_unique(&mut notes, "Team warning: allies are light on physical DPS; protect whoever can hit objectives.");
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
    for ch in value.replace("&nbsp;", " ").replace("&#160;", " ").replace("&amp;", "&").chars() {
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
    needles.iter().any(|needle| text.contains(&needle.to_lowercase()))
}

fn stat(item: &ItemLite, key: &str) -> f64 {
    item.stats.get(key).copied().filter(|n| n.is_finite()).unwrap_or(0.0)
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
    let component = !boot && !starter && item.into.as_ref().map(|rows| !rows.is_empty()).unwrap_or(false);
    let completed = !boot
        && !starter
        && !consumable
        && (!item.into.as_ref().map(|rows| !rows.is_empty()).unwrap_or(false)
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
    add_tag(&mut tags, stat(item, "FlatPhysicalDamageMod") > 0.0 || riot_tags.iter().any(|t| t == "damage") || has_any(&lower, &["attack damage"]), "ad");
    add_tag(&mut tags, stat(item, "FlatMagicDamageMod") > 0.0 || riot_tags.iter().any(|t| t == "spell_damage") || has_any(&lower, &["ability power"]), "ap");
    add_tag(&mut tags, stat(item, "FlatArmorMod") > 0.0 || has_any(&lower, &["armor"]), "armor");
    add_tag(&mut tags, stat(item, "FlatSpellBlockMod") > 0.0 || has_any(&lower, &["magic resist"]), "mr");
    add_tag(&mut tags, stat(item, "FlatHPPoolMod") > 0.0 || has_any(&lower, &["health"]), "health");
    add_tag(&mut tags, stat(item, "FlatMPPoolMod") > 0.0 || has_any(&lower, &["mana"]), "mana");
    add_tag(&mut tags, stat(item, "PercentAttackSpeedMod") > 0.0 || riot_tags.iter().any(|t| t == "attack_speed") || has_any(&lower, &["attack speed"]), "attack-speed");
    add_tag(&mut tags, stat(item, "FlatCritChanceMod") > 0.0 || riot_tags.iter().any(|t| t == "critical_strike") || has_any(&lower, &["critical strike", "crit chance"]), "crit");
    add_tag(&mut tags, stat(item, "FlatMovementSpeedMod") > 0.0 || boot || has_any(&lower, &["move speed", "movement speed"]), "move-speed");
    add_tag(&mut tags, has_any(&lower, &["ability haste", "haste", "cooldown"]), "haste");
    add_tag(&mut tags, has_any(&lower, &["life steal", "lifesteal", "omnivamp", "vamp"]), "lifesteal");
    add_tag(&mut tags, has_any(&lower, &["lethality"]), "lethality");
    add_tag(&mut tags, has_any(&lower, &["magic penetration", "magic pen"]), "magic-pen");
    add_tag(&mut tags, has_any(&lower, &["armor penetration", "armor pen", "armor reduction", "armor shred"]), "armor-pen");
    add_tag(&mut tags, has_any(&lower, &["grievous wounds"]) || ["executioner", "oblivion orb", "bramble vest", "mortal reminder", "morellonomicon", "thornmail"].iter().any(|needle| name.contains(needle)), "anti-heal");
    add_tag(&mut tags, has_any(&lower, &["shield reaver"]) || name.contains("serpent's fang"), "anti-shield");
    add_tag(&mut tags, has_any(&lower, &["percent health", "maximum health", "current health", "burn"]) || ["black cleaver", "liandry", "void staff", "cryptbloom", "terminus", "lord dominik", "blade of the ruined king", "kraken"].iter().any(|needle| name.contains(needle)), "anti-tank");
    add_tag(&mut tags, has_any(&lower, &["stasis", "spell shield", "lifeline", "resurrect", "revives"]) || ["zhonya", "banshee", "guardian angel", "shieldbow", "sterak", "maw of malmortius", "death's dance", "jak", "randuin"].iter().any(|needle| name.contains(needle)), "anti-burst");
    add_tag(&mut tags, has_any(&lower, &["tenacity", "slow resist", "cleanse", "quicksilver", "remove all crowd control"]) || ["mercury", "mikael", "merc scimitar", "qss"].iter().any(|needle| name.contains(needle)), "anti-cc");
    let has_lifesteal_tag = tags.contains("lifesteal");
    add_tag(&mut tags, has_any(&lower, &["regeneration", "regen", "heal and shield power", "redemption", "warmog"]) || has_lifesteal_tag, "sustain");
    add_tag(&mut tags, riot_tags.iter().any(|t| t == "goldper" || t == "vision") || has_any(&lower, &["ward", "support quest", "heal and shield power"]), "support");
    add_tag(&mut tags, has_any(&lower, &["jungle monster", "jungle companion", "smite"]) || ["scorchclaw", "gustwalker", "mosstomper"].iter().any(|needle| name.contains(needle)), "jungle");
    add_tag(&mut tags, has_any(&lower, &["shield", "heal and shield power", "ally"]), "enchanter");
    add_tag(&mut tags, has_any(&lower, &["on-hit", "basic attacks", "attack speed"]), "marksman");
    add_tag(&mut tags, has_any(&lower, &["ability power", "magic damage", "mana"]), "mage");
    let has_ad_tag = tags.contains("ad");
    let has_ap_tag = tags.contains("ap");
    let has_health_tag = tags.contains("health");
    let has_haste_tag = tags.contains("haste");
    let has_lethality_tag = tags.contains("lethality");
    add_tag(&mut tags, has_any(&lower, &["armor", "magic resist", "health"]) && !has_ad_tag && !has_ap_tag, "tank");
    add_tag(&mut tags, has_ad_tag && (has_health_tag || has_lifesteal_tag || has_haste_tag), "bruiser");
    add_tag(&mut tags, has_lethality_tag || has_any(&lower, &["burst", "dash"]), "assassin");

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
        "stun", "root", "snare", "charm", "fear", "taunt", "knock up", "knocked up", "airborne",
        "suppress", "suppression", "sleep", "polymorph", "silence", "daze",
    ]
    .iter()
    .any(|needle| text.contains(needle));
    let heal = ["heal", "restore health", "regenerate"].iter().any(|needle| text.contains(needle));
    KitProfile {
        hard_cc,
        shield: text.contains("shield") || text.contains("barrier"),
        heal,
        mobility: ["dash", "blink", "leap", "teleport", "lunge", "vault", "charge"]
            .iter()
            .any(|needle| text.contains(needle)),
        poke: ["range", "missile", "projectile", "poke", "line", "beam", "long range"]
            .iter()
            .any(|needle| text.contains(needle)),
        burst: ["burst", "detonate", "explod", "critical", "execute", "bonus damage"]
            .iter()
            .any(|needle| text.contains(needle)),
        sustain: heal || ["life steal", "omnivamp", "regenerate"].iter().any(|needle| text.contains(needle)),
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

fn team_kit_signals(team: &TeamRead, meta_by_id: &HashMap<i32, ChampionMeta>) -> (f64, f64, f64, f64, f64) {
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
    } else if item.into.as_ref().map(|rows| !rows.is_empty()).unwrap_or(false) {
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

fn default_refs_for(ids: Option<&Vec<i32>>, by_id: &HashMap<i32, ItemLite>, bucket: &str) -> Vec<DraftItemRef> {
    ids.map(|ids| {
        ids.iter()
            .enumerate()
            .filter_map(|(idx, id)| by_id.get(id).map(|item| default_ref_for(item, bucket, 100.0 - idx as f64)))
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

fn get_ugg_default_item_build(champion_id: i32, role: &str, item_catalog: &[ItemLite], ugg_seed: &UggSeed) -> Option<DefaultBuild> {
    if role == "unknown" || item_catalog.is_empty() {
        return None;
    }
    let row = ugg_seed
        .builds
        .iter()
        .find(|entry| entry.champion_id == champion_id && entry.role == role)?;
    let by_id: HashMap<i32, ItemLite> = item_catalog.iter().map(|item| (item.id, item.clone())).collect();
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
            let default_build = get_ugg_default_item_build(slot.champion_id, &slot.role, item_catalog, ugg_seed);
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

fn score_item(item: &ItemLite, profile: &ItemProfile, ctx: &AdaptiveItemContext) -> f64 {
    let p = &profile.tags;
    let classes = champion_classes(ctx.build_profile);
    let damage = ctx.build_profile.map(|profile| profile.damage.as_str()).unwrap_or("flex");
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
        score += if includes(p, "ap") { 22.0 } else if includes(p, "ad") { -26.0 } else { 0.0 };
    }
    if damage == "ad" {
        score += if includes(p, "ad") { 22.0 } else if includes(p, "ap") { -26.0 } else { 0.0 };
    }
    if damage == "mixed" || damage == "flex" {
        score += if includes(p, "ap") || includes(p, "ad") { 12.0 } else { 0.0 };
    }
    if includes(&classes, "marksman") {
        score += if includes(p, "marksman") || includes(p, "crit") || includes(p, "attack-speed") || includes(p, "ad") {
            13.0
        } else {
            0.0
        };
    }
    if includes(&classes, "mage") {
        score += if includes(p, "mage") || includes(p, "ap") || includes(p, "mana") || includes(p, "haste") {
            13.0
        } else {
            0.0
        };
    }
    if includes(&classes, "fighter") {
        score += if includes(p, "bruiser") || includes(p, "health") || includes(p, "ad") || includes(p, "lifesteal") {
            11.0
        } else {
            0.0
        };
    }
    if includes(&classes, "tank") {
        score += if includes(p, "tank") || includes(p, "health") || includes(p, "armor") || includes(p, "mr") {
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
        score += if includes(p, "assassin") || includes(p, "lethality") || includes(p, "ad") || includes(p, "ap") {
            10.0
        } else {
            0.0
        };
    }
    if ctx.enemy.magic >= 3.0 || ctx.lane_threat.as_deref() == Some("ap") {
        score += if includes(p, "mr") { 17.0 } else { 0.0 };
    }
    if ctx.enemy.physical >= 3.0 || ctx.lane_threat.as_deref() == Some("ad") || ctx.enemy.marksmen >= 2.0 {
        score += if includes(p, "armor") { 17.0 } else { 0.0 };
    }
    if ctx.enemy.hard_cc >= 2.0 || ctx.enemy.pick >= 3.0 {
        score += if includes(p, "anti-cc") { 18.0 } else { 0.0 };
    }
    if ctx.enemy.healing >= 2.0 || ctx.enemy.sustain >= 2.0 || ctx.enemy.supports >= 2.0 {
        score += if includes(p, "anti-heal") { 22.0 } else { 0.0 };
    }
    if ctx.enemy.shielding >= 2.0 || ctx.enemy.supports >= 2.0 {
        score += if includes(p, "anti-shield") { 18.0 } else { 0.0 };
    }
    if ctx.enemy.frontline >= 3.0 || ctx.enemy.tanks >= 2.0 {
        score += if includes(p, "anti-tank") || includes(p, "armor-pen") || includes(p, "magic-pen") {
            21.0
        } else {
            0.0
        };
    }
    if ctx.enemy.assassins >= 2.0 || ctx.enemy.dive >= 3.0 || ctx.enemy.burst >= 2.0 {
        score += if includes(p, "anti-burst") || includes(p, "health") { 18.0 } else { 0.0 };
    }
    if ctx.enemy.poke >= 3.0 {
        score += if includes(p, "sustain") || includes(p, "move-speed") { 12.0 } else { 0.0 };
    }
    if ctx.ally.magic < 1.0 {
        score += if includes(p, "ap") { 12.0 } else if includes(p, "ad") { -5.0 } else { 0.0 };
    }
    if ctx.ally.physical < 1.0 {
        score += if includes(p, "ad") { 12.0 } else if includes(p, "ap") { -5.0 } else { 0.0 };
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
        if includes(p, "mr") && (enemy.threat == "ap" || enemy.threat == "hybrid" || classes.contains("mage")) {
            push_target(&mut targets, target(enemy, &base_name, "magic damage", "teamThreat"));
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
                target(enemy, &base_name, if classes.contains("marksman") { "crit DPS" } else { "physical damage" }, "teamThreat"),
            );
        }
        if includes(p, "anti-heal")
            && (enemy.healing || classes.contains("support") || default_tags.contains("lifesteal") || default_tags.contains("sustain"))
        {
            let default_sustain = default_tags.contains("lifesteal") || default_tags.contains("sustain");
            push_target(&mut targets, target(enemy, &base_name, if default_sustain { "default sustain" } else { "healing" }, if default_sustain { "defaultBuild" } else { "kit" }));
        }
        if includes(p, "anti-shield") && (enemy.shielding || classes.contains("support") || default_tags.contains("anti-burst")) {
            let defensive_default = default_tags.contains("anti-burst");
            push_target(&mut targets, target(enemy, &base_name, if defensive_default { "defensive default" } else { "shields" }, if defensive_default { "defaultBuild" } else { "kit" }));
        }
        if includes(p, "anti-tank") && (classes.contains("tank") || classes.contains("fighter") || default_tags.contains("health") || default_tags.contains("tank")) {
            let health_stack = default_tags.contains("health") || default_tags.contains("tank");
            push_target(&mut targets, target(enemy, &base_name, if health_stack { "health stack" } else { "frontline" }, if health_stack { "defaultBuild" } else { "teamThreat" }));
        }
        if includes(p, "armor-pen") && (classes.contains("tank") || classes.contains("fighter") || enemy.threat == "ad" || default_tags.contains("armor")) {
            push_target(&mut targets, target(enemy, &base_name, if default_tags.contains("armor") { "armor stack" } else { "frontline armor" }, if default_tags.contains("armor") { "defaultBuild" } else { "teamThreat" }));
        }
        if includes(p, "magic-pen")
            && (classes.contains("tank")
                || classes.contains("fighter")
                || enemy.threat == "ap"
                || enemy.threat == "hybrid"
                || default_tags.contains("mr"))
        {
            push_target(&mut targets, target(enemy, &base_name, if default_tags.contains("mr") { "MR stack" } else { "frontline MR" }, if default_tags.contains("mr") { "defaultBuild" } else { "teamThreat" }));
        }
        if includes(p, "anti-burst")
            && (enemy.burst || classes.contains("assassin") || enemy.mobility || default_tags.contains("crit") || default_tags.contains("attack-speed"))
        {
            let default_dps = default_tags.contains("crit") || default_tags.contains("attack-speed");
            push_target(&mut targets, target(enemy, &base_name, if default_dps { "default DPS path" } else { "burst/dive" }, if default_dps { "defaultBuild" } else { "kit" }));
        }
        if includes(p, "anti-cc") && (enemy.hard_cc || classes.contains("tank") || classes.contains("support")) {
            push_target(&mut targets, target(enemy, &base_name, "hard CC", "kit"));
        }
        if includes(p, "sustain") && (enemy.poke || classes.contains("mage") || classes.contains("marksman")) {
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
    for tag in ["anti-heal", "anti-shield", "anti-tank", "anti-burst", "anti-cc", "armor", "mr", "sustain"] {
        if includes(&profile.tags, tag) {
            reasons.push(format!("answers {}", tag_reason(tag)));
        }
    }
    let expected_damage = if ctx.build_profile.map(|p| p.damage.as_str()) == Some("ap") { "ap" } else { "ad" };
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
        reasons.push(if score >= 70.0 { "strong general fit" } else { "situational option" }.to_string());
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
    rows.iter().filter(|row| row.phase() == phase).take(limit).cloned().collect()
}

trait HasPhase {
    fn phase(&self) -> &str;
    fn item_id(&self) -> i32;
}

impl HasPhase for DraftItemRef {
    fn phase(&self) -> &str {
        &self.phase
    }
    fn item_id(&self) -> i32 {
        self.item_id
    }
}

impl HasPhase for DraftItemMatrixRow {
    fn phase(&self) -> &str {
        &self.phase
    }
    fn item_id(&self) -> i32 {
        self.item_id
    }
}

fn dedupe_refs<T: Clone + HasPhase>(rows: &[T], limit: usize) -> Vec<T> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for row in rows {
        if !seen.insert(row.item_id()) {
            continue;
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
        out.push(threat("Heavy AP", "danger", "Enemy magic damage is stacked."));
    }
    if ctx.enemy.physical >= 3.0 || ctx.enemy.marksmen >= 2.0 {
        out.push(threat("Heavy AD", "danger", "Enemy physical damage is stacked."));
    }
    if ctx.enemy.hard_cc >= 2.0 || ctx.enemy.pick >= 3.0 {
        out.push(threat("Hard CC", "danger", "Enemy lockdown can deny rotations."));
    }
    if ctx.enemy.healing >= 2.0 || ctx.enemy.sustain >= 2.0 {
        out.push(threat("Healing", "warning", "Anti-heal gains value."));
    }
    if ctx.enemy.shielding >= 2.0 {
        out.push(threat("Shields", "warning", "Shield pressure or target selection matters."));
    }
    if ctx.enemy.frontline >= 3.0 || ctx.enemy.tanks >= 2.0 {
        out.push(threat("Frontline", "warning", "Anti-tank damage gains value."));
    }
    if ctx.enemy.dive >= 3.0 || ctx.enemy.assassins >= 2.0 {
        out.push(threat("Dive", "danger", "Defensive slots are high value."));
    }
    if ctx.enemy.poke >= 3.0 {
        out.push(threat("Poke", "warning", "Sustain, engage speed, or waveclear helps."));
    }
    if ctx.ally.magic < 1.0 && ctx.ally.slots >= 3 {
        out.push(threat("Missing AP", "info", "Your team may need magic damage."));
    }
    if ctx.ally.physical < 1.0 && ctx.ally.slots >= 3 {
        out.push(threat("Missing AD", "info", "Your team may need physical DPS."));
    }
    if ctx.ally.frontline < 1.0 && ctx.ally.slots >= 3 {
        out.push(threat("No Frontline", "info", "Bulkier builds can stabilize fights."));
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
        .map(|item| {
            let profile = classify_item(item);
            let score = score_item(item, &profile, &ctx);
            (item.clone(), profile, score)
        })
        .filter(|(item, profile, score)| *score > 20.0 && item.gold.total > 0.0 && item.consumed != Some(true) && profile.phase != "consumable")
        .collect();
    scored.sort_by(|a, b| {
        b.2.partial_cmp(&a.2)
            .unwrap_or(Ordering::Equal)
            .then_with(|| b.0.gold.total.partial_cmp(&a.0.gold.total).unwrap_or(Ordering::Equal))
            .then_with(|| a.0.name.cmp(&b.0.name))
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
        .unwrap_or_else(|| top_refs(&adaptive_rows, "starter", 2).iter().map(matrix_to_ref).collect());
    let first_recall: Vec<DraftItemRef> = top_refs(&adaptive_rows, "component", 3).iter().map(matrix_to_ref).collect();
    let boots: Vec<DraftItemRef> = ctx
        .default_build
        .as_ref()
        .filter(|b| !b.boots.is_empty())
        .map(|b| b.boots.iter().take(3).cloned().collect())
        .unwrap_or_else(|| top_refs(&adaptive_rows, "boots", 3).iter().map(matrix_to_ref).collect());
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
            dedupe_refs(&filtered, 3).iter().map(matrix_to_ref).collect()
        });
    let situational_source: Vec<DraftItemMatrixRow> = adaptive_rows
        .iter()
        .filter(|row| {
            row.tags.iter().any(|tag| {
                matches!(
                    tag.as_str(),
                    "anti-heal" | "anti-shield" | "anti-tank" | "anti-burst" | "anti-cc" | "armor" | "mr" | "sustain"
                )
            })
        })
        .cloned()
        .collect();
    let situational_items: Vec<DraftItemRef> = dedupe_refs(&situational_source, 8).iter().map(matrix_to_ref).collect();
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
            dedupe_refs(&rows, 12).into_iter().map(|row| row.item_id).collect()
        });
    let names = |rows: &[DraftItemRef]| rows.iter().map(|row| row.name.clone()).collect::<Vec<_>>().join(" -> ");
    let threats = threat_summary(&ctx);
    let mut notes = Vec::new();
    if !threats.is_empty() {
        notes.push(format!(
            "Threats: {}.",
            threats.iter().map(|threat| threat.label.clone()).collect::<Vec<_>>().join(", ")
        ));
    }
    notes.extend(ctx.fallback.notes.clone());
    notes.truncate(4);
    DraftItemPlan {
        core: if core_build.is_empty() { ctx.fallback.core } else { names(&core_build) },
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
        default_build_source: Some(if ctx.default_build.is_some() { "ugg" } else { "adaptive" }.to_string()),
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
            let note = runes.note.as_ref().map(|note| format!(" - {note}")).unwrap_or_default();
            format!("{}: {} / Secondary: {}{}", runes.primary_tree, runes.keystone, runes.secondary, note)
        }
    }
}

fn plan_line(s: &PickSuggestion, my_role: &str, ally: &TeamRead, enemy: &TeamRead, lane_opponent: Option<&SlotPick>) -> String {
    let lane = lane_opponent
        .and_then(|slot| slot.champion_name.as_ref())
        .map(|name| format!(" into {name}"))
        .unwrap_or_default();
    if my_role == "jungle" {
        return if ally.engage >= 2.0 {
            "Path toward lanes with setup, then chain objectives after first successful fight.".to_string()
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
        return format!("Use the lane edge{lane} to get first move; do not trade it for low-value roams.");
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
            item_plan: Some(item_plan(
                s,
                my_role,
                ally,
                enemy,
                lane_opponent,
                meta_by_id,
                item_catalog,
                ugg_seed,
                overrides,
            )),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: i32, name: &str, description: &str, tags: &[&str], total: f64) -> ItemLite {
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
            maps: HashMap::new(),
            depth: None,
            required_champion: None,
            consumed: None,
            consume_on_full: None,
        }
    }

    #[test]
    fn item_classifier_detects_counter_tags() {
        let mortal = item(3033, "Mortal Reminder", "Applies Grievous Wounds and armor penetration.", &["Damage"], 3000.0);
        let profile = classify_item(&mortal);
        assert!(profile.tags.contains(&"ad".to_string()));
        assert!(profile.tags.contains(&"anti-heal".to_string()));
        assert!(profile.tags.contains(&"armor-pen".to_string()));

        let mercs = item(3111, "Mercury's Treads", "Grants magic resist and tenacity.", &["Boots"], 1200.0);
        let profile = classify_item(&mercs);
        assert_eq!(profile.phase, "boots");
        assert!(profile.tags.contains(&"mr".to_string()));
        assert!(profile.tags.contains(&"anti-cc".to_string()));
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
            item_catalog: vec![item(3006, "Berserker's Greaves", "attack speed boots", &["Boots"], 1100.0)],
            ugg_seed: UggSeed { patch: None, source: None, builds: Vec::new() },
            champion_threat_overrides: Vec::new(),
        };
        let rows = build_item_matrix_plans(&input);
        assert_eq!(rows.len(), 40);
    }
}
