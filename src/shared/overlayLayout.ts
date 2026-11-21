/**
 * What the overlay shows, in champ select (`draft`) and in game (everything else).
 *
 * In game, every section lives in exactly one place: the main overlay, one of up to four
 * floating boxes (separate small windows the player drags anywhere on screen), or hidden.
 * Stored by the main process so every window renders the same layout.
 */

/** Optional panels under the champ select pick list, in the order they render. */
export const DRAFT_SECTIONS = ['board', 'matchups', 'intel', 'lookup', 'coaching'] as const
export type DraftSection = (typeof DRAFT_SECTIONS)[number]

export const DRAFT_SECTION_LABELS: Record<DraftSection, string> = {
  board: 'Both teams',
  matchups: 'Your matchups',
  intel: 'Draft intel',
  lookup: 'Champion search',
  coaching: 'Coaching'
}

/** Extra info on each pick row. The portrait and name always show. */
export const PICK_DETAILS = ['delta', 'score', 'beats', 'pairs', 'runes', 'tips', 'build'] as const
export type PickDetail = (typeof PICK_DETAILS)[number]

export const PICK_DETAIL_LABELS: Record<PickDetail, string> = {
  delta: 'Win chance',
  score: 'Score',
  beats: 'Beats',
  pairs: 'Pairs with',
  runes: 'Runes',
  tips: 'Tips',
  build: 'Build'
}

/** Overlay chrome while drafting. */
export const DRAFT_EXTRAS = ['tabs', 'dataStatus', 'hotkeys', 'engine', 'tables'] as const
export type DraftExtra = (typeof DRAFT_EXTRAS)[number]

export const DRAFT_EXTRA_LABELS: Record<DraftExtra, string> = {
  tabs: 'Draft/Build tabs',
  dataStatus: 'Data status',
  hotkeys: 'Hotkey hint',
  engine: 'Engine settings',
  tables: 'Full tables'
}

export const DRAFT_PICK_COUNTS = [3, 5, 8] as const

/** Champ select overlay: by default just your top picks for your role; the rest is opt-in. */
export type DraftOverlayPrefs = {
  /** How many top picks the list shows (one of DRAFT_PICK_COUNTS). */
  picks: number
  sections: Record<DraftSection, boolean>
  pickDetails: Record<PickDetail, boolean>
  extras: Record<DraftExtra, boolean>
  /** Show the overlay when champ select starts. */
  openOnChampSelect: boolean
  /** Hide it when champ select ends (the game starts, or someone dodges). */
  closeAfterChampSelect: boolean
  /** Bring the main window up on its Live page (the full Draft tab) when champ select starts. */
  openPageOnChampSelect: boolean
  /** Hide that window again when champ select ends, if champ select is what opened it. */
  closePageAfterChampSelect: boolean
}

export const DEFAULT_DRAFT_OVERLAY: DraftOverlayPrefs = {
  picks: 5,
  sections: { board: false, matchups: false, lookup: false, intel: false, coaching: false },
  pickDetails: { delta: true, score: false, beats: false, pairs: false, runes: false, tips: false, build: false },
  extras: { tabs: true, dataStatus: false, hotkeys: true, engine: false, tables: false },
  openOnChampSelect: true,
  closeAfterChampSelect: true,
  openPageOnChampSelect: true,
  closePageAfterChampSelect: true
}

/** The Live page (04) shows everything; it has room the overlay doesn't. */
export const FULL_DRAFT_VIEW: DraftOverlayPrefs = {
  ...DEFAULT_DRAFT_OVERLAY,
  picks: 8,
  sections: { board: true, matchups: true, intel: true, lookup: true, coaching: true },
  pickDetails: { delta: true, score: true, beats: true, pairs: true, runes: true, tips: true, build: true },
  extras: { tabs: false, dataStatus: false, hotkeys: false, engine: true, tables: true }
}

function readFlags<K extends string>(keys: readonly K[], raw: unknown, fallback: Record<K, boolean>): Record<K, boolean> {
  const r = raw != null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return Object.fromEntries(keys.map((key) => [key, typeof r[key] === 'boolean' ? r[key] : fallback[key]])) as Record<K, boolean>
}

/** Missing or bad fields fall back to the simple defaults; unknown keys are dropped. */
export function normalizeDraftOverlay(raw: unknown): DraftOverlayPrefs {
  const r = raw != null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const d = DEFAULT_DRAFT_OVERLAY
  return {
    picks: (DRAFT_PICK_COUNTS as readonly unknown[]).includes(r.picks) ? (r.picks as number) : d.picks,
    sections: readFlags(DRAFT_SECTIONS, r.sections, d.sections),
    pickDetails: readFlags(PICK_DETAILS, r.pickDetails, d.pickDetails),
    extras: readFlags(DRAFT_EXTRAS, r.extras, d.extras),
    openOnChampSelect: typeof r.openOnChampSelect === 'boolean' ? r.openOnChampSelect : d.openOnChampSelect,
    closeAfterChampSelect: typeof r.closeAfterChampSelect === 'boolean' ? r.closeAfterChampSelect : d.closeAfterChampSelect,
    openPageOnChampSelect: typeof r.openPageOnChampSelect === 'boolean' ? r.openPageOnChampSelect : d.openPageOnChampSelect,
    closePageAfterChampSelect:
      typeof r.closePageAfterChampSelect === 'boolean' ? r.closePageAfterChampSelect : d.closePageAfterChampSelect
  }
}

export const LIVE_BLOCKS = ['next', 'build', 'adapt', 'enemy'] as const
export type LiveBlock = (typeof LIVE_BLOCKS)[number]

export const LIVE_BLOCK_LABELS: Record<LiveBlock, string> = {
  next: 'Next buy',
  build: 'Your build',
  adapt: 'Item swaps',
  enemy: 'Enemy team'
}

export type OverlayBox = { id: string; blocks: LiveBlock[] }

/** always: boxes stay up for the whole game. peek: only while the peek key shows them. */
export type BoxVisibility = 'always' | 'peek'

export type OverlayLayout = {
  /** Sections inside the main overlay's Build tab, in order. */
  main: LiveBlock[]
  boxes: OverlayBox[]
  /** Latest enemy buys as chips next to the Enemy label. */
  showNewBuys: boolean
  /** Skill max order chip. */
  showSkills: boolean
  boxVisibility: BoxVisibility
  /** What the Draft tab shows in champ select, and whether the overlay opens/closes with it. */
  draft: DraftOverlayPrefs
}

export type OverlayLayoutState = {
  layout: OverlayLayout
  /** "Arrange boxes" mode: boxes are shown (with placeholders) so they can be dragged into place. */
  arranging: boolean
  /** Box windows are on screen right now. */
  boxesVisible: boolean
}

export const MAX_OVERLAY_BOXES = 4

export const DEFAULT_OVERLAY_LAYOUT: OverlayLayout = {
  main: [...LIVE_BLOCKS],
  boxes: [],
  showNewBuys: true,
  showSkills: true,
  boxVisibility: 'always',
  draft: DEFAULT_DRAFT_OVERLAY
}

/** Where a section currently lives. */
export type BlockPlace = 'main' | 'hidden' | { box: string }

export function isLiveBlock(value: unknown): value is LiveBlock {
  return typeof value === 'string' && (LIVE_BLOCKS as readonly string[]).includes(value)
}

function cloneDefault(): OverlayLayout {
  return { ...DEFAULT_OVERLAY_LAYOUT, main: [...DEFAULT_OVERLAY_LAYOUT.main], boxes: [], draft: normalizeDraftOverlay(null) }
}

/**
 * Defensive normalize for anything read from disk or sent over IPC: unknown sections dropped,
 * each section kept in its first place only, empty boxes removed, at most four boxes.
 */
export function normalizeOverlayLayout(raw: unknown): OverlayLayout {
  if (raw == null || typeof raw !== 'object') {
    return cloneDefault()
  }
  const r = raw as Record<string, unknown>
  const seen = new Set<LiveBlock>()
  const take = (list: unknown): LiveBlock[] =>
    (Array.isArray(list) ? list : []).filter((value): value is LiveBlock => {
      if (!isLiveBlock(value) || seen.has(value)) {
        return false
      }
      seen.add(value)
      return true
    })
  const main = take(r.main)
  const boxes: OverlayBox[] = []
  for (const rawBox of Array.isArray(r.boxes) ? r.boxes : []) {
    if (boxes.length >= MAX_OVERLAY_BOXES || rawBox == null || typeof rawBox !== 'object') {
      continue
    }
    const box = rawBox as Record<string, unknown>
    const id = typeof box.id === 'string' && /^[a-z0-9-]{1,24}$/.test(box.id) ? box.id : null
    const blocks = take(box.blocks)
    if (id && blocks.length && !boxes.some((b) => b.id === id)) {
      boxes.push({ id, blocks })
    }
  }
  return {
    main,
    boxes,
    showNewBuys: r.showNewBuys !== false,
    showSkills: r.showSkills !== false,
    boxVisibility: r.boxVisibility === 'peek' ? 'peek' : 'always',
    draft: normalizeDraftOverlay(r.draft)
  }
}

export function placeOf(layout: OverlayLayout, block: LiveBlock): BlockPlace {
  if (layout.main.includes(block)) {
    return 'main'
  }
  const box = layout.boxes.find((b) => b.blocks.includes(block))
  return box ? { box: box.id } : 'hidden'
}

/** "Box 1", "Box 2"... in on-screen creation order. */
export function boxLabel(layout: OverlayLayout, boxId: string): string {
  const idx = layout.boxes.findIndex((b) => b.id === boxId)
  return idx >= 0 ? `Box ${idx + 1}` : 'Box'
}

function withoutBlock(layout: OverlayLayout, block: LiveBlock): OverlayLayout {
  return {
    ...layout,
    main: layout.main.filter((b) => b !== block),
    boxes: layout.boxes.map((box) => ({ ...box, blocks: box.blocks.filter((b) => b !== block) })).filter((box) => box.blocks.length)
  }
}

function nextBoxId(layout: OverlayLayout): string {
  for (let n = 1; ; n += 1) {
    const id = `box-${n}`
    if (!layout.boxes.some((b) => b.id === id)) {
      return id
    }
  }
}

/** Move a section to the main overlay, an existing box, a brand-new box, or hide it. */
export function moveBlockTo(layout: OverlayLayout, block: LiveBlock, target: 'main' | 'hidden' | 'new' | { box: string }): OverlayLayout {
  const rest = withoutBlock(layout, block)
  if (target === 'hidden') {
    return rest
  }
  if (target === 'main') {
    return { ...rest, main: [...rest.main, block] }
  }
  if (target === 'new') {
    if (rest.boxes.length >= MAX_OVERLAY_BOXES) {
      return layout
    }
    return { ...rest, boxes: [...rest.boxes, { id: nextBoxId(rest), blocks: [block] }] }
  }
  if (!rest.boxes.some((b) => b.id === target.box)) {
    return layout
  }
  return { ...rest, boxes: rest.boxes.map((box) => (box.id === target.box ? { ...box, blocks: [...box.blocks, block] } : box)) }
}

/** Reorder a section within whatever holds it. */
export function shiftBlock(layout: OverlayLayout, block: LiveBlock, delta: -1 | 1): OverlayLayout {
  const shift = (list: LiveBlock[]): LiveBlock[] => {
    const from = list.indexOf(block)
    const to = from + delta
    if (from < 0 || to < 0 || to >= list.length) {
      return list
    }
    const next = [...list]
    next.splice(from, 1)
    next.splice(to, 0, block)
    return next
  }
  if (layout.main.includes(block)) {
    return { ...layout, main: shift(layout.main) }
  }
  return { ...layout, boxes: layout.boxes.map((box) => (box.blocks.includes(block) ? { ...box, blocks: shift(box.blocks) } : box)) }
}

/** Close a box; its sections go back into the main overlay. */
export function removeBox(layout: OverlayLayout, boxId: string): OverlayLayout {
  const box = layout.boxes.find((b) => b.id === boxId)
  if (!box) {
    return layout
  }
  return { ...layout, main: [...layout.main, ...box.blocks], boxes: layout.boxes.filter((b) => b.id !== boxId) }
}
