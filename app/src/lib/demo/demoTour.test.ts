import { describe, expect, it } from 'vitest'
import {
  DEMO_TOUR_STEPS,
  markTourStepDone,
  readTourDone,
  resetTourProgress,
  tourProgress,
} from './demoTour'

function memoryStorage() {
  const map = new Map<string, string>()
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

describe('demoTour', () => {
  it('tracks step completion', () => {
    const storage = memoryStorage()
    expect(tourProgress(readTourDone(storage)).done).toBe(0)
    markTourStepDone('accounts', storage, null)
    markTourStepDone('my-day', storage, null)
    const done = readTourDone(storage)
    expect(done.has('accounts')).toBe(true)
    expect(tourProgress(done)).toEqual({ done: 2, total: DEMO_TOUR_STEPS.length })
    resetTourProgress(storage, null)
    expect(readTourDone(storage).size).toBe(0)
  })

  it('lists a lead-to-cash story path', () => {
    expect(DEMO_TOUR_STEPS.map((s) => s.id)).toEqual([
      'accounts',
      'my-day',
      'pipeline',
      'quote',
      'invoice',
      'role',
    ])
  })
})
