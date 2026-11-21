import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DRAFT_OVERLAY,
  DEFAULT_OVERLAY_LAYOUT,
  FULL_DRAFT_VIEW,
  boxLabel,
  moveBlockTo,
  normalizeDraftOverlay,
  normalizeOverlayLayout,
  placeOf,
  removeBox,
  shiftBlock
} from './overlayLayout'

describe('champ select overlay settings', () => {
  it('default to a plain list: top 5 picks with their win chance, opening and closing with champ select', () => {
    const draft = normalizeOverlayLayout(null).draft
    expect(draft).toEqual(DEFAULT_DRAFT_OVERLAY)
    expect(draft.picks).toBe(5)
    expect(Object.entries(draft.pickDetails).filter(([, on]) => on).map(([key]) => key)).toEqual(['delta'])
    expect(Object.values(draft.sections).some(Boolean)).toBe(false)
    expect(draft.openOnChampSelect).toBe(true)
    expect(draft.closeAfterChampSelect).toBe(true)
    expect(draft.openPageOnChampSelect).toBe(true)
    expect(draft.closePageAfterChampSelect).toBe(true)
  })

  it('give the Live page every section and detail, with no overlay chrome', () => {
    expect(Object.values(FULL_DRAFT_VIEW.sections).every(Boolean)).toBe(true)
    expect(Object.values(FULL_DRAFT_VIEW.pickDetails).every(Boolean)).toBe(true)
    expect(FULL_DRAFT_VIEW.extras).toEqual({ tabs: false, dataStatus: false, hotkeys: false, engine: true, tables: true })
    expect(normalizeDraftOverlay({ openPageOnChampSelect: false, closePageAfterChampSelect: 1 })).toMatchObject({
      openPageOnChampSelect: false,
      closePageAfterChampSelect: true
    })
  })

  it('give layouts saved before these settings existed the plain defaults', () => {
    const layout = normalizeOverlayLayout({ main: ['next'], boxes: [], showSkills: false })
    expect(layout.showSkills).toBe(false)
    expect(layout.draft).toEqual(DEFAULT_DRAFT_OVERLAY)
  })

  it('keep valid choices and fall back field by field on junk', () => {
    const draft = normalizeDraftOverlay({
      picks: 8,
      sections: { board: true, lookup: 'yes', bogus: true },
      pickDetails: { delta: false, runes: true },
      extras: null,
      openOnChampSelect: false,
      closeAfterChampSelect: 'no'
    })
    expect(draft.picks).toBe(8)
    expect(draft.sections).toEqual({ ...DEFAULT_DRAFT_OVERLAY.sections, board: true })
    expect(draft.pickDetails).toEqual({ ...DEFAULT_DRAFT_OVERLAY.pickDetails, delta: false, runes: true })
    expect(draft.extras).toEqual(DEFAULT_DRAFT_OVERLAY.extras)
    expect(draft.openOnChampSelect).toBe(false)
    expect(draft.closeAfterChampSelect).toBe(true)
    expect(normalizeDraftOverlay({ picks: 7 }).picks).toBe(5)
  })

  it('never hand out the shared default objects', () => {
    const a = normalizeOverlayLayout(null)
    const b = normalizeOverlayLayout(null)
    expect(a.draft).not.toBe(b.draft)
    expect(a.draft.sections).not.toBe(DEFAULT_DRAFT_OVERLAY.sections)
  })
})

describe('overlay layout', () => {
  it('starts with every section in the main overlay and no boxes', () => {
    const layout = normalizeOverlayLayout(null)
    expect(layout).toEqual(DEFAULT_OVERLAY_LAYOUT)
    expect(placeOf(layout, 'enemy')).toBe('main')
  })

  it('keeps each section in one place and drops junk from disk or IPC', () => {
    const layout = normalizeOverlayLayout({
      main: ['next', 'enemy', 'bogus', 'next'],
      boxes: [
        { id: 'box-1', blocks: ['enemy', 'build'] },
        { id: 'box-2', blocks: [] },
        { id: 'BAD ID', blocks: ['adapt'] },
        { id: 'box-1', blocks: ['adapt'] }
      ],
      boxVisibility: 'sometimes',
      showSkills: false
    })
    expect(layout.main).toEqual(['next', 'enemy'])
    expect(layout.boxes).toEqual([{ id: 'box-1', blocks: ['build'] }])
    expect(layout.boxVisibility).toBe('always')
    expect(layout.showSkills).toBe(false)
    expect(placeOf(layout, 'adapt')).toBe('hidden')
  })

  it('moves sections into new and existing boxes, and back', () => {
    let layout = normalizeOverlayLayout(null)
    layout = moveBlockTo(layout, 'next', 'new')
    expect(layout.boxes).toEqual([{ id: 'box-1', blocks: ['next'] }])
    expect(layout.main).toEqual(['build', 'adapt', 'enemy'])
    layout = moveBlockTo(layout, 'enemy', 'new')
    layout = moveBlockTo(layout, 'build', { box: 'box-1' })
    expect(layout.boxes).toEqual([
      { id: 'box-1', blocks: ['next', 'build'] },
      { id: 'box-2', blocks: ['enemy'] }
    ])
    expect(boxLabel(layout, 'box-2')).toBe('Box 2')
    // Moving a box's only section out closes the box.
    layout = moveBlockTo(layout, 'enemy', 'main')
    expect(layout.boxes.map((b) => b.id)).toEqual(['box-1'])
    expect(layout.main).toEqual(['adapt', 'enemy'])
    layout = moveBlockTo(layout, 'adapt', 'hidden')
    expect(placeOf(layout, 'adapt')).toBe('hidden')
  })

  it('reorders within a container and closes boxes back into the main overlay', () => {
    let layout = moveBlockTo(moveBlockTo(normalizeOverlayLayout(null), 'next', 'new'), 'build', { box: 'box-1' })
    layout = shiftBlock(layout, 'build', -1)
    expect(layout.boxes[0]!.blocks).toEqual(['build', 'next'])
    layout = shiftBlock(layout, 'enemy', 1)
    expect(layout.main).toEqual(['adapt', 'enemy'])
    layout = shiftBlock(layout, 'enemy', -1)
    expect(layout.main).toEqual(['enemy', 'adapt'])
    layout = removeBox(layout, 'box-1')
    expect(layout.boxes).toEqual([])
    expect(layout.main).toEqual(['enemy', 'adapt', 'build', 'next'])
  })

  it('reuses freed box numbers and caps the number of boxes', () => {
    let layout = normalizeOverlayLayout(null)
    for (const block of ['next', 'build', 'adapt', 'enemy'] as const) {
      layout = moveBlockTo(layout, block, 'new')
    }
    expect(layout.boxes.map((b) => b.id)).toEqual(['box-1', 'box-2', 'box-3', 'box-4'])
    layout = removeBox(layout, 'box-2')
    layout = moveBlockTo(layout, 'build', 'new')
    expect(layout.boxes.map((b) => b.id)).toEqual(['box-1', 'box-3', 'box-4', 'box-2'])
  })
})
