import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRenderRequest, renderCheckMatches, renderPageUrl } from './request.js'

const ID = 'e6200000-0000-4000-8000-000000000001'

test('accepts a well formed request', () => {
  const r = parseRenderRequest({ kind: 'quote', id: ID, token: 'a.b.c', apikey: 'anon' })
  assert.deepEqual(r, { kind: 'quote', id: ID, token: 'a.b.c', apikey: 'anon' })
})

test('refuses other kinds, bad ids and missing tokens', () => {
  assert.ok(parseRenderRequest({ kind: 'payroll', id: ID, token: 'a.b.c', apikey: 'k' }).error)
  assert.ok(parseRenderRequest({ kind: 'quote', id: '../x', token: 'a.b.c', apikey: 'k' }).error)
  assert.ok(parseRenderRequest({ kind: 'quote', id: ID, token: 'nope', apikey: 'k' }).error)
  assert.ok(parseRenderRequest({ kind: 'quote', id: ID, token: 'a.b.c' }).error)
  assert.ok(parseRenderRequest(null).error)
})

test('builds the app address with the token in the hash', () => {
  assert.equal(
    renderPageUrl('https://redreach-repo.github.io/RRCentral/', 'invoice', ID, 'a.b.c'),
    `https://redreach-repo.github.io/RRCentral/render-pdf/invoice/${ID}#t=a.b.c`,
  )
})

test('the token must be for this exact document', () => {
  assert.equal(renderCheckMatches({ ok: true, document: `quote:${ID}` }, 'quote', ID), true)
  assert.equal(renderCheckMatches({ ok: true, document: `invoice:${ID}` }, 'quote', ID), false)
  assert.equal(renderCheckMatches({ ok: false, document: null }, 'quote', ID), false)
  assert.equal(renderCheckMatches(null, 'quote', ID), false)
})
