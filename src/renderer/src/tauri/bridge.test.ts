import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installTauriBridge } from './bridge'
import { invokeTauriCommand } from './commands'

vi.mock('./commands', () => ({
  emitTauriEvent: vi.fn(),
  invokeTauriCommand: vi.fn(async (command: string) => {
    if (command === 'overlay_toggle') {
      return { ok: true, visible: true, created: true, route: 'overlay' }
    }
    if (command === 'overlay_status') {
      return { ok: true, exists: true, visible: true, title: 'Nexus Draft Overlay' }
    }
    if (command === 'overlay_shortcuts_status') {
      return { ok: true, registered: ['Insert', 'F9', 'F10'], failed: [] }
    }
    if (command === 'lcu_diagnostics') {
      return { checkedPaths: [], detectedProcesses: [], lockfileFound: false, lcuReachable: false }
    }
    return null
  }),
  listenTauriEvent: vi.fn(() => () => {})
}))

describe('installTauriBridge overlay commands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as unknown as { window: unknown }).window = {
      location: { hash: '', search: '' },
      setTimeout,
      setInterval,
      clearInterval
    }
  })

  it('routes overlay status APIs to the expected Rust commands', async () => {
    installTauriBridge()
    await window.drafter.toggleOverlay()
    await window.drafter.getOverlayStatus()
    await window.drafter.getOverlayShortcutStatus()
    await window.drafter.getLcuDiagnostics()

    expect(invokeTauriCommand).toHaveBeenCalledWith('overlay_toggle')
    expect(invokeTauriCommand).toHaveBeenCalledWith('overlay_status')
    expect(invokeTauriCommand).toHaveBeenCalledWith('overlay_shortcuts_status')
    expect(invokeTauriCommand).toHaveBeenCalledWith('lcu_diagnostics')
  })
})
