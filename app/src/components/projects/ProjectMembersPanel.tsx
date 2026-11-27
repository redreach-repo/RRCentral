import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import {
  addProjectMember,
  addableMembers,
  listActiveTeam,
  listProjectMembers,
  memberLabel,
  removeProjectMember,
  type ProjectMember,
  type TeamMember,
} from '../../lib/projectMembersStore'
import { buttonPrimaryStyle, buttonSecondaryStyle, colors, labelStyle, selectStyle } from '../../lib/uiStyles'

/**
 * Who is on this project. Sales users see only the projects they are on.
 * canManage: managers and admins add and remove people (the database checks too).
 */
export default function ProjectMembersPanel({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const { showToast } = useToast()
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [missingTable, setMissingTable] = useState(false)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)

  async function reload() {
    const r = await listProjectMembers(projectId)
    setMembers(r.members)
    setMissingTable(r.missingTable)
  }

  useEffect(() => {
    let live = true
    Promise.all([listProjectMembers(projectId), listActiveTeam().catch(() => [] as TeamMember[])])
      .then(([r, t]) => {
        if (!live) return
        setMembers(r.members)
        setMissingTable(r.missingTable)
        setTeam(t)
      })
      .catch((err) => showToast(errorMessage(err, 'Could not load project members'), 'error'))
    return () => {
      live = false
    }
  }, [projectId, showToast])

  const options = useMemo(() => addableMembers(team, members), [team, members])

  async function add() {
    if (!pick) return
    setBusy(true)
    try {
      await addProjectMember(projectId, pick)
      setPick('')
      await reload()
      showToast('Added to the project', 'success')
    } catch (err) {
      showToast(errorMessage(err, 'Could not add'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setBusy(true)
    try {
      await removeProjectMember(id)
      await reload()
      showToast('Removed from the project', 'success')
    } catch (err) {
      showToast(errorMessage(err, 'Could not remove'), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (missingTable) {
    return (
      <p role="status" style={{ color: colors.warn, fontSize: 12 }}>
        Project members need the Sales lockdown SQL (sales-own-clients.sql) in Supabase.
      </p>
    )
  }

  return (
    <section aria-label="People on this project" style={{ marginTop: 12 }}>
      <h4 style={{ fontSize: 13, margin: '0 0 6px' }}>People on this project</h4>
      {members.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>Nobody added yet.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {members.map((m) => (
            <li key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>{memberLabel(team, m.user_id)}</span>
              {canManage ? (
                <button type="button" style={buttonSecondaryStyle} disabled={busy} onClick={() => void remove(m.id)}>
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', marginTop: 8, flexWrap: 'wrap' }}>
          <label style={{ ...labelStyle, minWidth: 220 }}>
            Add a person
            <select style={selectStyle} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose…</option>
              {options.map((u) => (
                <option key={u.id} value={u.id}>
                  {(u.name || u.email) + (u.role ? ` (${u.role})` : '')}
                </option>
              ))}
            </select>
          </label>
          <button type="button" style={buttonPrimaryStyle} disabled={busy || !pick} onClick={() => void add()}>
            Add
          </button>
        </div>
      ) : null}
    </section>
  )
}
