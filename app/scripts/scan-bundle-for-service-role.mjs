/**
 * Fail if a service_role JWT is anywhere in the built site.
 * Usage: node scripts/scan-bundle-for-service-role.mjs [dir]   (default dist)
 */
import { existsSync } from 'node:fs'
import { findServiceRoleKeys } from './bundleKeyScan.mjs'

const dir = process.argv[2] || 'dist'
if (!existsSync(dir)) {
  console.error(`[scan-bundle] ${dir} does not exist. Run the build first.`)
  process.exit(1)
}

const hits = findServiceRoleKeys(dir)
if (hits.length) {
  console.error('::error::A Supabase service_role key is in the built site. It bypasses row level security.')
  for (const file of hits) console.error(`  ${file}`)
  console.error('Set the GitHub secret VITE_SUPABASE_ANON_KEY to the anon key, then rotate service_role (docs/SECURITY.md).')
  process.exit(1)
}
console.log(`[scan-bundle] No service_role key in ${dir}.`)
