import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findServiceRoleKeys, jwtRolesInText } from '../../scripts/bundleKeyScan.mjs'

function fakeJwt(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iss: 'supabase', ref: 'test', role })).toString('base64url')
  return `${header}.${payload}.c2lnbmF0dXJl`
}

describe('bundle service_role scan', () => {
  it('reads the role of every JWT in a file', () => {
    const text = `const a="${fakeJwt('anon')}";const b='${fakeJwt('service_role')}'`
    expect(jwtRolesInText(text)).toEqual(['anon', 'service_role'])
  })

  it('ignores text that only looks like a JWT', () => {
    expect(jwtRolesInText('eyJnotreal.eyJalsonotreal.x sb_publishable_abc')).toEqual([])
  })

  it('flags a built file holding a service_role key and passes an anon one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rr-scan-'))
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'assets', 'index.js'), `x("${fakeJwt('anon')}")`)
    writeFileSync(join(dir, 'logo.png'), fakeJwt('service_role'))
    expect(findServiceRoleKeys(dir)).toEqual([])

    writeFileSync(join(dir, 'assets', 'chunk.js'), `y("${fakeJwt('service_role')}")`)
    expect(findServiceRoleKeys(dir)).toEqual([join('assets', 'chunk.js')])
  })
})
