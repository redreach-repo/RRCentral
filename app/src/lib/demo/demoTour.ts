/**
 * Presenter guided tour steps for the Falcon Bay demo story (M3a).
 */

export const DEMO_TOUR_STORAGE_KEY = 'highmast_demo_tour'
export const DEMO_TOUR_EVENT = 'highmast-demo-tour'

export type DemoTourStepId =
  | 'accounts'
  | 'my-day'
  | 'pipeline'
  | 'quote'
  | 'invoice'
  | 'role'

export type DemoTourStep = {
  id: DemoTourStepId
  title: string
  body: string
  to: string
}

export const DEMO_TOUR_STEPS: DemoTourStep[] = [
  {
    id: 'accounts',
    title: 'Accounts',
    body: 'Open Sandstone Logistics — a fictional fleet client on Falcon Bay.',
    to: '/accounts',
  },
  {
    id: 'my-day',
    title: 'My Day',
    body: 'See the lead with a next action: send the revised tracking quote.',
    to: '/crm',
  },
  {
    id: 'pipeline',
    title: 'Pipeline',
    body: 'Pearl Coast Foods sits on the sales board as an AI CRM pilot.',
    to: '/deals',
  },
  {
    id: 'quote',
    title: 'Quote',
    body: 'DEMO-Q-0001 is the Sandstone portal quote ready to walk through.',
    to: '/quotations',
  },
  {
    id: 'invoice',
    title: 'Invoice',
    body: 'Oasis Fit has a paid invoice and one unpaid — classic AR story.',
    to: '/invoices',
  },
  {
    id: 'role',
    title: 'Roles',
    body: 'Use the demo role switcher to show sales vs manager chrome.',
    to: '/app',
  },
]

export function readTourDone(
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null,
): Set<DemoTourStepId> {
  if (!storage) return new Set()
  try {
    const raw = storage.getItem(DEMO_TOUR_STORAGE_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(list)) return new Set()
    return new Set(list.filter((x): x is DemoTourStepId => DEMO_TOUR_STEPS.some((s) => s.id === x)))
  } catch {
    return new Set()
  }
}

export function markTourStepDone(
  id: DemoTourStepId,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null,
  target: { dispatchEvent: (e: Event) => boolean } | null = typeof window !== 'undefined' ? window : null,
): Set<DemoTourStepId> {
  const next = readTourDone(storage)
  next.add(id)
  storage?.setItem(DEMO_TOUR_STORAGE_KEY, JSON.stringify([...next]))
  target?.dispatchEvent(new Event(DEMO_TOUR_EVENT))
  return next
}

export function resetTourProgress(
  storage: Pick<Storage, 'removeItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null,
  target: { dispatchEvent: (e: Event) => boolean } | null = typeof window !== 'undefined' ? window : null,
): void {
  storage?.removeItem(DEMO_TOUR_STORAGE_KEY)
  target?.dispatchEvent(new Event(DEMO_TOUR_EVENT))
}

export function tourProgress(done: Set<DemoTourStepId>): { done: number; total: number } {
  return { done: DEMO_TOUR_STEPS.filter((s) => done.has(s.id)).length, total: DEMO_TOUR_STEPS.length }
}
