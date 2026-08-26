import { describe, expect, it } from 'vitest'
import { CLIENT_LOGOS, DESTINATION_FILM, DESTINATION_PHOTOS, THREAD_LOOKBOOK } from './assets'

describe('site photography sets', () => {
  it('keeps a full travel filmstrip and threads lookbook', () => {
    expect(DESTINATION_PHOTOS).toHaveLength(6)
    expect(DESTINATION_FILM).toHaveLength(6)
    expect(THREAD_LOOKBOOK.length).toBeGreaterThanOrEqual(5)
    expect(CLIENT_LOGOS.length).toBeGreaterThanOrEqual(6)
  })
})
