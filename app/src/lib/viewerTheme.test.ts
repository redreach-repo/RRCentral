import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  VIEWER_BACKDROP,
  VIEWER_THEME_KEY,
  loadViewerTheme,
  parseViewerTheme,
  saveViewerTheme,
  toggleViewerTheme,
} from './viewerTheme'

function stubStorage(store: Record<string, string>, failing = false) {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => {
        if (failing) throw new Error('blocked')
        return store[k] ?? null
      },
      setItem: (k: string, v: string) => {
        if (failing) throw new Error('blocked')
        store[k] = v
      },
    },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('viewer theme', () => {
  it('defaults to light for missing or unknown values', () => {
    expect(parseViewerTheme(null)).toBe('light')
    expect(parseViewerTheme('purple')).toBe('light')
    expect(parseViewerTheme('dark')).toBe('dark')
  })

  it('toggles between light and dark', () => {
    expect(toggleViewerTheme('light')).toBe('dark')
    expect(toggleViewerTheme('dark')).toBe('light')
  })

  it('uses a dark backdrop only in dark mode', () => {
    expect(VIEWER_BACKDROP.dark).not.toBe(VIEWER_BACKDROP.light)
  })

  it('remembers the choice in local storage', () => {
    const store: Record<string, string> = {}
    stubStorage(store)
    expect(loadViewerTheme()).toBe('light')
    saveViewerTheme('dark')
    expect(store[VIEWER_THEME_KEY]).toBe('dark')
    expect(loadViewerTheme()).toBe('dark')
  })

  it('falls back to light when storage is blocked', () => {
    stubStorage({}, true)
    expect(loadViewerTheme()).toBe('light')
    expect(() => saveViewerTheme('dark')).not.toThrow()
  })
})
