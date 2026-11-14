import type { CSSProperties } from 'react'
import { colors } from '../../../lib/uiStyles'

const box: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: 16,
  background: colors.card,
  color: colors.text,
  display: 'grid',
  gap: 6,
}

/**
 * Shown by gap plan module pages when their tables are not in the database
 * yet, or when the app runs in local (IndexedDB) mode, which these modules do
 * not support.
 */
export default function SetupNotice({
  localMode,
  missingTable,
  doc,
}: {
  localMode: boolean
  missingTable: boolean
  /** Repo path of the module doc with the setup steps, e.g. docs/modules/hr.md */
  doc: string
}) {
  if (!localMode && !missingTable) return null
  return (
    <div role="status" style={box}>
      <strong>{localMode ? 'Needs the cloud database' : 'Not set up yet'}</strong>
      <span style={{ color: colors.muted }}>
        {localMode
          ? 'This module only works with Supabase, not in local mode.'
          : 'Run this module’s SQL on the SQL copy page first.'}{' '}
        Steps: <code>{doc}</code>
      </span>
    </div>
  )
}
