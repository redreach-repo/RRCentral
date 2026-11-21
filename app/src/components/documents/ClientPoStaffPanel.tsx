import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { issuedToGroup, sizeCounts, staffForGroup } from '../../lib/clientPoBalance'
import type { PoLineItem } from '../../lib/clientPoReader'
import { UNIFORM_SIZE_FIELDS, type UniformIssue, type UniformStaff } from '../../lib/clientUniforms/clientUniforms'
import { colors } from '../../lib/uiStyles'

const box: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: 12,
  display: 'grid',
  gap: 10,
  fontSize: 13,
}

/**
 * On a client PO: for each line tagged with a staff group (e.g. "Driver"),
 * the client's people in that group from Clients > Uniform sizes, their sizes
 * and what has already been issued to them.
 */
export default function ClientPoStaffPanel(props: {
  lines: PoLineItem[]
  staff: UniformStaff[]
  issues: UniformIssue[]
  missingTable: boolean
  hasClient: boolean
}) {
  const { lines, staff, issues } = props
  if (!props.hasClient) return null
  const tagged = lines.filter((l) => (l.staff_group || '').trim())

  return (
    <div style={box}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Users size={15} />
        <strong>Uniform sizes for this PO</strong>
        <Link to="/uniform-sizes" style={{ marginLeft: 'auto', color: colors.accentText, fontSize: 12 }}>
          Open Uniform sizes
        </Link>
      </div>
      {props.missingTable ? (
        <div style={{ color: colors.muted }}>
          Uniform sizes are not switched on yet: run client-uniform-sizes.sql in Supabase.
        </div>
      ) : !staff.length ? (
        <div style={{ color: colors.muted }}>No staff sizes saved for this client yet. Add them under Clients → Uniform sizes.</div>
      ) : !tagged.length ? (
        <div style={{ color: colors.muted }}>
          This client has {staff.filter((s) => s.active !== false).length} people with sizes saved. Fill in "For staff" on a
          line (e.g. Driver) to see their sizes here.
        </div>
      ) : (
        tagged.map((l, i) => {
          const people = staffForGroup(staff, l.staff_group)
          const issued = issuedToGroup(
            issues,
            people.map((p) => p.id),
          )
          const ordered = Number(l.quantity) || 0
          return (
            <div key={l.id || i} style={{ borderTop: i ? `1px solid ${colors.border}` : undefined, paddingTop: i ? 8 : 0 }}>
              <div style={{ fontWeight: 600 }}>
                {l.description || 'Line'} · for {l.staff_group}
              </div>
              {people.length ? (
                <>
                  <div style={{ color: colors.muted }}>
                    {people.length} {people.length === 1 ? 'person' : 'people'} on file
                    {ordered && ordered !== people.length ? ` (PO line is for ${ordered})` : ''}
                    {issued.items
                      ? ` · ${issued.items} items issued to ${issued.people} of them, last on ${issued.last}`
                      : ' · nothing issued yet'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 16px', marginTop: 4 }}>
                    {UNIFORM_SIZE_FIELDS.map((f) => {
                      const counts = sizeCounts(people, f.field)
                      return counts && !/^\(no size\) ×\d+$/.test(counts) ? (
                        <span key={f.field}>
                          <span style={{ color: colors.muted }}>{f.label}:</span> {counts}
                        </span>
                      ) : null
                    })}
                  </div>
                </>
              ) : (
                <div style={{ color: colors.muted }}>No one saved as "{l.staff_group}" for this client yet.</div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
