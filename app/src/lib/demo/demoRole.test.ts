import { describe, expect, it } from 'vitest'
import { DEMO_ROLE_STORAGE_KEY, effectiveDemoRole, readDemoRoleOverride, writeDemoRoleOverride } from './demoRole'

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
  }
}

describe('demoRole', () => {
  it('ignores overrides outside demo builds', () => {
    const storage = memoryStorage({ [DEMO_ROLE_STORAGE_KEY]: 'viewer' })
    expect(readDemoRoleOverride(storage, { VITE_APP_ENV: 'production' })).toBeNull()
    expect(effectiveDemoRole('admin', storage, { VITE_APP_ENV: 'staging' })).toBe('admin')
  })

  it('reads and writes a demo override', () => {
    const storage = memoryStorage()
    const events: string[] = []
    const target = { dispatchEvent: (e: Event) => (events.push(e.type), true) }
    writeDemoRoleOverride('viewer', storage, { VITE_APP_ENV: 'demo' }, target)
    expect(readDemoRoleOverride(storage, { VITE_APP_ENV: 'demo' })).toBe('viewer')
    expect(effectiveDemoRole('admin', storage, { VITE_APP_ENV: 'demo' })).toBe('viewer')
    writeDemoRoleOverride(null, storage, { VITE_APP_ENV: 'demo' }, target)
    expect(readDemoRoleOverride(storage, { VITE_APP_ENV: 'demo' })).toBeNull()
    expect(events.length).toBe(2)
  })
})
