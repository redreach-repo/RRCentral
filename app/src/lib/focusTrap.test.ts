import { describe, expect, it, vi } from 'vitest'
import { getFocusable, trapTabKey } from './focusTrap'

type FakeEl = {
  id: string
  focus: ReturnType<typeof vi.fn>
  hasAttribute: (name: string) => boolean
  getAttribute: (name: string) => string | null
}

function fakeContainer(ids: string[], disabled: string[] = []) {
  const nodes: FakeEl[] = ids.map((id) => ({
    id,
    focus: vi.fn(),
    hasAttribute: (name: string) => name === 'disabled' && disabled.includes(id),
    getAttribute: () => null,
  }))
  const root = {
    querySelectorAll: () => nodes,
    contains: (el: FakeEl | null) => !!el && nodes.includes(el),
  }
  return { root: root as unknown as HTMLElement, nodes }
}

describe('focusTrap', () => {
  it('lists focusable controls and skips disabled', () => {
    const { root, nodes } = fakeContainer(['a', 'b', 'c'], ['b'])
    expect(getFocusable(root).map((n) => (n as unknown as FakeEl).id)).toEqual(['a', 'c'])
    expect(nodes[1].hasAttribute('disabled')).toBe(true)
  })

  it('cycles Tab from last to first', () => {
    const { root, nodes } = fakeContainer(['a', 'b'])
    const e = {
      key: 'Tab',
      shiftKey: false,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent
    trapTabKey(e, root, nodes[1] as unknown as Element)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(nodes[0].focus).toHaveBeenCalled()
  })

  it('ignores non-Tab keys', () => {
    const { root } = fakeContainer(['a'])
    const e = { key: 'Escape', preventDefault: vi.fn() } as unknown as KeyboardEvent
    trapTabKey(e, root)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })
})
