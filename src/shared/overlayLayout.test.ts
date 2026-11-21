import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OVERLAY_LAYOUT,
  boxLabel,
  moveBlockTo,
  normalizeOverlayLayout,
  placeOf,
  removeBox,
  shiftBlock
} from './overlayLayout'

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
