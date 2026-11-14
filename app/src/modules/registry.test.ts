import { describe, expect, it } from 'vitest'
import {
  SETTINGS_MODULE_FLAGS,
  isModuleFlagEnabled,
  modulesEnabled,
  parseModuleFlags,
  serializeModuleFlags,
  withModuleFlag,
  type ModuleManifest,
} from './registry'
import { APP_MODULES } from './nav'

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

  it('parses moduleFlags from settings JSON', () => {
    expect(parseModuleFlags({})).toEqual({})
    expect(parseModuleFlags({ moduleFlags: '{"ops":false,"hr":true}' })).toEqual({ ops: false, hr: true })
    expect(parseModuleFlags({ moduleFlags: '{"ops":"no"}' })).toEqual({ ops: false })
    expect(parseModuleFlags({ moduleFlags: 'not-json' })).toEqual({})
  })

  it('merges and serializes disabled flags for Settings', () => {
    expect(isModuleFlagEnabled({}, 'ops')).toBe(true)
    expect(isModuleFlagEnabled({ ops: false }, 'ops')).toBe(false)
    expect(withModuleFlag({}, 'ops', false)).toEqual({ ops: false })
    expect(withModuleFlag({ ops: false }, 'ops', true)).toEqual({})
    expect(serializeModuleFlags({ ops: false, hr: true })).toBe('{"ops":false}')
    expect(serializeModuleFlags({})).toBe('')
  })

  it('exposes Settings toggles that match APP_MODULES flag keys', () => {
    expect(SETTINGS_MODULE_FLAGS.map((row) => row.flag)).toEqual([
      'ops',
      'finance',
      'delivery',
      'clients',
    ])
    for (const row of SETTINGS_MODULE_FLAGS) {
      expect(APP_MODULES.some((m) => m.flag === row.flag)).toBe(true)
    }
  })
})
