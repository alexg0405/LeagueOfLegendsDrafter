/**
 * Translates a captured DOM key event into an Electron accelerator string.
 * Returns null for a bare modifier press so holding Ctrl does not commit a binding.
 */
export function acceleratorFromKeyEvent(event: {
  key: string
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}): string | null {
  const { key, code } = event
  if (key === 'Escape') {
    return 'Escape'
  }
  if (['Control', 'Alt', 'Shift', 'Meta', 'OS', 'AltGraph', 'Dead'].includes(key)) {
    return null
  }

  let base: string | null = null
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) {
    base = key
  } else if (/^Key[A-Z]$/.test(code)) {
    base = code.slice(3)
  } else if (/^Digit[0-9]$/.test(code)) {
    base = code.slice(5)
  } else if (/^Numpad[0-9]$/.test(code)) {
    base = code
  } else {
    const named: Record<string, string> = {
      Insert: 'Insert',
      Delete: 'Delete',
      Home: 'Home',
      End: 'End',
      PageUp: 'PageUp',
      PageDown: 'PageDown',
      ArrowUp: 'Up',
      ArrowDown: 'Down',
      ArrowLeft: 'Left',
      ArrowRight: 'Right',
      ' ': 'Space',
      Tab: 'Tab',
      Backspace: 'Backspace'
    }
    base = named[key] ?? null
  }
  if (!base) {
    return null
  }

  const parts: string[] = []
  if (event.ctrlKey) {
    parts.push('Control')
  }
  if (event.altKey) {
    parts.push('Alt')
  }
  if (event.shiftKey) {
    parts.push('Shift')
  }
  if (event.metaKey) {
    parts.push('Super')
  }
  parts.push(base)
  return parts.join('+')
}
