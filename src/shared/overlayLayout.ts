/**
 * In-game overlay layout: which info sections show, and where.
 *
 * Every section lives in exactly one place: the main overlay, one of up to four floating
 * boxes (separate small windows the player drags anywhere on screen), or hidden. Stored by
 * the main process so every window renders the same layout.
 */

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
  boxVisibility: 'always'
}

/** Where a section currently lives. */
export type BlockPlace = 'main' | 'hidden' | { box: string }

export function isLiveBlock(value: unknown): value is LiveBlock {
  return typeof value === 'string' && (LIVE_BLOCKS as readonly string[]).includes(value)
}

function cloneDefault(): OverlayLayout {
  return { ...DEFAULT_OVERLAY_LAYOUT, main: [...DEFAULT_OVERLAY_LAYOUT.main], boxes: [] }
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
    boxVisibility: r.boxVisibility === 'peek' ? 'peek' : 'always'
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
