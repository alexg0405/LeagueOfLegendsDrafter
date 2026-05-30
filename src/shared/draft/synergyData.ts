import { getChampionThreatOverride, type ChampionThreatOverride, type ClassLabel } from './championThreatOverrides'
import { resolveChampionName } from './championNameFallback'
import { publicMetaBaseStatsForRole, type PublicMetaBaseStat, type RoleKey } from './metaStats'
import publicSynergyStatsSeed from '../data/publicSynergyStatsSeed.json'

type ChampionStyle = ChampionThreatOverride & {
  id: number
  name: string
  key: string
}

type SynergyTable = Record<string, Record<string, number>>
type RawPublicSynergyRow = {
  championId?: unknown
  allyId?: unknown
  winRate?: unknown
}

type PublicSynergyStatsSeed = {
  patch?: unknown
  rankFilter?: unknown
  updatedAt?: unknown
  rows?: unknown
}

export type PublicSynergyStatsInfo = {
  patch: string
  rankFilter: string | null
  updatedAt: string | null
  source: string
  rowCount: number
  pairCount: number
}

const ROLE_KEYS: RoleKey[] = ['top', 'jungle', 'middle', 'bottom', 'support']
const MIN_SYNERGY_SCORE = 0.35
const MAX_SYNERGY_SCORE = 2

function championKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function keySet(names: string[]): ReadonlySet<string> {
  return new Set(names.map(championKey))
}

const HYPERCARRIES = keySet([
  'Aphelios',
  'Aurelion Sol',
  'Jinx',
  'KaiSa',
  "Kog'Maw",
  'Kayle',
  'Kassadin',
  'Smolder',
  'Twitch',
  'Vayne',
  'Veigar',
  'Vladimir',
  'Yunara',
  'Zeri'
])

const POKE_CARRIES = keySet([
  'Ashe',
  'Caitlyn',
  'Corki',
  'Ezreal',
  'Hwei',
  'Jhin',
  'Lux',
  'Seraphine',
  'Sivir',
  'Varus',
  "Vel'Koz",
  'Xerath',
  'Ziggs'
])

const ALL_IN_CARRIES = keySet([
  'Draven',
  "Kai'Sa",
  'Kalista',
  'Lucian',
  'Nilah',
  'Samira',
  'Tristana',
  'Yasuo'
])

const ENCHANTERS = keySet([
  'Janna',
  'Karma',
  'Lulu',
  'Milio',
  'Nami',
  'Renata Glasc',
  'Seraphine',
  'Sona',
  'Soraka',
  'Taric',
  'Yuumi',
  'Zilean'
])

const ENGAGE_SUPPORTS = keySet([
  'Alistar',
  'Blitzcrank',
  'Galio',
  'Leona',
  'Maokai',
  'Nautilus',
  'Poppy',
  'Pyke',
  'Rakan',
  'Rell',
  'Tahm Kench',
  'Thresh'
])

const DISENGAGE_SUPPORTS = keySet([
  'Braum',
  'Janna',
  'Milio',
  'Morgana',
  'Nami',
  'Poppy',
  'Renata Glasc',
  'Tahm Kench',
  'Taric',
  'Thresh',
  'Zilean'
])

const LOCKDOWN_CHAMPIONS = keySet([
  'Ahri',
  'Alistar',
  'Amumu',
  'Annie',
  'Ashe',
  'Braum',
  'Camille',
  'Galio',
  'Gragas',
  'Jarvan IV',
  'Leona',
  'Lissandra',
  'Malphite',
  'Maokai',
  'Nautilus',
  'Neeko',
  'Nocturne',
  'Orianna',
  'Pantheon',
  'Rakan',
  'Rell',
  'Sejuani',
  'Seraphine',
  'Skarner',
  'Thresh',
  'Twisted Fate',
  'Vi',
  'Zac'
])

const WOMBO_CHAMPIONS = keySet([
  'Amumu',
  'Diana',
  'Galio',
  'Gnar',
  'Jarvan IV',
  'Kennen',
  'Malphite',
  'Miss Fortune',
  'Neeko',
  'Nilah',
  'Orianna',
  'Rakan',
  'Rell',
  'Rumble',
  'Samira',
  'Seraphine',
  'Wukong',
  'Yasuo',
  'Yone'
])

const EARLY_SKIRMISHERS = keySet([
  'Akali',
  'Camille',
  'Diana',
  'Elise',
  'Fizz',
  'Irelia',
  'Jayce',
  'KhaZix',
  'LeBlanc',
  'Lee Sin',
  'Lucian',
  'Naafiri',
  'Nidalee',
  'Pantheon',
  'Qiyana',
  'RekSai',
  'Renekton',
  'Riven',
  'Sylas',
  'Taliyah',
  'Talon',
  'Xin Zhao',
  'Yasuo',
  'Zed'
])

const RESET_CARRIES = keySet([
  'Jinx',
  'Katarina',
  "Kha'Zix",
  'Master Yi',
  'Pyke',
  'Samira',
  'Tristana',
  'Viego',
  'Yone',
  'Zeri'
])

const SPLIT_PUSHERS = keySet([
  'Camille',
  'Fiora',
  'Gangplank',
  'Gwen',
  'Illaoi',
  'Jax',
  'Kayle',
  'Nasus',
  'Quinn',
  'Trundle',
  'Tryndamere',
  'Twisted Fate',
  'Yorick'
])

const CURATED_PAIR_BONUSES: Array<[number, number, number]> = [
  [111, 22, 1.25],
  [111, 81, 1.25],
  [111, 119, 1],
  [111, 51, 1],
  [12, 81, 1],
  [12, 22, 1],
  [12, 51, 1],
  [53, 22, 1.25],
  [53, 81, 1],
  [201, 22, 1],
  [201, 51, 1.1],
  [412, 222, 1.4],
  [412, 429, 1.35],
  [89, 360, 1.25],
  [526, 360, 1.25],
  [267, 236, 1.1],
  [117, 96, 1.25],
  [902, 222, 1.15],
  [64, 61, 1],
  [64, 103, 0.9],
  [64, 238, 0.9],
  [121, 134, 0.8],
  [121, 7, 0.8],
  [59, 61, 1.15],
  [131, 61, 1],
  [154, 157, 1.05],
  [266, 64, 0.9],
  [266, 121, 0.8]
]

/**
 * Broad ally synergy. Values are small bonuses in [0.25, 2] consumed by the fast draft sum term.
 *
 * This is not scraped duo-pair winrate data. It is a patch-aware heuristic matrix generated from
 * the bundled/current role rows plus champion class/threat rules, so off-meta role rows can still
 * contribute to a useful read when the real trained synergy bundle has no exact pair.
 */
export const ALLY_SYNERGY_BONUS: SynergyTable = {}

export const ALLY_SYNERGY_TABLE_META = {
  source: `mobalytics-emerald-plus-${publicSynergyStatsSeed.patch}-duo-plus-class-heuristics`,
  minScore: MIN_SYNERGY_SCORE,
  pairCount: 0
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function stringField(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function seedInfo(seed: PublicSynergyStatsSeed, source: string, pairCount: number): PublicSynergyStatsInfo | null {
  const patch = stringField(seed.patch)
  const rows = Array.isArray(seed.rows) ? seed.rows : null
  if (!patch || !rows) {
    return null
  }
  const baseSource = `mobalytics-emerald-plus-${patch}-duo-plus-class-heuristics`
  return {
    patch,
    rankFilter: stringField(seed.rankFilter),
    updatedAt: stringField(seed.updatedAt),
    source: source === 'bundled' ? baseSource : `${baseSource}-live`,
    rowCount: rows.length,
    pairCount
  }
}

function replaceSynergyTable(next: SynergyTable): void {
  for (const key of Object.keys(ALLY_SYNERGY_BONUS)) {
    delete ALLY_SYNERGY_BONUS[key]
  }
  for (const [left, row] of Object.entries(next)) {
    ALLY_SYNERGY_BONUS[left] = { ...row }
  }
}

function buildAllySynergyTable(seed: PublicSynergyStatsSeed): SynergyTable | null {
  if (!isRecord(seed) || !Array.isArray(seed.rows) || !stringField(seed.patch)) {
    return null
  }
  const rows = ROLE_KEYS.flatMap((role) => publicMetaBaseStatsForRole(role))
  const styles = new Map<number, ChampionStyle>()
  for (const row of rows) {
    if (!styles.has(row.championId)) {
      styles.set(row.championId, championStyle(row.championId, row.role))
    }
  }

  const table: SynergyTable = {}
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i]
      const b = rows[j]
      if (a.championId === b.championId || a.role === b.role) {
        continue
      }
      const aStyle = styles.get(a.championId)
      const bStyle = styles.get(b.championId)
      if (!aStyle || !bStyle) {
        continue
      }
      const score = synergyScore(a, b, aStyle, bStyle)
      if (score >= MIN_SYNERGY_SCORE) {
        setPair(table, a.championId, b.championId, normalizeScore(score))
      }
    }
  }

  for (const [a, b, score] of CURATED_PAIR_BONUSES) {
    setPair(table, a, b, score)
  }

  for (const row of seed.rows as RawPublicSynergyRow[]) {
    const championId = Number(row.championId)
    const allyId = Number(row.allyId)
    const winRate = Number(row.winRate)
    if (!Number.isFinite(championId) || !Number.isFinite(allyId) || !Number.isFinite(winRate)) {
      continue
    }
    if (championId <= 0 || allyId <= 0 || winRate <= 0.5 || winRate >= 1) {
      continue
    }
    setPair(table, championId, allyId, publicSynergyWinRateToScore(winRate))
  }

  return table
}

let currentSynergyInfo: PublicSynergyStatsInfo

export function applyPublicSynergyStatsSeed(raw: unknown, source = 'live'): PublicSynergyStatsInfo | null {
  const seed = raw as PublicSynergyStatsSeed
  const table = buildAllySynergyTable(seed)
  if (!table) {
    return null
  }
  const pairCount = countPairs(table)
  const info = seedInfo(seed, source, pairCount)
  if (!info) {
    return null
  }
  replaceSynergyTable(table)
  ALLY_SYNERGY_TABLE_META.source = info.source
  ALLY_SYNERGY_TABLE_META.pairCount = info.pairCount
  currentSynergyInfo = info
  return getPublicSynergyStatsInfo()
}

currentSynergyInfo = (() => {
  const info = applyPublicSynergyStatsSeed(publicSynergyStatsSeed as PublicSynergyStatsSeed, 'bundled')
  if (info) {
    return info
  }
  return {
    patch: String(publicSynergyStatsSeed.patch ?? 'unknown'),
    rankFilter: null,
    updatedAt: null,
    source: `mobalytics-emerald-plus-${String(publicSynergyStatsSeed.patch ?? 'unknown')}-duo-plus-class-heuristics`,
    rowCount: 0,
    pairCount: 0
  }
})()

export function getPublicSynergyStatsInfo(): PublicSynergyStatsInfo {
  return { ...currentSynergyInfo }
}

function publicSynergyWinRateToScore(winRate: number): number {
  return normalizeScore(0.35 + (winRate - 0.5) * 12)
}

function championStyle(championId: number, fallbackRole: RoleKey): ChampionStyle {
  const name = resolveChampionName(championId, null)
  const override = getChampionThreatOverride(name)
  if (override) {
    return { id: championId, name, key: championKey(name), threat: override.threat, classes: override.classes }
  }
  if (fallbackRole === 'bottom') {
    return { id: championId, name, key: championKey(name), threat: 'ad', classes: ['marksman'] }
  }
  if (fallbackRole === 'support') {
    return { id: championId, name, key: championKey(name), threat: 'utility', classes: ['support'] }
  }
  if (fallbackRole === 'middle') {
    return { id: championId, name, key: championKey(name), threat: 'ap', classes: ['mage'] }
  }
  return { id: championId, name, key: championKey(name), threat: 'ad', classes: ['fighter'] }
}

function synergyScore(
  aRow: PublicMetaBaseStat,
  bRow: PublicMetaBaseStat,
  a: ChampionStyle,
  b: ChampionStyle
): number {
  let score = rolePairScore(aRow.role, bRow.role, a, b)
  score += universalPairScore(a, b)
  score += metaRoleConfidenceBonus(aRow, bRow)
  return Math.max(0, Math.min(MAX_SYNERGY_SCORE, score))
}

function rolePairScore(aRole: RoleKey, bRole: RoleKey, a: ChampionStyle, b: ChampionStyle): number {
  if (aRole === 'bottom' && bRole === 'support') {
    return bottomSupportScore(a, b)
  }
  if (aRole === 'support' && bRole === 'bottom') {
    return bottomSupportScore(b, a)
  }
  if (aRole === 'jungle' && bRole === 'middle') {
    return jungleMidScore(a, b)
  }
  if (aRole === 'middle' && bRole === 'jungle') {
    return jungleMidScore(b, a)
  }
  if (aRole === 'top' && bRole === 'jungle') {
    return topJungleScore(a, b)
  }
  if (aRole === 'jungle' && bRole === 'top') {
    return topJungleScore(b, a)
  }
  if (aRole === 'middle' && bRole === 'support') {
    return midSupportScore(a, b)
  }
  if (aRole === 'support' && bRole === 'middle') {
    return midSupportScore(b, a)
  }
  if (aRole === 'jungle' && bRole === 'support') {
    return jungleSupportScore(a, b)
  }
  if (aRole === 'support' && bRole === 'jungle') {
    return jungleSupportScore(b, a)
  }
  if (aRole === 'top' && bRole === 'middle') {
    return soloLaneScore(a, b)
  }
  if (aRole === 'middle' && bRole === 'top') {
    return soloLaneScore(b, a)
  }
  if (aRole === 'bottom' && bRole === 'middle') {
    return carryMidScore(a, b)
  }
  if (aRole === 'middle' && bRole === 'bottom') {
    return carryMidScore(b, a)
  }
  if (aRole === 'bottom' && bRole === 'jungle') {
    return carryJungleScore(a, b)
  }
  if (aRole === 'jungle' && bRole === 'bottom') {
    return carryJungleScore(b, a)
  }
  if (aRole === 'top' && bRole === 'support') {
    return crossMapSupportScore(a, b)
  }
  if (aRole === 'support' && bRole === 'top') {
    return crossMapSupportScore(b, a)
  }
  if (aRole === 'top' && bRole === 'bottom') {
    return topCarryScore(a, b)
  }
  if (aRole === 'bottom' && bRole === 'top') {
    return topCarryScore(b, a)
  }
  return 0
}

function bottomSupportScore(carry: ChampionStyle, support: ChampionStyle): number {
  const supportLike = hasClass(support, 'support') || hasClass(support, 'tank') || hasClass(support, 'mage')
  if (!supportLike) {
    return 0
  }
  let score = 0.28
  if (isEngageSupport(support)) {
    score += 0.38
  }
  if (isEnchanter(support)) {
    score += 0.34
  }
  if (hasClass(support, 'mage')) {
    score += 0.2
  }
  if (isHypercarry(carry) && (isEnchanter(support) || isDisengageSupport(support))) {
    score += 0.42
  }
  if (isHypercarry(carry) && hasClass(support, 'tank')) {
    score += 0.2
  }
  if (isPokeCarry(carry) && (hasClass(support, 'mage') || isEngageSupport(support))) {
    score += 0.32
  }
  if (isAllInCarry(carry) && isEngageSupport(support)) {
    score += 0.34
  }
  if (isAllInCarry(carry) && isEnchanter(support)) {
    score += 0.16
  }
  if (isDisengageSupport(support) && (isHypercarry(carry) || isResetCarry(carry))) {
    score += 0.22
  }
  return score
}

function jungleMidScore(jungle: ChampionStyle, mid: ChampionStyle): number {
  let score = 0.2
  if (hasClass(jungle, 'tank') && (hasClass(mid, 'mage') || hasClass(mid, 'marksman'))) {
    score += 0.34
  }
  if (hasClass(jungle, 'fighter') && (hasClass(mid, 'mage') || hasClass(mid, 'assassin'))) {
    score += 0.28
  }
  if (hasClass(jungle, 'assassin') && (hasClass(mid, 'mage') || isLockdown(mid))) {
    score += 0.24
  }
  if (isEarlySkirmisher(jungle) && isEarlySkirmisher(mid)) {
    score += 0.32
  }
  if (isLockdown(jungle) && isBurstDamage(mid)) {
    score += 0.26
  }
  if (isLockdown(mid) && isBurstDamage(jungle)) {
    score += 0.26
  }
  return score
}

function topJungleScore(top: ChampionStyle, jungle: ChampionStyle): number {
  let score = 0.18
  if (hasClass(top, 'tank') && (hasClass(jungle, 'fighter') || hasClass(jungle, 'assassin') || hasClass(jungle, 'marksman'))) {
    score += 0.28
  }
  if (hasClass(jungle, 'tank') && (hasClass(top, 'fighter') || hasClass(top, 'marksman') || hasClass(top, 'mage'))) {
    score += 0.26
  }
  if (hasClass(top, 'fighter') && hasClass(jungle, 'fighter')) {
    score += 0.24
  }
  if (isEarlySkirmisher(top) && isEarlySkirmisher(jungle)) {
    score += 0.24
  }
  if (isSplitPusher(top) && (isLockdown(jungle) || hasClass(jungle, 'tank'))) {
    score += 0.2
  }
  return score
}

function midSupportScore(mid: ChampionStyle, support: ChampionStyle): number {
  let score = 0.14
  if (isEngageSupport(support) && (hasClass(mid, 'mage') || hasClass(mid, 'assassin'))) {
    score += 0.32
  }
  if (isEnchanter(support) && (isHypercarry(mid) || hasClass(mid, 'marksman'))) {
    score += 0.28
  }
  if (hasClass(support, 'mage') && (isPokeCarry(mid) || hasClass(mid, 'mage'))) {
    score += 0.22
  }
  if (isLockdown(mid) && isBurstDamage(support)) {
    score += 0.2
  }
  return score
}

function jungleSupportScore(jungle: ChampionStyle, support: ChampionStyle): number {
  let score = 0.12
  if (isEngageSupport(support) && (hasClass(jungle, 'fighter') || hasClass(jungle, 'assassin') || hasClass(jungle, 'tank'))) {
    score += 0.3
  }
  if (isEnchanter(support) && (hasClass(jungle, 'fighter') || isResetCarry(jungle))) {
    score += 0.22
  }
  if (isLockdown(jungle) && isBurstDamage(support)) {
    score += 0.18
  }
  return score
}

function soloLaneScore(top: ChampionStyle, mid: ChampionStyle): number {
  let score = 0.08
  if (hasClass(top, 'tank') && (hasClass(mid, 'mage') || hasClass(mid, 'marksman') || hasClass(mid, 'assassin'))) {
    score += 0.28
  }
  if (hasClass(mid, 'mage') && hasClass(top, 'fighter')) {
    score += 0.2
  }
  if (isSplitPusher(top) && (hasClass(mid, 'mage') || isLockdown(mid))) {
    score += 0.2
  }
  return score
}

function carryMidScore(carry: ChampionStyle, mid: ChampionStyle): number {
  let score = 0.08
  if (isPokeCarry(carry) && (isPokeCarry(mid) || hasClass(mid, 'mage'))) {
    score += 0.2
  }
  if (isHypercarry(carry) && (hasClass(mid, 'tank') || isLockdown(mid))) {
    score += 0.18
  }
  if (isAllInCarry(carry) && isLockdown(mid)) {
    score += 0.2
  }
  return score
}

function carryJungleScore(carry: ChampionStyle, jungle: ChampionStyle): number {
  let score = 0.08
  if ((hasClass(jungle, 'tank') || isLockdown(jungle)) && (isHypercarry(carry) || hasClass(carry, 'marksman'))) {
    score += 0.24
  }
  if (isAllInCarry(carry) && (hasClass(jungle, 'fighter') || isLockdown(jungle))) {
    score += 0.24
  }
  if (isPokeCarry(carry) && hasClass(jungle, 'mage')) {
    score += 0.16
  }
  return score
}

function crossMapSupportScore(top: ChampionStyle, support: ChampionStyle): number {
  let score = 0.04
  if (hasClass(top, 'fighter') && isEnchanter(support)) {
    score += 0.16
  }
  if (hasClass(top, 'tank') && (isEngageSupport(support) || isDisengageSupport(support))) {
    score += 0.16
  }
  if (isSplitPusher(top) && (isEnchanter(support) || isDisengageSupport(support))) {
    score += 0.14
  }
  return score
}

function topCarryScore(top: ChampionStyle, carry: ChampionStyle): number {
  let score = 0.04
  if (hasClass(top, 'tank') && (isHypercarry(carry) || hasClass(carry, 'marksman'))) {
    score += 0.18
  }
  if (isSplitPusher(top) && isPokeCarry(carry)) {
    score += 0.12
  }
  return score
}

function universalPairScore(a: ChampionStyle, b: ChampionStyle): number {
  let score = 0
  score += damageMixBonus(a, b)
  if (isWombo(a) && isWombo(b)) {
    score += 0.32
  }
  if (isLockdown(a) && isBurstDamage(b)) {
    score += 0.14
  }
  if (isLockdown(b) && isBurstDamage(a)) {
    score += 0.14
  }
  if (isResetCarry(a) && (isLockdown(b) || hasClass(b, 'support'))) {
    score += 0.16
  }
  if (isResetCarry(b) && (isLockdown(a) || hasClass(a, 'support'))) {
    score += 0.16
  }
  if ((hasClass(a, 'tank') || hasClass(a, 'support')) && (isHypercarry(b) || isResetCarry(b))) {
    score += 0.14
  }
  if ((hasClass(b, 'tank') || hasClass(b, 'support')) && (isHypercarry(a) || isResetCarry(a))) {
    score += 0.14
  }
  return score
}

function metaRoleConfidenceBonus(a: PublicMetaBaseStat, b: PublicMetaBaseStat): number {
  const sample = Math.min(a.games, b.games)
  const confidence = Math.sqrt(sample / (sample + 12000))
  const strength = a.winRate - a.sourceAvgWinRate + (b.winRate - b.sourceAvgWinRate)
  if (strength >= 0.045) {
    return 0.14 * confidence
  }
  if (strength >= 0.025) {
    return 0.08 * confidence
  }
  if (strength <= -0.055) {
    return -0.08 * confidence
  }
  return 0
}

function damageMixBonus(a: ChampionStyle, b: ChampionStyle): number {
  if ((a.threat === 'ad' && b.threat === 'ap') || (a.threat === 'ap' && b.threat === 'ad')) {
    return 0.22
  }
  if (
    (a.threat === 'hybrid' && (b.threat === 'ad' || b.threat === 'ap')) ||
    (b.threat === 'hybrid' && (a.threat === 'ad' || a.threat === 'ap'))
  ) {
    return 0.12
  }
  return 0
}

function hasClass(style: ChampionStyle, label: ClassLabel): boolean {
  return style.classes.includes(label)
}

function isHypercarry(style: ChampionStyle): boolean {
  return HYPERCARRIES.has(style.key)
}

function isPokeCarry(style: ChampionStyle): boolean {
  return POKE_CARRIES.has(style.key)
}

function isAllInCarry(style: ChampionStyle): boolean {
  return ALL_IN_CARRIES.has(style.key)
}

function isEnchanter(style: ChampionStyle): boolean {
  return ENCHANTERS.has(style.key)
}

function isEngageSupport(style: ChampionStyle): boolean {
  return ENGAGE_SUPPORTS.has(style.key)
}

function isDisengageSupport(style: ChampionStyle): boolean {
  return DISENGAGE_SUPPORTS.has(style.key)
}

function isLockdown(style: ChampionStyle): boolean {
  return LOCKDOWN_CHAMPIONS.has(style.key) || hasClass(style, 'tank') || hasClass(style, 'support')
}

function isWombo(style: ChampionStyle): boolean {
  return WOMBO_CHAMPIONS.has(style.key)
}

function isEarlySkirmisher(style: ChampionStyle): boolean {
  return EARLY_SKIRMISHERS.has(style.key)
}

function isResetCarry(style: ChampionStyle): boolean {
  return RESET_CARRIES.has(style.key)
}

function isSplitPusher(style: ChampionStyle): boolean {
  return SPLIT_PUSHERS.has(style.key)
}

function isBurstDamage(style: ChampionStyle): boolean {
  return hasClass(style, 'assassin') || hasClass(style, 'mage') || style.threat === 'hybrid'
}

function normalizeScore(score: number): number {
  const clamped = Math.max(0.25, Math.min(MAX_SYNERGY_SCORE, score))
  return Math.round(clamped * 4) / 4
}

function setPair(table: SynergyTable, a: number, b: number, score: number): void {
  const left = String(Math.min(a, b))
  const right = String(Math.max(a, b))
  const row = table[left] ?? {}
  row[right] = Math.max(row[right] ?? 0, normalizeScore(score))
  table[left] = row
}

function countPairs(table: SynergyTable): number {
  return Object.values(table).reduce((total, row) => total + Object.keys(row).length, 0)
}
