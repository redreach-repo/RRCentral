import { describe, expect, it } from 'vitest'
import { Box } from 'lucide-react'
import { mergeExtensionNav, collectExtensions, mergeExtensionStrings } from './collect'
import { EXTENSION_MODULES } from './index'
import { EXTENSION_STRINGS } from './strings'
import { t } from '../../lib/i18n'
import { navItemKey, navModuleKey } from '../../lib/navI18n'

const mod = (id: string, path: string) => ({
  default: { manifest: { id, label: id, icon: Box, items: [] }, routes: [{ path, element: null }] },
})

describe('extension slots', () => {
  it('sorts modules by folder and refuses duplicate ids or routes', () => {
    const out = collectExtensions({ './b/module.tsx': mod('b', 'b'), './a/module.tsx': mod('a', 'a') })
    expect(out.map((m) => m.manifest.id)).toEqual(['a', 'b'])
    expect(() => collectExtensions({ './a/module.tsx': mod('x', 'a'), './b/module.tsx': mod('x', 'b') })).toThrow(/id/)
    expect(() => collectExtensions({ './a/module.tsx': mod('a', 'p'), './b/module.tsx': mod('b', '/p') })).toThrow(/route/)
  })

  it('merges strings and refuses a key defined twice', () => {
    const out = mergeExtensionStrings({
      './a/strings.ts': { default: { en: { 'x.a': 'A' }, ar: { 'x.a': 'أ' } } },
      './b/strings.ts': { default: { en: { 'x.b': 'B' }, ar: {} } },
    })
    expect(out.en).toEqual({ 'x.a': 'A', 'x.b': 'B' })
    expect(() =>
      mergeExtensionStrings({
        './a/strings.ts': { default: { en: { k: '1' }, ar: {} } },
        './b/strings.ts': { default: { en: { k: '2' }, ar: {} } },
      }),
    ).toThrow(/Duplicate/)
  })

  it('every landed module has EN and AR labels for its group and items', () => {
    for (const ext of EXTENSION_MODULES) {
      const keys = [navModuleKey(ext.manifest.id), ...ext.manifest.items.map((i) => navItemKey(i.to))]
      for (const key of keys) {
        expect(t('en', key), key).not.toBe(key)
        expect(t('ar', key), key).not.toBe(key)
      }
    }
    expect(EXTENSION_STRINGS.en).toBeTypeOf('object')
  })
})

describe('mergeExtensionNav', () => {
  const item = (to: string) => ({ to, label: to, icon: Box })
  const core = [
    { id: 'clients', label: 'Clients', icon: Box, items: [item('/accounts')] },
    { id: 'admin', label: 'Admin', icon: Box, items: [] },
  ]
  it('adds attached items to the core group and keeps other modules as groups', () => {
    const merged = mergeExtensionNav(core, [
      { manifest: { id: 'a', label: 'A', icon: Box, items: [item('/a')] }, routes: [], attachTo: 'clients' },
      { manifest: { id: 'b', label: 'B', icon: Box, items: [item('/b')] }, routes: [] },
      { manifest: { id: 'c', label: 'C', icon: Box, items: [item('/c')] }, routes: [], attachTo: 'nope' },
    ])
    expect(merged.map((m) => m.id)).toEqual(['clients', 'admin', 'b', 'c'])
    expect(merged[0].items.map((i) => i.to)).toEqual(['/accounts', '/a'])
    expect(core[0].items).toHaveLength(1)
  })
})
