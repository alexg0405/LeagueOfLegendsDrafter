import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { PeekKey } from '../shared/desktopInterop'
import type { PeekController, PeekKeyReader } from './peekController'

/**
 * Win32 side of the in-game peek key.
 *
 * Reads key state with `GetAsyncKeyState` through koffi (prebuilt FFI, no compiler). That is a
 * poll of the OS key-state table: no keyboard or mouse hook is installed, nothing sits in the
 * game's input path, and the key press still reaches League.
 */

/** Virtual-key codes. `backquote` is VK_OEM_3 (the ` ~ key on US layouts). */
export const PEEK_KEY_VK: Record<PeekKey, number> = {
  capslock: 0x14,
  tab: 0x09,
  backquote: 0xc0,
  mouse4: 0x05,
  mouse5: 0x06
}
const VK_CONTROL = 0x11
const VK_MENU = 0x12
const VK_LWIN = 0x5b
const VK_RWIN = 0x5c
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
/** League's game window class (the client lobby is a different, Chromium window). */
const LEAGUE_WINDOW_CLASS = 'RiotWindowClass'
const LEAGUE_GAME_EXE = /\\league of legends\.exe$/i
export const PEEK_POLL_MS = 35

export type PeekReaderResult = { reader: PeekKeyReader; kind: 'win32' | 'fake' } | { reader: null; reason: string }

type KoffiPointer = unknown
type Koffi = {
  load(lib: string): { func(convention: string, name: string, result: string, args: string[]): (...args: unknown[]) => unknown }
  address?(ptr: KoffiPointer): bigint
}

function win32Reader(getKey: () => PeekKey, log: (...args: unknown[]) => void): PeekReaderResult {
  if (process.platform !== 'win32') {
    return { reader: null, reason: 'The peek key is Windows only.' }
  }
  let koffi: Koffi
  try {
    // Loaded lazily: a missing native binary must disable the feature, not crash the app.
    koffi = createRequire(import.meta.url)('koffi') as Koffi
  } catch (error) {
    log('[peek] koffi failed to load:', error)
    return { reader: null, reason: 'Key reader could not load on this PC.' }
  }
  try {
    const user32 = koffi.load('user32.dll')
    const kernel32 = koffi.load('kernel32.dll')
    const GetAsyncKeyState = user32.func('__stdcall', 'GetAsyncKeyState', 'int16', ['int32']) as (vk: number) => number
    const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'void *', []) as () => KoffiPointer | null
    const GetClassNameW = user32.func('__stdcall', 'GetClassNameW', 'int', ['void *', 'void *', 'int']) as (
      hwnd: KoffiPointer,
      buf: Buffer,
      max: number
    ) => number
    const GetWindowThreadProcessId = user32.func('__stdcall', 'GetWindowThreadProcessId', 'uint32', ['void *', 'void *']) as (
      hwnd: KoffiPointer,
      pid: Buffer
    ) => number
    const OpenProcess = kernel32.func('__stdcall', 'OpenProcess', 'void *', ['uint32', 'int', 'uint32']) as (
      access: number,
      inherit: number,
      pid: number
    ) => KoffiPointer | null
    const QueryFullProcessImageNameW = kernel32.func('__stdcall', 'QueryFullProcessImageNameW', 'int', [
      'void *',
      'uint32',
      'void *',
      'void *'
    ]) as (handle: KoffiPointer, flags: number, path: Buffer, size: Buffer) => number
    const CloseHandle = kernel32.func('__stdcall', 'CloseHandle', 'int', ['void *']) as (handle: KoffiPointer) => number

    const down = (vk: number) => (GetAsyncKeyState(vk) & 0x8000) !== 0
    let lastWindow: bigint | null = null
    let lastWasLeague = false

    const isLeagueWindow = (hwnd: KoffiPointer): boolean => {
      const classBuf = Buffer.alloc(512)
      const classLen = GetClassNameW(hwnd, classBuf, 256)
      if (classLen > 0 && classBuf.toString('utf16le', 0, classLen * 2) === LEAGUE_WINDOW_CLASS) {
        return true
      }
      // Fallback if Riot ever renames the window class: check the owning executable.
      const pidBuf = Buffer.alloc(4)
      GetWindowThreadProcessId(hwnd, pidBuf)
      const pid = pidBuf.readUInt32LE(0)
      if (!pid) {
        return false
      }
      const handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid)
      if (!handle) {
        return false
      }
      try {
        const pathBuf = Buffer.alloc(2048)
        const sizeBuf = Buffer.alloc(4)
        sizeBuf.writeUInt32LE(1024, 0)
        if (!QueryFullProcessImageNameW(handle, 0, pathBuf, sizeBuf)) {
          return false
        }
        return LEAGUE_GAME_EXE.test(pathBuf.toString('utf16le', 0, sizeBuf.readUInt32LE(0) * 2))
      } finally {
        CloseHandle(handle)
      }
    }

    const reader: PeekKeyReader = {
      // Read the setting every poll so a key change applies without a restart.
      keyDown: () => down(PEEK_KEY_VK[getKey()]),
      modifierDown: () => down(VK_MENU) || down(VK_CONTROL) || down(VK_LWIN) || down(VK_RWIN),
      leagueForeground: () => {
        try {
          const hwnd = GetForegroundWindow()
          if (!hwnd) {
            return false
          }
          const address = koffi.address ? koffi.address(hwnd) : null
          if (address != null && address === lastWindow) {
            return lastWasLeague
          }
          lastWindow = address
          lastWasLeague = isLeagueWindow(hwnd)
          return lastWasLeague
        } catch (error) {
          log('[peek] foreground check failed:', error)
          return false
        }
      }
    }
    reader.keyDown()
    return { reader, kind: 'win32' }
  } catch (error) {
    log('[peek] Win32 bindings failed:', error)
    return { reader: null, reason: 'Key reader could not bind to Windows.' }
  }
}

/**
 * Dev-only test seam: `NEXUS_PEEK_FAKE_FILE=<path>` makes "peek key down" mean "that file
 * contains 1", with League always in front. Lets the peek be exercised end to end without
 * injecting real keystrokes into the desktop. Ignored in packaged builds.
 */
function fakeReader(path: string): PeekReaderResult {
  const held = () => {
    try {
      return readFileSync(path, 'utf8').trim() === '1'
    } catch {
      return false
    }
  }
  return {
    reader: { keyDown: held, modifierDown: () => false, leagueForeground: () => true },
    kind: 'fake'
  }
}

export function createPeekKeyReader(opts: {
  allowFake: boolean
  getKey: () => PeekKey
  log: (...args: unknown[]) => void
}): PeekReaderResult {
  const fake = process.env['NEXUS_PEEK_FAKE_FILE']?.trim()
  if (opts.allowFake && fake) {
    opts.log('[peek] using fake key reader:', fake)
    return fakeReader(fake)
  }
  return win32Reader(opts.getKey, opts.log)
}

/** Polls only while it matters (in game + enabled); otherwise no timer runs at all. */
export function createPeekPoller(controller: PeekController, intervalMs = PEEK_POLL_MS) {
  let timer: ReturnType<typeof setInterval> | null = null
  return {
    setRunning(on: boolean) {
      if (on && !timer) {
        timer = setInterval(() => controller.tick(), intervalMs)
        timer.unref?.()
      } else if (!on && timer) {
        clearInterval(timer)
        timer = null
        controller.cancel()
      }
    },
    get running() {
      return timer != null
    }
  }
}
