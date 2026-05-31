import { canonicalItemName, type ItemLite } from '../dataDragon'
import type { ChampionBuildProfile, DraftItemEnemyTarget, DraftItemPlan, DraftItemRef, DraftItemThreat, DraftRole } from './types'

export type ItemPhase = DraftItemRef['phase']

export type ItemProfile = {
  phase: ItemPhase
  tags: string[]
}

export type ChampionKitProfile = {
  hardCc: boolean
  softCc: boolean
  shield: boolean
  heal: boolean
  mobility: boolean
  poke: boolean
  burst: boolean
  sustain: boolean
  stealth: boolean
  execute: boolean
}

export type AdaptiveItemContext = {
  championName: string
  role: DraftRole
  buildProfile: ChampionBuildProfile | null | undefined
  ally: {
    magic: number
    physical: number
    frontline: number
    engage: number
    scaling: number
    slots: number
  }
  enemy: {
    magic: number
    physical: number
    frontline: number
    tanks: number
    assassins: number
    supports: number
    dive: number
    poke: number
    pick: number
    sustain: number
    marksmen: number
    hardCc: number
    healing: number
    shielding: number
    mobility: number
    burst: number
  }
  enemyDetails?: {
    championId: number
    name: string
    threat: 'ad' | 'ap' | 'hybrid' | 'utility'
    classes: string[]
    hardCc: boolean
    healing: boolean
    shielding: boolean
    mobility: boolean
    burst: boolean
    poke: boolean
    defaultBuildTags?: string[]
  }[]
  defaultBuild?: {
    source: 'ugg'
    starting: DraftItemRef[]
    boots: DraftItemRef[]
    core: DraftItemRef[]
    final: DraftItemRef[]
    defaultItemIds: number[]
  } | null
  laneThreat: 'ad' | 'ap' | 'hybrid' | 'utility' | null
  fallback: Pick<DraftItemPlan, 'core' | 'boots' | 'defensive' | 'situational' | 'notes'>
}

const HARD_CC_RE = /\b(stuns?|roots?|snares?|charms?|fears?|taunts?|knock(?:ed)?\s*up|airborne|suppresses?|suppression|sleeps?|polymorphs?|silences?|dazes?)\b/i
const SOFT_CC_RE = /\b(slows?|cripples?|grounded|disarms?|blinds?)\b/i
const SHIELD_RE = /\bshield|barrier\b/i
const HEAL_RE = /\bheals?|restore health|regenerates?\b/i
const DASH_RE = /\b(dashes?|blinks?|leaps?|teleports?|lunges?|vaults?|charges?)\b/i
const POKE_RE = /\b(range|missile|projectile|poke|line|beam|long range)\b/i
const BURST_RE = /\b(burst|detonate|explod|critical|execute|bonus damage)\b/i
const STEALTH_RE = /\b(stealth|camouflage|invisible|invisibility)\b/i
const EXECUTE_RE = /\bexecute|missing health\b/i

export function normalizeRulesText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function textForItem(item: ItemLite): string {
  return `${item.name} ${item.plaintext} ${normalizeRulesText(item.description)} ${item.tags.join(' ')}`
}

function hasAny(text: string, patterns: (RegExp | string)[]): boolean {
  return patterns.some((pattern) => typeof pattern === 'string' ? text.includes(pattern.toLowerCase()) : pattern.test(text))
}

function add(tags: Set<string>, condition: boolean, tag: string): void {
  if (condition) {
    tags.add(tag)
  }
}

function stat(item: ItemLite, key: string): number {
  const value = item.stats[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function classifyItem(item: ItemLite): ItemProfile {
  const tags = new Set<string>()
  const lower = textForItem(item).toLowerCase()
  const riotTags = item.tags.map((tag) => tag.toLowerCase())
  const name = item.name.toLowerCase()
  const total = item.gold.total
  const boot = riotTags.includes('boots') || /\b(boots|greaves|treads|steelcaps|shoes)\b/i.test(item.name)
  const consumable = item.consumed === true || riotTags.includes('consumable') || hasAny(lower, ['potion', 'elixir', 'control ward'])
  const starter =
    !boot &&
    !consumable &&
    total > 0 &&
    total <= 700 &&
    hasAny(lower, [/doran/, /world atlas/, /jungle/, /scorchclaw/, /gustwalker/, /mosstomper/, /cull/, /tear of the goddess/])
  const component = !boot && !starter && Array.isArray(item.into) && item.into.length > 0
  const completed = !boot && !starter && !consumable && (!item.into?.length || total >= 2200 || (item.depth ?? 0) >= 3)
  const phase: ItemPhase = boot ? 'boots' : consumable ? 'consumable' : starter ? 'starter' : component ? 'component' : completed ? 'completed' : 'component'

  add(tags, boot, 'boots')
  add(tags, starter, 'starter')
  add(tags, component, 'component')
  add(tags, completed, 'completed')
  add(tags, stat(item, 'FlatPhysicalDamageMod') > 0 || riotTags.includes('damage') || hasAny(lower, ['attack damage']), 'ad')
  add(tags, stat(item, 'FlatMagicDamageMod') > 0 || riotTags.includes('spell_damage') || hasAny(lower, ['ability power']), 'ap')
  add(tags, stat(item, 'FlatArmorMod') > 0 || hasAny(lower, ['armor']), 'armor')
  add(tags, stat(item, 'FlatSpellBlockMod') > 0 || hasAny(lower, ['magic resist']), 'mr')
  add(tags, stat(item, 'FlatHPPoolMod') > 0 || hasAny(lower, ['health']), 'health')
  add(tags, stat(item, 'FlatMPPoolMod') > 0 || hasAny(lower, ['mana']), 'mana')
  add(tags, stat(item, 'PercentAttackSpeedMod') > 0 || riotTags.includes('attack_speed') || hasAny(lower, ['attack speed']), 'attack-speed')
  add(tags, stat(item, 'FlatCritChanceMod') > 0 || riotTags.includes('critical_strike') || hasAny(lower, ['critical strike', 'crit chance']), 'crit')
  add(tags, stat(item, 'FlatMovementSpeedMod') > 0 || boot || hasAny(lower, ['move speed', 'movement speed']), 'move-speed')
  add(tags, hasAny(lower, ['ability haste', 'haste', 'cooldown']), 'haste')
  add(tags, hasAny(lower, ['life steal', 'lifesteal', 'omnivamp', 'vamp']), 'lifesteal')
  add(tags, hasAny(lower, ['lethality']), 'lethality')
  add(tags, hasAny(lower, ['magic penetration', 'magic pen']), 'magic-pen')
  add(tags, hasAny(lower, ['armor penetration', 'armor pen', 'armor reduction', 'armor shred']), 'armor-pen')
  add(tags, hasAny(lower, ['grievous wounds']) || ['executioner', 'oblivion orb', 'bramble vest', 'mortal reminder', 'morellonomicon', 'thornmail'].some((needle) => name.includes(needle)), 'anti-heal')
  add(tags, hasAny(lower, ['shield reaver']) || name.includes("serpent's fang"), 'anti-shield')
  add(tags, hasAny(lower, ['percent health', 'maximum health', 'current health', 'burn']) || ['black cleaver', 'liandry', 'void staff', 'cryptbloom', 'terminus', 'lord dominik', 'blade of the ruined king', 'kraken'].some((needle) => name.includes(needle)), 'anti-tank')
  add(tags, hasAny(lower, ['stasis', 'spell shield', 'lifeline', 'resurrect', 'revives']) || ['zhonya', 'banshee', 'guardian angel', 'shieldbow', 'sterak', 'maw of malmortius', "death's dance", 'jak', 'randuin'].some((needle) => name.includes(needle)), 'anti-burst')
  add(tags, hasAny(lower, ['tenacity', 'slow resist', 'cleanse', 'quicksilver', 'remove all crowd control']) || ['mercury', "mikael", 'merc scimitar', 'qss'].some((needle) => name.includes(needle)), 'anti-cc')
  add(tags, hasAny(lower, ['regeneration', 'regen', 'heal and shield power', 'redemption', 'warmog']) || tags.has('lifesteal'), 'sustain')
  add(tags, riotTags.includes('goldper') || riotTags.includes('vision') || hasAny(lower, ['ward', 'support quest', 'heal and shield power']), 'support')
  add(tags, hasAny(lower, ['jungle monster', 'jungle companion', 'smite']) || ['scorchclaw', 'gustwalker', 'mosstomper'].some((needle) => name.includes(needle)), 'jungle')
  add(tags, hasAny(lower, ['shield', 'heal and shield power', 'ally']), 'enchanter')
  add(tags, hasAny(lower, ['on-hit', 'basic attacks', 'attack speed']), 'marksman')
  add(tags, hasAny(lower, ['ability power', 'magic damage', 'mana']), 'mage')
  add(tags, hasAny(lower, ['armor', 'magic resist', 'health']) && !tags.has('ad') && !tags.has('ap'), 'tank')
  add(tags, tags.has('ad') && (tags.has('health') || tags.has('lifesteal') || tags.has('haste')), 'bruiser')
  add(tags, tags.has('lethality') || hasAny(lower, ['burst', 'dash']), 'assassin')

  return { phase, tags: Array.from(tags).sort() }
}

export function championKitProfileFromTexts(texts: string[]): ChampionKitProfile {
  const text = normalizeRulesText(texts.join(' '))
  return {
    hardCc: HARD_CC_RE.test(text),
    softCc: SOFT_CC_RE.test(text),
    shield: SHIELD_RE.test(text),
    heal: HEAL_RE.test(text),
    mobility: DASH_RE.test(text),
    poke: POKE_RE.test(text),
    burst: BURST_RE.test(text),
    sustain: HEAL_RE.test(text) || /\blife steal|omnivamp|regenerate\b/i.test(text),
    stealth: STEALTH_RE.test(text),
    execute: EXECUTE_RE.test(text)
  }
}

function championClasses(profile: ChampionBuildProfile | null | undefined): string[] {
  const tags = `${profile?.tagsLine ?? ''} ${profile?.archetype ?? ''}`.toLowerCase()
  return ['marksman', 'mage', 'fighter', 'tank', 'support', 'assassin'].filter((cls) => tags.includes(cls))
}

function itemRef(item: ItemLite, score: number, profile: ItemProfile, reason: string): DraftItemRef {
  return {
    itemId: item.id,
    name: item.name,
    reason,
    score: Math.round(score * 10) / 10,
    tags: profile.tags,
    phase: profile.phase,
    cost: item.gold.total
  }
}

function tagReason(tag: string): string {
  switch (tag) {
    case 'anti-heal':
      return 'healing'
    case 'anti-shield':
      return 'shields'
    case 'anti-tank':
      return 'frontline'
    case 'anti-burst':
      return 'burst'
    case 'anti-cc':
      return 'hard CC'
    case 'armor':
      return 'physical damage'
    case 'mr':
      return 'magic damage'
    case 'sustain':
      return 'poke/sustain'
    default:
      return tag
  }
}

function pushTarget(targets: DraftItemEnemyTarget[], target: DraftItemEnemyTarget): void {
  if (!targets.some((row) => row.championId === target.championId && row.reason === target.reason)) {
    targets.push(target)
  }
}

function enemyTargets(profile: ItemProfile, ctx: AdaptiveItemContext): DraftItemEnemyTarget[] {
  const targets: DraftItemEnemyTarget[] = []
  for (const enemy of ctx.enemyDetails ?? []) {
    const classes = new Set(enemy.classes)
    const defaultTags = new Set(enemy.defaultBuildTags ?? [])
    const p = profile.tags
    const base = { championId: enemy.championId, championName: enemy.name }
    if (p.includes('mr') && (enemy.threat === 'ap' || enemy.threat === 'hybrid' || classes.has('mage'))) {
      pushTarget(targets, { ...base, reason: 'magic damage', source: 'teamThreat' })
    }
    if (p.includes('armor') && (enemy.threat === 'ad' || enemy.threat === 'hybrid' || classes.has('marksman') || classes.has('assassin') || classes.has('fighter'))) {
      pushTarget(targets, { ...base, reason: classes.has('marksman') ? 'crit DPS' : 'physical damage', source: 'teamThreat' })
    }
    if (p.includes('anti-heal') && (enemy.healing || classes.has('support') || defaultTags.has('lifesteal') || defaultTags.has('sustain'))) {
      pushTarget(targets, { ...base, reason: defaultTags.has('lifesteal') || defaultTags.has('sustain') ? 'default sustain' : 'healing', source: defaultTags.has('lifesteal') || defaultTags.has('sustain') ? 'defaultBuild' : 'kit' })
    }
    if (p.includes('anti-shield') && (enemy.shielding || classes.has('support') || defaultTags.has('anti-burst'))) {
      pushTarget(targets, { ...base, reason: defaultTags.has('anti-burst') ? 'defensive default' : 'shields', source: defaultTags.has('anti-burst') ? 'defaultBuild' : 'kit' })
    }
    if (p.includes('anti-tank') && (classes.has('tank') || classes.has('fighter') || defaultTags.has('health') || defaultTags.has('tank'))) {
      pushTarget(targets, { ...base, reason: defaultTags.has('health') || defaultTags.has('tank') ? 'health stack' : 'frontline', source: defaultTags.has('health') || defaultTags.has('tank') ? 'defaultBuild' : 'teamThreat' })
    }
    if (p.includes('armor-pen') && (classes.has('tank') || classes.has('fighter') || enemy.threat === 'ad' || defaultTags.has('armor'))) {
      pushTarget(targets, { ...base, reason: defaultTags.has('armor') ? 'armor stack' : 'frontline armor', source: defaultTags.has('armor') ? 'defaultBuild' : 'teamThreat' })
    }
    if (p.includes('magic-pen') && (classes.has('tank') || classes.has('fighter') || enemy.threat === 'ap' || enemy.threat === 'hybrid' || defaultTags.has('mr'))) {
      pushTarget(targets, { ...base, reason: defaultTags.has('mr') ? 'MR stack' : 'frontline MR', source: defaultTags.has('mr') ? 'defaultBuild' : 'teamThreat' })
    }
    if (p.includes('anti-burst') && (enemy.burst || classes.has('assassin') || enemy.mobility || defaultTags.has('crit') || defaultTags.has('attack-speed'))) {
      pushTarget(targets, { ...base, reason: defaultTags.has('crit') || defaultTags.has('attack-speed') ? 'default DPS path' : 'burst/dive', source: defaultTags.has('crit') || defaultTags.has('attack-speed') ? 'defaultBuild' : 'kit' })
    }
    if (p.includes('anti-cc') && (enemy.hardCc || classes.has('tank') || classes.has('support'))) {
      pushTarget(targets, { ...base, reason: 'hard CC', source: 'kit' })
    }
    if (p.includes('sustain') && (enemy.poke || classes.has('mage') || classes.has('marksman'))) {
      pushTarget(targets, { ...base, reason: 'poke', source: 'kit' })
    }
  }
  return targets.slice(0, 4)
}

function goodAgainst(targets: readonly DraftItemEnemyTarget[]): string[] {
  return targets.map((target) => target.championName).filter((value, idx, arr) => arr.indexOf(value) === idx).slice(0, 4)
}

function buildReason(profile: ItemProfile, ctx: AdaptiveItemContext, score: number): string {
  const reasons: string[] = []
  for (const tag of ['anti-heal', 'anti-shield', 'anti-tank', 'anti-burst', 'anti-cc', 'armor', 'mr', 'sustain']) {
    if (profile.tags.includes(tag)) {
      reasons.push(`answers ${tagReason(tag)}`)
    }
  }
  if (profile.tags.includes(ctx.buildProfile?.damage === 'ap' ? 'ap' : 'ad')) {
    reasons.push('fits champion damage')
  }
  if (ctx.ally.magic < 1 && profile.tags.includes('ap')) {
    reasons.push('adds missing AP')
  }
  if (ctx.ally.physical < 1 && profile.tags.includes('ad')) {
    reasons.push('adds missing AD')
  }
  if (reasons.length === 0) {
    reasons.push(score >= 70 ? 'strong general fit' : 'situational option')
  }
  return reasons.slice(0, 3).join(', ')
}

function scoreItem(item: ItemLite, profile: ItemProfile, ctx: AdaptiveItemContext): number {
  const p = profile.tags
  const classes = championClasses(ctx.buildProfile)
  const damage = ctx.buildProfile?.damage ?? 'flex'
  let score = 35
  if (profile.phase === 'completed') score += 20
  if (profile.phase === 'component') score += 7
  if (profile.phase === 'starter') score += 8
  if (profile.phase === 'boots') score += 12

  if (damage === 'ap') score += p.includes('ap') ? 22 : p.includes('ad') ? -26 : 0
  if (damage === 'ad') score += p.includes('ad') ? 22 : p.includes('ap') ? -26 : 0
  if (damage === 'mixed' || damage === 'flex') score += p.includes('ap') || p.includes('ad') ? 12 : 0
  if (classes.includes('marksman')) score += (p.includes('marksman') || p.includes('crit') || p.includes('attack-speed') || p.includes('ad')) ? 13 : 0
  if (classes.includes('mage')) score += (p.includes('mage') || p.includes('ap') || p.includes('mana') || p.includes('haste')) ? 13 : 0
  if (classes.includes('fighter')) score += (p.includes('bruiser') || p.includes('health') || p.includes('ad') || p.includes('lifesteal')) ? 11 : 0
  if (classes.includes('tank')) score += (p.includes('tank') || p.includes('health') || p.includes('armor') || p.includes('mr')) ? 14 : 0
  if (classes.includes('support')) score += (p.includes('support') || p.includes('enchanter') || p.includes('tank')) ? 14 : 0
  if (classes.includes('assassin')) score += (p.includes('assassin') || p.includes('lethality') || p.includes('ad') || p.includes('ap')) ? 10 : 0

  if (ctx.enemy.magic >= 3 || ctx.laneThreat === 'ap') score += p.includes('mr') ? 17 : 0
  if (ctx.enemy.physical >= 3 || ctx.laneThreat === 'ad' || ctx.enemy.marksmen >= 2) score += p.includes('armor') ? 17 : 0
  if (ctx.enemy.hardCc >= 2 || ctx.enemy.pick >= 3) score += p.includes('anti-cc') ? 18 : 0
  if (ctx.enemy.healing >= 2 || ctx.enemy.sustain >= 2 || ctx.enemy.supports >= 2) score += p.includes('anti-heal') ? 22 : 0
  if (ctx.enemy.shielding >= 2 || ctx.enemy.supports >= 2) score += p.includes('anti-shield') ? 18 : 0
  if (ctx.enemy.frontline >= 3 || ctx.enemy.tanks >= 2) score += p.includes('anti-tank') || p.includes('armor-pen') || p.includes('magic-pen') ? 21 : 0
  if (ctx.enemy.assassins >= 2 || ctx.enemy.dive >= 3 || ctx.enemy.burst >= 2) score += p.includes('anti-burst') || p.includes('health') ? 18 : 0
  if (ctx.enemy.poke >= 3) score += p.includes('sustain') || p.includes('move-speed') ? 12 : 0
  if (ctx.ally.magic < 1) score += p.includes('ap') ? 12 : p.includes('ad') ? -5 : 0
  if (ctx.ally.physical < 1) score += p.includes('ad') ? 12 : p.includes('ap') ? -5 : 0
  if (ctx.ally.frontline < 1 && (classes.includes('tank') || classes.includes('fighter'))) score += p.includes('health') || p.includes('armor') || p.includes('mr') ? 12 : 0

  if (ctx.role !== 'support' && p.includes('support')) score -= 28
  if (ctx.role !== 'jungle' && p.includes('jungle')) score -= 60
  if (ctx.role === 'jungle' && p.includes('jungle') && profile.phase === 'starter') score += 28
  if (ctx.role === 'support' && p.includes('support')) score += 18
  if (item.requiredChampion && item.requiredChampion.toLowerCase() !== ctx.championName.toLowerCase()) score -= 100
  if (profile.phase === 'consumable') score -= 25
  return score
}

function topRefs<T extends DraftItemRef>(rows: readonly T[], phase: ItemPhase, limit: number): T[] {
  return rows.filter((row) => row.phase === phase).slice(0, limit)
}

function dedupeRefs<T extends DraftItemRef>(rows: readonly T[], limit: number): T[] {
  const seen = new Set<number>()
  const seenNames = new Set<string>()
  const out: T[] = []
  for (const row of rows) {
    const nameKey = canonicalItemName(row.name)
    if (seen.has(row.itemId) || (nameKey && seenNames.has(nameKey))) {
      continue
    }
    seen.add(row.itemId)
    if (nameKey) {
      seenNames.add(nameKey)
    }
    out.push(row)
    if (out.length >= limit) {
      break
    }
  }
  return out
}

function dedupeScoredItems<T extends { item: ItemLite }>(rows: readonly T[]): T[] {
  const seen = new Set<number>()
  const seenNames = new Set<string>()
  const out: T[] = []
  for (const row of rows) {
    const nameKey = canonicalItemName(row.item.name)
    if (seen.has(row.item.id) || (nameKey && seenNames.has(nameKey))) {
      continue
    }
    seen.add(row.item.id)
    if (nameKey) {
      seenNames.add(nameKey)
    }
    out.push(row)
  }
  return out
}

function threatSummary(ctx: AdaptiveItemContext): DraftItemThreat[] {
  const out: DraftItemThreat[] = []
  if (ctx.enemy.magic >= 3) out.push({ label: 'Heavy AP', tone: 'danger', reason: 'Enemy magic damage is stacked.' })
  if (ctx.enemy.physical >= 3 || ctx.enemy.marksmen >= 2) out.push({ label: 'Heavy AD', tone: 'danger', reason: 'Enemy physical damage is stacked.' })
  if (ctx.enemy.hardCc >= 2 || ctx.enemy.pick >= 3) out.push({ label: 'Hard CC', tone: 'danger', reason: 'Enemy lockdown can deny rotations.' })
  if (ctx.enemy.healing >= 2 || ctx.enemy.sustain >= 2) out.push({ label: 'Healing', tone: 'warning', reason: 'Anti-heal gains value.' })
  if (ctx.enemy.shielding >= 2) out.push({ label: 'Shields', tone: 'warning', reason: 'Shield pressure or target selection matters.' })
  if (ctx.enemy.frontline >= 3 || ctx.enemy.tanks >= 2) out.push({ label: 'Frontline', tone: 'warning', reason: 'Anti-tank damage gains value.' })
  if (ctx.enemy.dive >= 3 || ctx.enemy.assassins >= 2) out.push({ label: 'Dive', tone: 'danger', reason: 'Defensive slots are high value.' })
  if (ctx.enemy.poke >= 3) out.push({ label: 'Poke', tone: 'warning', reason: 'Sustain, engage speed, or waveclear helps.' })
  if (ctx.ally.magic < 1 && ctx.ally.slots >= 3) out.push({ label: 'Missing AP', tone: 'info', reason: 'Your team may need magic damage.' })
  if (ctx.ally.physical < 1 && ctx.ally.slots >= 3) out.push({ label: 'Missing AD', tone: 'info', reason: 'Your team may need physical DPS.' })
  if (ctx.ally.frontline < 1 && ctx.ally.slots >= 3) out.push({ label: 'No Frontline', tone: 'info', reason: 'Bulkier builds can stabilize fights.' })
  return out.slice(0, 10)
}

export function buildAdaptiveItemPlan(items: readonly ItemLite[], ctx: AdaptiveItemContext): DraftItemPlan {
  const scored = dedupeScoredItems(
    items
      .map((item) => {
        const profile = classifyItem(item)
        const score = scoreItem(item, profile, ctx)
        return { item, profile, score }
      })
      .filter(({ item, profile, score }) => score > 20 && item.gold.total > 0 && !item.consumed && profile.phase !== 'consumable')
      .sort((a, b) => b.score - a.score || b.item.gold.total - a.item.gold.total || a.item.name.localeCompare(b.item.name))
  )

  const adaptiveRows = scored.slice(0, 60).map(({ item, profile, score }) => {
    const targets = enemyTargets(profile, ctx)
    return {
      ...itemRef(item, score, profile, buildReason(profile, ctx, score)),
      goodInto: profile.tags.map(tagReason).filter((value, idx, arr) => arr.indexOf(value) === idx).slice(0, 4),
      goodAgainst: goodAgainst(targets),
      avoidWhen: avoidWhen(profile, ctx),
      enemyTargets: targets
    }
  })
  const defaultRows = ctx.defaultBuild
    ? [...ctx.defaultBuild.starting, ...ctx.defaultBuild.boots, ...ctx.defaultBuild.core, ...ctx.defaultBuild.final].map((row) => ({
        ...row,
        goodInto: ['default path'],
        goodAgainst: [],
        avoidWhen: [],
        enemyTargets: []
      }))
    : []
  const matrixRows = dedupeRefs([...defaultRows, ...adaptiveRows], 24)
  const starting = ctx.defaultBuild?.starting.length ? ctx.defaultBuild.starting.slice(0, 2) : topRefs(adaptiveRows, 'starter', 2)
  const firstRecall = topRefs(adaptiveRows, 'component', 3)
  const boots = ctx.defaultBuild?.boots.length ? ctx.defaultBuild.boots.slice(0, 3) : topRefs(adaptiveRows, 'boots', 3)
  const completed = topRefs(matrixRows, 'completed', 20)
  const coreBuild = ctx.defaultBuild?.core.length
    ? ctx.defaultBuild.core.slice(0, 3)
    : dedupeRefs(completed.filter((row) => !row.tags.includes('support') || ctx.role === 'support'), 3)
  const situationalItems = dedupeRefs(
    adaptiveRows.filter((row) =>
      row.tags.some((tag) => ['anti-heal', 'anti-shield', 'anti-tank', 'anti-burst', 'anti-cc', 'armor', 'mr', 'sustain'].includes(tag))
    ),
    8
  )
  const seededFinal = ctx.defaultBuild?.final.length ? ctx.defaultBuild.final : []
  const finalBuild = dedupeRefs([...seededFinal, ...coreBuild, ...situationalItems, ...completed], 5)
  const bootChoice = boots[0] ?? null
  const finalWithBoots = bootChoice ? dedupeRefs([bootChoice, ...finalBuild], 6) : finalBuild.slice(0, 6)
  const defaultItemIds = ctx.defaultBuild?.defaultItemIds?.length
    ? ctx.defaultBuild.defaultItemIds
    : dedupeRefs([...starting, ...(bootChoice ? [bootChoice] : []), ...coreBuild, ...finalWithBoots], 12).map((row) => row.itemId)
  const names = (rows: DraftItemRef[]) => rows.map((row) => row.name).join(' -> ')
  const threats = threatSummary(ctx)
  return {
    ...ctx.fallback,
    core: coreBuild.length ? names(coreBuild) : ctx.fallback.core,
    boots: bootChoice ? `${bootChoice.name}: ${bootChoice.reason}` : ctx.fallback.boots,
    defensive: situationalItems[0] ? `${situationalItems[0].name}: ${situationalItems[0].reason}` : ctx.fallback.defensive,
    situational: situationalItems.slice(0, 5).map((row) => `${row.name}: ${row.reason}`),
    notes: [
      threats.length ? `Threats: ${threats.map((threat) => threat.label).join(', ')}.` : null,
      ...ctx.fallback.notes
    ].filter((line): line is string => Boolean(line)).slice(0, 4),
    defaultBuildSource: ctx.defaultBuild ? 'ugg' : 'adaptive',
    defaultItemIds,
    starting,
    firstRecall,
    bootChoice,
    bootAlternatives: boots.slice(1, 3),
    coreBuild,
    finalBuild: finalWithBoots,
    situationalItems,
    matrixRows,
    threatSummary: threats
  }
}

function avoidWhen(profile: ItemProfile, ctx: AdaptiveItemContext): string[] {
  const out: string[] = []
  if (profile.tags.includes('mr') && ctx.enemy.magic < 2) out.push('enemy AP is low')
  if (profile.tags.includes('armor') && ctx.enemy.physical < 2) out.push('enemy AD is low')
  if (profile.tags.includes('anti-heal') && ctx.enemy.healing < 2 && ctx.enemy.sustain < 2) out.push('healing is low')
  if (profile.tags.includes('anti-shield') && ctx.enemy.shielding < 2) out.push('shielding is low')
  if (profile.tags.includes('support') && ctx.role !== 'support') out.push('not support role')
  if (profile.tags.includes('jungle') && ctx.role !== 'jungle') out.push('not jungle role')
  return out.slice(0, 3)
}
