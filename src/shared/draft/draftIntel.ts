import { getChampionThreatOverride, type ClassLabel, type ThreatLabel } from './championThreatOverrides'
import {
  getPublicMetaStatsLabel,
  publicMetaBaseStatsForChampion,
  publicMetaBaseStatsForRole,
  publicMetaRoleDistributionForChampion,
  type PublicMetaBaseStat,
  type RoleKey
} from './metaStats'
import { buildAdaptiveItemPlan, championKitProfileFromTexts } from './itemIntelligence'
import { resolveChampionName } from './championNameFallback'
import type { ChampionSpellLite, ItemLite } from '../dataDragon'
import type {
  ChampionPoolPreference,
  DraftIntel,
  DraftItemPlan,
  DraftRole,
  DraftSnapshot,
  EnemyRoleInference,
  PickSuggestion,
  RuneLoadoutHint,
  SlotPick
} from './types'

const ROLE_KEYS = ['top', 'jungle', 'middle', 'bottom', 'support'] as const
const PATCH_DATA_NOTE = 'Current-patch Emerald+ public meta seed; early-patch winrates can move as games accumulate.'

type ChampionMeta = { tags: string[]; partype: string; passive?: ChampionSpellLite; spells?: ChampionSpellLite[] }

export type BuildDraftIntelArgs = {
  snapshot: DraftSnapshot | null
  myRole: DraftRole
  suggestions: PickSuggestion[]
  idToName: ReadonlyMap<number, string> | null
  championMetaById?: ReadonlyMap<number, ChampionMeta> | null
  enemyRoleInference?: EnemyRoleInference[] | null
  patchLabel?: string | null
  dataDragonVersion?: string | null
  championPoolPreferences?: ReadonlyMap<number, ChampionPoolPreference> | null
  itemCatalog?: readonly ItemLite[] | null
}

type SlotRead = {
  slot: SlotPick
  championId: number
  name: string
  threat: ThreatLabel
  classes: Set<ClassLabel>
}

type TeamRead = {
  ad: number
  ap: number
  hybrid: number
  utility: number
  frontline: number
  engage: number
  poke: number
  pick: number
  dive: number
  scaling: number
  sustain: number
  marksmen: number
  mages: number
  assassins: number
  supports: number
  tanks: number
  fighters: number
  slots: SlotRead[]
}

export function championPoolPreferenceToComfort(pref: ChampionPoolPreference): number {
  switch (pref) {
    case 'main':
      return 0.66
    case 'comfortable':
      return 0.58
    case 'learning':
      return 0.48
    case 'never':
      return 0.18
  }
}

function roleLabel(role: DraftRole): string {
  if (role === 'middle') return 'mid'
  if (role === 'bottom') return 'adc'
  return role
}

function championName(championId: number, idToName: ReadonlyMap<number, string> | null): string {
  return idToName?.get(championId) ?? resolveChampionName(championId, idToName)
}

function tagClasses(tags: string[] | undefined): Set<ClassLabel> {
  const out = new Set<ClassLabel>()
  for (const tag of tags ?? []) {
    const t = tag.toLowerCase()
    if (t === 'fighter') out.add('fighter')
    if (t === 'mage') out.add('mage')
    if (t === 'marksman') out.add('marksman')
    if (t === 'tank') out.add('tank')
    if (t === 'support') out.add('support')
    if (t === 'assassin') out.add('assassin')
  }
  return out
}

function inferThreatFromTags(classes: Set<ClassLabel>): ThreatLabel {
  if (classes.has('marksman') || classes.has('assassin')) {
    return 'ad'
  }
  if (classes.has('mage')) {
    return 'ap'
  }
  if (classes.has('tank') || classes.has('support')) {
    return 'utility'
  }
  if (classes.has('fighter')) {
    return 'ad'
  }
  return 'hybrid'
}

function readSlot(
  slot: SlotPick,
  idToName: ReadonlyMap<number, string> | null,
  championMetaById: ReadonlyMap<number, ChampionMeta> | null | undefined
): SlotRead | null {
  if (slot.championId == null || slot.championId <= 0) {
    return null
  }
  const name = slot.championName?.trim() || championName(slot.championId, idToName)
  const override = getChampionThreatOverride(name)
  const classes = override ? new Set<ClassLabel>(override.classes) : tagClasses(championMetaById?.get(slot.championId)?.tags)
  return {
    slot,
    championId: slot.championId,
    name,
    threat: override?.threat ?? inferThreatFromTags(classes),
    classes
  }
}

function analyzeTeam(
  slots: SlotPick[],
  idToName: ReadonlyMap<number, string> | null,
  championMetaById: ReadonlyMap<number, ChampionMeta> | null | undefined
): TeamRead {
  const reads = slots
    .map((slot) => readSlot(slot, idToName, championMetaById))
    .filter((slot): slot is SlotRead => slot != null)
  const team: TeamRead = {
    ad: 0,
    ap: 0,
    hybrid: 0,
    utility: 0,
    frontline: 0,
    engage: 0,
    poke: 0,
    pick: 0,
    dive: 0,
    scaling: 0,
    sustain: 0,
    marksmen: 0,
    mages: 0,
    assassins: 0,
    supports: 0,
    tanks: 0,
    fighters: 0,
    slots: reads
  }
  for (const read of reads) {
    team[read.threat] += 1
    const c = read.classes
    if (c.has('tank')) team.tanks += 1
    if (c.has('fighter')) team.fighters += 1
    if (c.has('mage')) team.mages += 1
    if (c.has('marksman')) team.marksmen += 1
    if (c.has('support')) team.supports += 1
    if (c.has('assassin')) team.assassins += 1
    if (c.has('tank') || c.has('fighter')) team.frontline += 1
    if (c.has('tank') || c.has('fighter') || c.has('assassin')) team.engage += 1
    if (c.has('mage') || c.has('marksman')) team.poke += 1
    if (c.has('assassin') || c.has('support') || c.has('mage')) team.pick += 1
    if (c.has('assassin') || c.has('fighter') || c.has('tank')) team.dive += 1
    if (c.has('marksman') || c.has('mage')) team.scaling += 1
    if (c.has('support') || c.has('tank')) team.sustain += 1
  }
  return team
}

function identityLabels(team: TeamRead, side: 'ally' | 'enemy'): string[] {
  const labels: string[] = []
  if (team.frontline >= 2 && team.scaling >= 2) labels.push('front-to-back')
  if (team.poke >= 3) labels.push('poke/siege')
  if (team.dive >= 3) labels.push('dive')
  if (team.pick >= 3) labels.push('pick')
  if (team.scaling >= 3) labels.push('scaling')
  if (team.assassins >= 2) labels.push('burst')
  if (team.supports >= 2 || (side === 'ally' && team.sustain >= 2)) labels.push('protect/counter-engage')
  if (labels.length === 0 && team.slots.length > 0) labels.push('balanced')
  return labels.slice(0, 4)
}

function allyMissingAndWarnings(ally: TeamRead, enemy: TeamRead, myRole: DraftRole): { missing: string[]; warnings: string[] } {
  const missing: string[] = []
  const warnings: string[] = []
  const magicCount = ally.ap + ally.hybrid * 0.5
  const physicalCount = ally.ad + ally.hybrid * 0.5
  if (ally.slots.length >= 3 && magicCount < 1) missing.push('magic damage')
  if (ally.slots.length >= 3 && physicalCount < 1) missing.push('physical DPS')
  if (ally.slots.length >= 3 && ally.frontline < 1) missing.push('frontline')
  if (ally.slots.length >= 3 && ally.engage < 1) missing.push('reliable engage')
  if (enemy.assassins >= 2) warnings.push('Enemy has multiple backline threats; value peel, Exhaust, Stopwatch, or defensive boots.')
  if (enemy.poke >= 3) warnings.push('Enemy poke is high; avoid slow drafts with no engage or sustain.')
  if (enemy.frontline >= 3) warnings.push('Enemy frontline is heavy; prioritize sustained DPS and anti-tank patterns.')
  if (enemy.ap + enemy.hybrid * 0.5 >= 4) warnings.push('Enemy damage leans AP; early MR and Cleanse/Mercs can matter.')
  if (enemy.ad + enemy.hybrid * 0.5 >= 4) warnings.push('Enemy damage leans AD; armor and anti-burst setup gain value.')
  if ((myRole === 'bottom' || myRole === 'middle') && enemy.pick >= 3) {
    warnings.push('High pick threat; track fog before sidelaning and respect support/jungle roam timers.')
  }
  return { missing, warnings: warnings.slice(0, 5) }
}

function winCondition(ally: TeamRead, enemy: TeamRead, myRole: DraftRole): string {
  const allyLabels = identityLabels(ally, 'ally')
  if (ally.slots.length === 0) {
    return `Draft for ${roleLabel(myRole)} agency: pick comfort, avoid one-damage comps, and keep bans on high-playrate counters.`
  }
  if (allyLabels.includes('front-to-back')) {
    return 'Play front-to-back: protect carries, fight around objective setup, and punish divers after cooldowns are spent.'
  }
  if (allyLabels.includes('poke/siege')) {
    return 'Play for vision first, chip before objectives, then disengage unless the poke creates a numbers edge.'
  }
  if (allyLabels.includes('dive')) {
    return 'Play to stack waves, force flanks, and commit together; split engages make the comp much weaker.'
  }
  if (allyLabels.includes('pick')) {
    return 'Play through fog and first move; convert catches into dragons, Herald, or turret tempo.'
  }
  if (enemy.scaling >= 3 && ally.dive >= 2) {
    return 'Enemy scales well, so use early skirmishes and side pressure before their carries reach two items.'
  }
  return 'Keep the comp flexible: cover damage mix, draft at least one reliable engage tool, and play around your strongest lane.'
}

function unavailableChampionIds(snapshot: DraftSnapshot | null): Set<number> {
  const out = new Set<number>()
  for (const side of ['ally', 'enemy'] as const) {
    for (const slot of snapshot?.[side] ?? []) {
      if (slot.championId != null && slot.championId > 0) {
        out.add(slot.championId)
      }
    }
  }
  for (const id of snapshot?.bans ?? []) {
    if (id > 0) out.add(id)
  }
  return out
}

function roleWeights(myRole: DraftRole, enemyRoleInference?: EnemyRoleInference[] | null): Map<RoleKey, number> {
  const weights = new Map<RoleKey, number>(ROLE_KEYS.map((role) => [role, 0.55]))
  if (myRole !== 'unknown') {
    weights.set(myRole, (weights.get(myRole) ?? 0.55) + 0.45)
  }
  for (const row of enemyRoleInference ?? []) {
    weights.set(row.inferredRole, (weights.get(row.inferredRole) ?? 0.55) + 0.2 * row.confidence)
  }
  return weights
}

function banScore(row: PublicMetaBaseStat, weight: number): number {
  const wrLift = (row.winRate - row.sourceAvgWinRate) * 120
  const pick = (row.pickRate ?? 0) * 36
  const ban = (row.banRate ?? 0) * 24
  const games = Math.log10(Math.max(10, row.games)) * 0.9
  const candidate = row.candidate ? 0.8 : 0
  return Math.round((45 + wrLift + pick + ban + games + candidate) * weight * 10) / 10
}

function banRecommendations(
  snapshot: DraftSnapshot | null,
  myRole: DraftRole,
  idToName: ReadonlyMap<number, string> | null,
  enemyRoleInference?: EnemyRoleInference[] | null
): DraftIntel['banRecommendations'] {
  const unavailable = unavailableChampionIds(snapshot)
  const weights = roleWeights(myRole, enemyRoleInference)
  const bestByChampion = new Map<number, DraftIntel['banRecommendations'][number]>()
  for (const role of ROLE_KEYS) {
    const weight = weights.get(role) ?? 0.55
    for (const row of publicMetaBaseStatsForRole(role)) {
      if (unavailable.has(row.championId)) {
        continue
      }
      const score = banScore(row, weight)
      const reasonParts = [
        `${roleLabel(role)} ${(row.winRate * 100).toFixed(1)}% WR`,
        row.pickRate != null ? `${(row.pickRate * 100).toFixed(1)}% pick` : null,
        row.banRate != null ? `${(row.banRate * 100).toFixed(1)}% ban` : null
      ].filter(Boolean)
      const rec = {
        championId: row.championId,
        championName: championName(row.championId, idToName),
        role,
        score,
        reason: reasonParts.join(' / ')
      }
      const current = bestByChampion.get(row.championId)
      if (!current || rec.score > current.score) {
        bestByChampion.set(row.championId, rec)
      }
    }
  }
  return Array.from(bestByChampion.values()).sort((a, b) => b.score - a.score || a.championName.localeCompare(b.championName)).slice(0, 5)
}

function likelyLaneOpponent(
  snapshot: DraftSnapshot | null,
  myRole: DraftRole,
  enemyRoleInference?: EnemyRoleInference[] | null
): SlotPick | null {
  if (!snapshot || myRole === 'unknown') {
    return null
  }
  let best: { slot: SlotPick; score: number } | null = null
  for (let i = 0; i < snapshot.enemy.length; i++) {
    const slot = snapshot.enemy[i]!
    if (slot.championId == null || slot.championId <= 0) {
      continue
    }
    const inferred = enemyRoleInference?.find((row) => row.enemyIndex === i && row.championId === slot.championId)
    const score = inferred?.roleProbabilities[myRole as RoleKey] ?? (slot.role === myRole ? 1 : 0)
    if (!best || score > best.score) {
      best = { slot, score }
    }
  }
  return best?.slot ?? null
}

function summonerSpells(myRole: DraftRole, enemy: TeamRead, laneOpponent: SlotPick | null): string {
  const heavyCc = enemy.tanks + enemy.supports >= 2
  const burst = enemy.assassins >= 2 || (laneOpponent?.championName && getChampionThreatOverride(laneOpponent.championName)?.classes.includes('assassin'))
  if (myRole === 'jungle') return 'Flash + Smite'
  if ((myRole === 'bottom' || myRole === 'middle') && heavyCc) return 'Flash + Cleanse'
  if ((myRole === 'bottom' || myRole === 'middle' || myRole === 'support') && burst) return 'Flash + Exhaust'
  if (myRole === 'top') return enemy.frontline >= 3 ? 'Flash + Ghost/Teleport' : 'Flash + Teleport'
  if (myRole === 'support') return enemy.dive >= 2 ? 'Flash + Exhaust' : 'Flash + Ignite/Exhaust'
  if (myRole === 'bottom') return 'Flash + Heal/Cleanse'
  return 'Flash + Teleport/Ignite'
}

function hasSuggestionClass(s: PickSuggestion, cls: ClassLabel): boolean {
  const tags = s.buildProfile?.tagsLine.toLowerCase() ?? ''
  const archetype = s.buildProfile?.archetype.toLowerCase() ?? ''
  return tags.includes(cls) || archetype.includes(cls)
}

function startingItem(s: PickSuggestion, myRole: DraftRole, enemy: TeamRead, laneOpponent: SlotPick | null): string {
  const dmg = s.buildProfile?.damage
  const laneName = laneOpponent?.championName ?? ''
  const laneOverride = getChampionThreatOverride(laneName)
  const laneRanged = laneOverride?.classes.includes('marksman') || laneOverride?.classes.includes('mage')
  if (myRole === 'jungle') {
    return 'Jungle pet start; consider early Gluttonous Greaves when sustain converts into tempo.'
  }
  if (myRole === 'support') {
    return hasSuggestionClass(s, 'tank') ? 'World Atlas plus defensive potions; play for engage windows.' : 'World Atlas plus lane control; keep first ward timing clean.'
  }
  if (myRole === 'bottom') {
    if (hasSuggestionClass(s, 'marksman') && !laneRanged) return "Doran's Bow is the greed start when you can auto safely."
    return laneRanged ? "Doran's Shield into poke, or Doran's Blade if your support owns level 2." : "Doran's Blade/Bow depending on matchup volatility."
  }
  if (myRole === 'top') {
    if (enemy.frontline >= 2 || laneOverride?.classes.includes('tank')) return "Doran's Helm is strong when you can use both resistances and last-hit help."
    if (laneRanged) return "Doran's Shield into ranged/poke lanes; trade health for wave control."
    return dmg === 'ap' ? "Doran's Ring or Shield if the lane is hostile." : "Doran's Blade for pressure, Shield for hard lanes."
  }
  if (myRole === 'middle') {
    if (enemy.assassins >= 1) return "Doran's Shield/early defensive boots if burst can deny your first reset."
    return dmg === 'ad' ? "Long Sword/Doran's Blade for AD mids; Doran's Ring or Tear for mages." : "Doran's Ring unless you need Tear scaling or Shield into poke."
  }
  return "Use the safest standard start, then adapt boots to enemy damage."
}

function firstRecall(s: PickSuggestion, myRole: DraftRole, enemy: TeamRead): string {
  const dmg = s.buildProfile?.damage
  if (myRole === 'support') return 'Boots + control wards; rush the lane item upgrade that matches engage or shielding.'
  if (myRole === 'jungle') return enemy.ap >= enemy.ad ? 'Boots plus MR/clear component; sustain boots are viable after a winning first clear.' : 'Boots plus damage/clear component; Gluttonous Greaves can snowball skirmish sustain.'
  if (hasSuggestionClass(s, 'marksman')) return 'Pickaxe/attack speed component; on-hit users can plan toward reworked Statikk Shiv.'
  if (hasSuggestionClass(s, 'assassin')) return 'Serrated Dirk timing; Voltaic Cyclosword is the upfront burst option, Axiom is less early-loaded.'
  if (dmg === 'ap') return "Lost Chapter/amp tome path; Staff of Flowing Water users now value the restored haste."
  if (hasSuggestionClass(s, 'fighter')) return "Long Sword/Ruby Crystal plus boots; Gluttonous Greaves are a sustain option if fights are extended."
  return 'Boots plus core component; buy resist shards if the inferred lane opponent is the real threat.'
}

function teamDamageCounts(team: TeamRead): { magic: number; physical: number } {
  return {
    magic: team.ap + team.hybrid * 0.5,
    physical: team.ad + team.hybrid * 0.5
  }
}

function kitTexts(meta: ChampionMeta | null | undefined): string[] {
  if (!meta) {
    return []
  }
  return [
    meta.passive?.name,
    meta.passive?.description,
    meta.passive?.tooltip,
    ...(meta.spells ?? []).flatMap((spell) => [spell.name, spell.description, spell.tooltip])
  ].filter((line): line is string => typeof line === 'string' && line.length > 0)
}

function teamKitSignals(team: TeamRead, championMetaById: ReadonlyMap<number, ChampionMeta> | null | undefined) {
  const signals = {
    hardCc: 0,
    healing: 0,
    shielding: 0,
    mobility: 0,
    burst: 0
  }
  for (const slot of team.slots) {
    const kit = championKitProfileFromTexts(kitTexts(championMetaById?.get(slot.championId)))
    if (kit.hardCc) signals.hardCc += 1
    if (kit.heal || kit.sustain) signals.healing += 1
    if (kit.shield) signals.shielding += 1
    if (kit.mobility) signals.mobility += 1
    if (kit.burst || kit.execute) signals.burst += 1
  }
  return signals
}

function teamItemTargets(team: TeamRead, championMetaById: ReadonlyMap<number, ChampionMeta> | null | undefined) {
  return team.slots.map((slot) => {
    const kit = championKitProfileFromTexts(kitTexts(championMetaById?.get(slot.championId)))
    return {
      name: slot.name,
      threat: slot.threat,
      classes: Array.from(slot.classes),
      hardCc: kit.hardCc,
      healing: kit.heal || kit.sustain,
      shielding: kit.shield,
      mobility: kit.mobility,
      burst: kit.burst || kit.execute,
      poke: kit.poke
    }
  })
}

function canAddMagicDamage(s: PickSuggestion): boolean {
  const dmg = s.buildProfile?.damage
  return dmg === 'ap' || dmg === 'mixed' || dmg === 'flex' || hasSuggestionClass(s, 'mage')
}

function canAddPhysicalDamage(s: PickSuggestion): boolean {
  const dmg = s.buildProfile?.damage
  return dmg === 'ad' || dmg === 'mixed' || dmg === 'flex' || hasSuggestionClass(s, 'marksman') || hasSuggestionClass(s, 'fighter')
}

function addUnique(lines: string[], line: string): void {
  if (!lines.includes(line)) {
    lines.push(line)
  }
}

function coreItemPlan(s: PickSuggestion, myRole: DraftRole, enemy: TeamRead): string {
  const championHint = s.buildProfile?.itemHint ?? s.buildProfile?.buildHint
  if (championHint) {
    return championHint
  }
  if (myRole === 'support') {
    return hasSuggestionClass(s, 'tank')
      ? 'Support quest into engage durability; buy the aura or peel item that answers their fed carry.'
      : 'Support quest into haste and vision control; add peel or anti-heal when fights group early.'
  }
  if (hasSuggestionClass(s, 'marksman')) {
    return enemy.frontline >= 2
      ? 'Sustained DPS core first, then an anti-tank slot before the third major fight.'
      : 'Standard DPS curve first; keep one slot open for burst defense if enemy dive gets ahead.'
  }
  if (hasSuggestionClass(s, 'mage')) {
    return enemy.frontline >= 2
      ? 'Mana/AP core into burn or magic penetration so tanks cannot ignore you.'
      : 'AP haste or burst core; protect your first two-item spike with vision before objectives.'
  }
  if (hasSuggestionClass(s, 'assassin')) {
    return 'First lethality or burst spike matters most; delay greed if the enemy has point-and-click lockdown.'
  }
  if (hasSuggestionClass(s, 'fighter')) {
    return 'Bruiser damage plus durability is the default; choose sustain for long fights and penetration into tanks.'
  }
  if (hasSuggestionClass(s, 'tank')) {
    return 'First full tank item should match the enemy carry damage, then pivot into teamfight utility.'
  }
  return 'Follow the champion standard core, then adapt second item to the strongest enemy damage source.'
}

function bootsItemPlan(s: PickSuggestion, myRole: DraftRole, enemy: TeamRead): string {
  const enemyDamage = teamDamageCounts(enemy)
  const heavyCc = enemy.tanks + enemy.supports + enemy.pick >= 3
  if (enemyDamage.magic >= 4 || (enemyDamage.magic > enemyDamage.physical + 1 && heavyCc)) {
    return "Mercury's Treads when AP/CC is the main threat; keep damage boots only if lane is controlled."
  }
  if (enemyDamage.physical >= 4 || enemy.marksmen >= 2) {
    return 'Plated Steelcaps into AD/auto attackers; greed damage boots only when your team can peel.'
  }
  if (myRole === 'support' || myRole === 'jungle') {
    return 'Early movement boots for tempo, then upgrade toward the enemy damage split.'
  }
  if (hasSuggestionClass(s, 'mage')) {
    return "Sorcerer's or haste boots for tempo; swap to Mercs if CC prevents spell rotations."
  }
  if (hasSuggestionClass(s, 'marksman')) {
    return 'Attack-speed or Swifties-style boots unless burst forces Steelcaps or Mercs.'
  }
  return 'Use champion-standard boots, then pivot to Mercs or Steelcaps when one damage type is stacked.'
}

function defensiveItemPlan(
  s: PickSuggestion,
  enemy: TeamRead,
  laneOpponent: SlotPick | null
): string {
  const enemyDamage = teamDamageCounts(enemy)
  const laneThreat = laneOpponent?.championName ? getChampionThreatOverride(laneOpponent.championName)?.threat : null
  if (enemy.assassins >= 2 || enemy.dive >= 3) {
    return hasSuggestionClass(s, 'marksman') || hasSuggestionClass(s, 'mage')
      ? 'Reserve an early defensive slot against dive; stopwatch, shield, or lifesteal value beats pure greed.'
      : 'Add health/resists before side-laning deep; survive the first burst rotation, then re-engage.'
  }
  if (enemyDamage.magic >= 4 || laneThreat === 'ap') {
    return 'Buy an early MR component if the AP lane or jungle can burst your first reset.'
  }
  if (enemyDamage.physical >= 4 || laneThreat === 'ad') {
    return 'Buy armor before the second big fight if AD damage is stacked or lane trades are unavoidable.'
  }
  if (enemy.poke >= 3) {
    return 'Sustain and safer recalls matter into poke; do not delay defense just to finish a greedy component.'
  }
  return 'Default defense can wait, but keep gold flexible for the enemy carry who gets ahead first.'
}

function situationalItemPlans(s: PickSuggestion, myRole: DraftRole, ally: TeamRead, enemy: TeamRead): string[] {
  const lines: string[] = []
  const allyDamage = teamDamageCounts(ally)
  if (enemy.frontline >= 3 || enemy.tanks >= 2) {
    if (hasSuggestionClass(s, 'mage') || s.buildProfile?.damage === 'ap') {
      addUnique(lines, 'Anti-tank: add burn or magic penetration before enemy frontline reaches full resist stacks.')
    } else if (hasSuggestionClass(s, 'marksman') || hasSuggestionClass(s, 'fighter') || s.buildProfile?.damage === 'ad') {
      addUnique(lines, 'Anti-tank: plan armor penetration, Black Cleaver-style shred, or on-hit DPS before late objectives.')
    } else {
      addUnique(lines, 'Anti-tank: help your carry access frontline with peel, slows, or resistance shred.')
    }
  }
  if (enemy.sustain >= 2 || enemy.supports >= 2) {
    addUnique(lines, 'Anti-heal: buy it early when enchanters, drain tanks, or bruiser sustain decide extended fights.')
  }
  if (enemy.supports >= 2 && (hasSuggestionClass(s, 'assassin') || s.buildProfile?.damage === 'ad')) {
    addUnique(lines, 'Shield pressure: consider shield-break or target the enchanter first if shields block burst windows.')
  }
  if (enemy.poke >= 3) {
    addUnique(lines, 'Poke answer: choose sustain, engage speed, or waveclear before grouping for neutral objectives.')
  }
  if (enemy.assassins >= 2 && (myRole === 'bottom' || myRole === 'middle' || hasSuggestionClass(s, 'marksman') || hasSuggestionClass(s, 'mage'))) {
    addUnique(lines, 'Anti-burst: a defensive second or third item is usually better than one more damage component.')
  }
  if (ally.slots.length >= 3 && allyDamage.magic < 1 && canAddMagicDamage(s)) {
    addUnique(lines, 'Team damage: lean into the AP or magic-damage path so armor stacking is punishable.')
  }
  if (ally.slots.length >= 3 && allyDamage.physical < 1 && canAddPhysicalDamage(s)) {
    addUnique(lines, 'Team damage: preserve physical DPS instead of over-indexing on utility or tank stats.')
  }
  if (ally.slots.length >= 3 && ally.frontline < 1 && (hasSuggestionClass(s, 'tank') || hasSuggestionClass(s, 'fighter'))) {
    addUnique(lines, 'Team shape: a bulkier frontline build may be worth more than maximum personal damage.')
  }
  if (ally.engage < 1 && myRole === 'support') {
    addUnique(lines, 'Team shape: prioritize an engage or pick tool if your team has no reliable fight starter.')
  }
  return lines.slice(0, 5)
}

function itemNotes(s: PickSuggestion, myRole: DraftRole, ally: TeamRead, enemy: TeamRead, laneOpponent: SlotPick | null): string[] {
  const notes: string[] = []
  const allyDamage = teamDamageCounts(ally)
  if (laneOpponent?.championName) {
    const threat = getChampionThreatOverride(laneOpponent.championName)?.threat
    if (threat === 'ap') addUnique(notes, `Lane check: ${laneOpponent.championName} is AP-leaning; do not ignore early MR.`)
    if (threat === 'ad') addUnique(notes, `Lane check: ${laneOpponent.championName} is AD-leaning; armor boots/components are live options.`)
    if (threat === 'utility') addUnique(notes, `Lane check: ${laneOpponent.championName} brings setup; value tenacity, spacing, and vision.`)
  }
  if (ally.slots.length >= 3 && allyDamage.magic < 1 && !canAddMagicDamage(s)) {
    addUnique(notes, 'Team warning: allies are light on magic damage, so avoid low-value physical damage when behind.')
  }
  if (ally.slots.length >= 3 && allyDamage.physical < 1 && !canAddPhysicalDamage(s)) {
    addUnique(notes, 'Team warning: allies are light on physical DPS; protect whoever can hit objectives.')
  }
  if (enemy.frontline >= 3 && ally.scaling >= 2) {
    addUnique(notes, 'Fight length: expect front-to-back fights, so second/third items should scale into long objectives.')
  }
  if (myRole === 'jungle' && enemy.dive >= 2) {
    addUnique(notes, 'Jungle tempo: defensive boots can be the difference between covering dives and arriving late.')
  }
  return notes.slice(0, 4)
}

function fallbackItemPlan(
  s: PickSuggestion,
  myRole: DraftRole,
  ally: TeamRead,
  enemy: TeamRead,
  laneOpponent: SlotPick | null
): DraftItemPlan {
  return {
    core: coreItemPlan(s, myRole, enemy),
    boots: bootsItemPlan(s, myRole, enemy),
    defensive: defensiveItemPlan(s, enemy, laneOpponent),
    situational: situationalItemPlans(s, myRole, ally, enemy),
    notes: itemNotes(s, myRole, ally, enemy, laneOpponent)
  }
}

function itemPlan(
  s: PickSuggestion,
  myRole: DraftRole,
  ally: TeamRead,
  enemy: TeamRead,
  laneOpponent: SlotPick | null,
  championMetaById: ReadonlyMap<number, ChampionMeta> | null | undefined,
  itemCatalog: readonly ItemLite[] | null | undefined
): DraftItemPlan {
  const fallback = fallbackItemPlan(s, myRole, ally, enemy, laneOpponent)
  if (!itemCatalog?.length) {
    return fallback
  }
  const allyDamage = teamDamageCounts(ally)
  const enemyDamage = teamDamageCounts(enemy)
  const enemyKit = teamKitSignals(enemy, championMetaById)
  const laneThreat = laneOpponent?.championName ? getChampionThreatOverride(laneOpponent.championName)?.threat ?? null : null
  return buildAdaptiveItemPlan(itemCatalog, {
    championName: s.championName,
    role: myRole,
    buildProfile: s.buildProfile,
    ally: {
      magic: allyDamage.magic,
      physical: allyDamage.physical,
      frontline: ally.frontline,
      engage: ally.engage,
      scaling: ally.scaling,
      slots: ally.slots.length
    },
    enemy: {
      magic: enemyDamage.magic,
      physical: enemyDamage.physical,
      frontline: enemy.frontline,
      tanks: enemy.tanks,
      assassins: enemy.assassins,
      supports: enemy.supports,
      dive: enemy.dive,
      poke: enemy.poke,
      pick: enemy.pick,
      sustain: enemy.sustain,
      marksmen: enemy.marksmen,
      hardCc: enemyKit.hardCc,
      healing: enemyKit.healing,
      shielding: enemyKit.shielding,
      mobility: enemyKit.mobility,
      burst: enemyKit.burst
    },
    enemyDetails: teamItemTargets(enemy, championMetaById),
    laneThreat,
    fallback
  })
}

function runeExport(runes: RuneLoadoutHint | null | undefined): string {
  if (!runes) {
    return 'No rune page hint available for this pick yet.'
  }
  const note = runes.note ? ` - ${runes.note}` : ''
  return `${runes.primaryTree}: ${runes.keystone} / Secondary: ${runes.secondary}${note}`
}

function planLine(s: PickSuggestion, myRole: DraftRole, ally: TeamRead, enemy: TeamRead, laneOpponent: SlotPick | null): string {
  const lane = laneOpponent?.championName ? ` into ${laneOpponent.championName}` : ''
  if (myRole === 'jungle') {
    return ally.engage >= 2 ? 'Path toward lanes with setup, then chain objectives after first successful fight.' : 'Track the enemy jungler, cover volatile lanes, and avoid flipping without lane priority.'
  }
  if (myRole === 'bottom' || myRole === 'support') {
    return enemy.dive >= 2 ? `Hold cooldowns for the dive${lane}; winning the second wave matters less than surviving first engage.` : `Play the 2v2 around support cooldowns${lane}, then convert push into dragon vision.`
  }
  if (s.reasons.includes('lane_counter')) {
    return `Use the lane edge${lane} to get first move; do not trade it for low-value roams.`
  }
  if (enemy.poke >= 3) {
    return `Short trades and flank timers matter${lane}; avoid neutral-objective standoffs before sustain arrives.`
  }
  return `Keep wave states clean${lane}; this pick is strongest when its draft role and damage profile stay coherent.`
}

function matchupPlans(
  suggestions: PickSuggestion[],
  snapshot: DraftSnapshot | null,
  myRole: DraftRole,
  ally: TeamRead,
  enemy: TeamRead,
  idToName: ReadonlyMap<number, string> | null,
  enemyRoleInference?: EnemyRoleInference[] | null,
  championMetaById?: ReadonlyMap<number, ChampionMeta> | null,
  itemCatalog?: readonly ItemLite[] | null
): DraftIntel['matchupPlans'] {
  const laneOpponent = likelyLaneOpponent(snapshot, myRole, enemyRoleInference)
  const laneOpponentId = laneOpponent?.championId ?? null
  const laneOpponentName = laneOpponentId != null ? laneOpponent?.championName ?? championName(laneOpponentId, idToName) : null
  return suggestions.slice(0, 12).map((s) => ({
    championId: s.championId,
    championName: s.championName,
    laneOpponentId,
    laneOpponentName,
    summonerSpells: summonerSpells(myRole, enemy, laneOpponent),
    startingItem: startingItem(s, myRole, enemy, laneOpponent),
    firstRecall: firstRecall(s, myRole, enemy),
    runeExport: runeExport(s.runes),
    gamePlan: planLine(s, myRole, ally, enemy, laneOpponent),
    itemPlan: itemPlan(s, myRole, ally, enemy, laneOpponent, championMetaById, itemCatalog)
  }))
}

function duoLaneNote(snapshot: DraftSnapshot | null, myRole: DraftRole, idToName: ReadonlyMap<number, string> | null): string | null {
  if (!snapshot || (myRole !== 'bottom' && myRole !== 'support')) {
    return null
  }
  const partnerRole: DraftRole = myRole === 'bottom' ? 'support' : 'bottom'
  const partner = snapshot.ally.find((slot) => slot.role === partnerRole && slot.championId != null && slot.championId > 0)
  if (!partner?.championId) {
    return 'Bot pairing: partner not locked yet; prefer flexible setup until the 2v2 is known.'
  }
  const name = partner.championName ?? championName(partner.championId, idToName)
  const override = getChampionThreatOverride(name)
  if (override?.classes.includes('tank')) return `Bot pairing: ${name} gives engage; contest level 2 and crash waves before roaming.`
  if (override?.classes.includes('support')) return `Bot pairing: ${name} suggests peel/sustain; trade around shields and keep river vision early.`
  if (override?.classes.includes('mage')) return `Bot pairing: ${name} adds poke; push for plates but track jungle angles.`
  if (override?.classes.includes('marksman')) return `Bot pairing: ${name} points to double-ranged pressure; win health bars before all-ins.`
  return `Bot pairing: ${name} is locked; sync wave goals before choosing an aggressive summoner.`
}

function jungleSetupNote(snapshot: DraftSnapshot | null, myRole: DraftRole, enemy: TeamRead): string | null {
  if (!snapshot) {
    return null
  }
  if (myRole === 'jungle') {
    const volatileLane = snapshot.ally.find((slot) => slot.role !== 'jungle' && slot.championId != null)?.role ?? 'middle'
    return `Jungle setup: path with a purpose toward ${roleLabel(volatileLane)} unless enemy jungle reveals a punishable start.`
  }
  const enemyJungle = snapshot.enemy.find((slot) => slot.role === 'jungle' && slot.championId != null)
  if (enemyJungle?.championName) {
    return `Jungle tracking: enemy ${enemyJungle.championName} is shown; ward for their first gank side before trading hard.`
  }
  if (enemy.dive >= 3) {
    return 'Jungle tracking: enemy comp wants dives; thin waves before cannon crashes and ping missing support/jungle.'
  }
  return null
}

function loadingBrief(
  snapshot: DraftSnapshot | null,
  ally: TeamRead,
  enemy: TeamRead,
  intel: Pick< DraftIntel, 'compIdentity' | 'matchupPlans' >
): string[] {
  const lines: string[] = []
  lines.push(`Win condition: ${intel.compIdentity.winCondition}`)
  const plan = intel.matchupPlans[0]
  if (plan) {
    lines.push(`Top pick plan: ${plan.championName} ${plan.laneOpponentName ? `vs ${plan.laneOpponentName}` : ''} - ${plan.summonerSpells}; ${plan.startingItem}`)
    const itemAngle = plan.itemPlan?.situational[0] ?? plan.itemPlan?.boots
    if (itemAngle) {
      lines.push(`Item angle: ${itemAngle}`)
    }
  }
  const warn = intel.compIdentity.warnings[0]
  if (warn) {
    lines.push(`Danger: ${warn}`)
  }
  if (ally.slots.length >= 3 && intel.compIdentity.missing.length > 0) {
    lines.push(`Draft gap: missing ${intel.compIdentity.missing.join(', ')}.`)
  }
  const knownEnemies = snapshot?.enemy.filter((slot) => slot.championId != null && slot.championId > 0).length ?? 0
  if (knownEnemies < 3 && enemy.slots.length < 3) {
    lines.push(`Confidence: enemy info is partial; role inference will sharpen after more locks.`)
  }
  return lines.slice(0, 6)
}

function confidenceNotes(
  snapshot: DraftSnapshot | null,
  enemyRoleInference?: EnemyRoleInference[] | null,
  patchLabel?: string | null,
  dataDragonVersion?: string | null
): string[] {
  const notes = [
    `${PATCH_DATA_NOTE} Source: ${getPublicMetaStatsLabel()}${patchLabel ? ` + ${patchLabel}` : ''}.`,
    dataDragonVersion ? `Champion metadata from Riot Data Dragon ${dataDragonVersion}.` : 'Champion metadata is bundled until Riot Data Dragon loads.'
  ]
  const inferred = enemyRoleInference?.filter((row) => row.confidenceLabel !== 'uncertain').length ?? 0
  const locked = snapshot?.enemy.filter((slot) => slot.championId != null && slot.championId > 0).length ?? 0
  notes.push(
    locked > 0
      ? `Enemy role inference: ${inferred}/${locked} locked enemies have likely or flex role reads.`
      : 'Enemy role inference will activate when enemy champions are locked or hovered.'
  )
  return notes
}

export function buildDraftIntel({
  snapshot,
  myRole,
  suggestions,
  idToName,
  championMetaById,
  enemyRoleInference,
  patchLabel,
  dataDragonVersion,
  itemCatalog
}: BuildDraftIntelArgs): DraftIntel | null {
  if (!snapshot && suggestions.length === 0) {
    return null
  }
  const ally = analyzeTeam(snapshot?.ally ?? [], idToName, championMetaById)
  const enemy = analyzeTeam(snapshot?.enemy ?? [], idToName, championMetaById)
  const { missing, warnings } = allyMissingAndWarnings(ally, enemy, myRole)
  const extraNotes = [duoLaneNote(snapshot, myRole, idToName), jungleSetupNote(snapshot, myRole, enemy)].filter(
    (note): note is string => Boolean(note)
  )
  const bans = banRecommendations(snapshot, myRole, idToName, enemyRoleInference)
  const plans = matchupPlans(suggestions, snapshot, myRole, ally, enemy, idToName, enemyRoleInference, championMetaById, itemCatalog)
  const compIdentity: DraftIntel['compIdentity'] = {
    ally: identityLabels(ally, 'ally'),
    enemy: identityLabels(enemy, 'enemy'),
    missing,
    warnings: [...warnings, ...extraNotes].slice(0, 6),
    winCondition: winCondition(ally, enemy, myRole)
  }
  const partial = {
    banRecommendations: bans,
    compIdentity,
    matchupPlans: plans
  }
  return {
    ...partial,
    pickComparison: [],
    loadingBrief: loadingBrief(snapshot, ally, enemy, partial),
    confidenceNotes: confidenceNotes(snapshot, enemyRoleInference, patchLabel, dataDragonVersion)
  }
}

export function likelyRolesFromMeta(championId: number): { role: RoleKey; probability: number; games: number }[] {
  const dist = publicMetaRoleDistributionForChampion(championId)
  const rows = publicMetaBaseStatsForChampion(championId)
  return ROLE_KEYS.map((role) => ({
    role,
    probability: dist[role],
    games: rows.find((row) => row.role === role)?.games ?? 0
  })).sort((a, b) => b.probability - a.probability || b.games - a.games)
}
