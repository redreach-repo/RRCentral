import { describe, expect, it } from 'vitest'
import { modulesEnabled, type ModuleManifest } from './registry'

const stubIcon = () => null

describe('module registry', () => {
  it('filters modules by feature flags', () => {
    const modules: ModuleManifest[] = [
      { id: 'core', label: 'Core', icon: stubIcon, items: [] },
      { id: 'hr', label: 'HR', icon: stubIcon, flag: 'hr', items: [] },
    ]
    expect(modulesEnabled(modules, {}).map((m) => m.id)).toEqual(['core', 'hr'])
    expect(modulesEnabled(modules, { hr: false }).map((m) => m.id)).toEqual(['core'])
  })
})
