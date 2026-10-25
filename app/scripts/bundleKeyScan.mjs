/**
 * Find Supabase JWTs in built files and report any whose `role` claim is
 * service_role. That key bypasses row level security and must never be in
 * the published site, whatever the GitHub secret is called.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]*/g
const TEXT_EXT = /\.(js|mjs|cjs|html|json|css|map|txt|webmanifest|xml)$/i

/** `role` claim of a JWT payload segment, or null if it is not a JWT. */
export function jwtPayloadRole(payloadSegment) {
  try {
    const b64 = String(payloadSegment).replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

/** Roles of every JWT found in a string. */
export function jwtRolesInText(text) {
  const roles = []
  for (const m of String(text).matchAll(JWT_RE)) {
    const role = jwtPayloadRole(m[1])
    if (role) roles.push(role)
  }
  return roles
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* walk(path)
    else yield path
  }
}

/** Files under `dir` that contain a service_role JWT, relative to `dir`. */
export function findServiceRoleKeys(dir) {
  const hits = []
  for (const path of walk(dir)) {
    if (!TEXT_EXT.test(path)) continue
    if (jwtRolesInText(readFileSync(path, 'utf8')).includes('service_role')) {
      hits.push(relative(dir, path))
    }
  }
  return hits
}
