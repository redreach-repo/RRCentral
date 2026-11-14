import { describe, expect, it } from 'vitest'
import { t } from './i18n'
import { APP_MODULES } from '../modules/nav'
import { navItemKey, navModuleKey, navSectionKey, translateNavLabel } from './navI18n'

describe('navI18n keys', () => {
  it('builds stable module, item, and section keys', () => {
    expect(navModuleKey('sales')).toBe('nav.module.sales')
    expect(navItemKey('/delivery-settings')).toBe('nav.item.delivery-settings')
    expect(navItemKey('/settings#account')).toBe('nav.item.settings-account')
    expect(navSectionKey('Work')).toBe('nav.section.work')
  })

  it('falls back to the manifest label when the key is missing', () => {
    expect(translateNavLabel((k) => k, 'nav.missing', 'Pipeline')).toBe('Pipeline')
    expect(translateNavLabel((k) => (k === 'nav.module.sales' ? 'Sales' : k), 'nav.module.sales', 'X')).toBe(
      'Sales',
    )
  })

  it('has EN and AR catalog entries for every module and item', () => {
    for (const mod of APP_MODULES) {
      expect(t('en', navModuleKey(mod.id))).not.toBe(navModuleKey(mod.id))
      expect(t('ar', navModuleKey(mod.id))).not.toBe(navModuleKey(mod.id))
      for (const item of mod.items) {
        const key = navItemKey(item.to)
        expect(t('en', key)).not.toBe(key)
        expect(t('ar', key)).not.toBe(key)
        if (item.section) {
          const sk = navSectionKey(item.section)
          expect(t('en', sk)).not.toBe(sk)
          expect(t('ar', sk)).not.toBe(sk)
        }
      }
    }
  })
})
