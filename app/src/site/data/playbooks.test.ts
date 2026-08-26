import { describe, expect, it } from 'vitest'
import { PLAYBOOKS, playbookByPath, verticalPath } from './playbooks'
import { VERTICALS } from './verticals'

describe('vertical playbooks', () => {
  it('gives every company its own public path', () => {
    const paths = VERTICALS.map((v) => verticalPath(v.slug))
    expect(paths).toEqual([
      '/marketing',
      '/care',
      '/connect',
      '/wanders',
      '/threads',
      '/trading',
      '/upskilling',
    ])
    expect(new Set(paths).size).toBe(7)
    expect(playbookByPath('/wanders')?.slug).toBe('wanders')
    expect(playbookByPath('/travel')?.slug).toBe('wanders')
    expect(playbookByPath('/travel/')?.slug).toBe('wanders')
    expect(playbookByPath('/RRCentral/threads')?.slug).toBe('threads')
    expect(playbookByPath('/RRCentral/uniforms')?.slug).toBe('threads')
    expect(playbookByPath('/wanders/kerala')?.slug).toBe('wanders')
    expect(playbookByPath('/missing')).toBeUndefined()
    expect(VERTICALS.map((v) => v.brand)).toEqual([
      'RR Marketing',
      'RR Care',
      'RR Connect',
      'RR Wanders',
      'RR Threads',
      'RR Trading',
      'RR Upskilling',
    ])
  })

  it('keeps category playbooks distinct', () => {
    expect(PLAYBOOKS.marketing.layout).toBe('agency')
    expect(PLAYBOOKS.care.layout).toBe('medical')
    expect(PLAYBOOKS.connect.layout).toBe('va')
    expect(PLAYBOOKS.wanders.layout).toBe('travel')
    expect(PLAYBOOKS.threads.layout).toBe('apparel')
    expect(PLAYBOOKS.trading.layout).toBe('trade')
    expect(PLAYBOOKS.upskilling.layout).toBe('learn')
    expect(new Set(Object.values(PLAYBOOKS).map((p) => p.layout)).size).toBe(7)
    expect(Object.values(PLAYBOOKS).every((p) => p.collection.length >= 4)).toBe(true)
    expect(Object.values(PLAYBOOKS).every((p) => p.steps.length >= 3)).toBe(true)
  })
})
