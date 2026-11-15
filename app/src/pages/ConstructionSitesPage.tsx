import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { HardHat } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import { listHrEmployees, type HrEmployee } from '../lib/featureSliceStores'
import { assignmentWindow, siteLabel, SITE_STATUSES } from '../lib/constructionSites'
import {
  assignSiteWorkforce,
  createConstructionSite,
  listConstructionSites,
  listSiteAssignments,
  type ConstructionSite,
  type SiteWorkforceAssignment,
} from '../lib/constructionSitesStore'
import { exportListCsv } from '../lib/listIo'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
  selectStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M12b construction pack: sites + workforce assignments. */
export default function ConstructionSitesPage() {
  const { showToast } = useToast()
  const [sites, setSites] = useState<ConstructionSite[]>([])
  const [people, setPeople] = useState<HrEmployee[]>([])
  const [selected, setSelected] = useState<ConstructionSite | null>(null)
  const [assignments, setAssignments] = useState<SiteWorkforceAssignment[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [roleLabel, setRoleLabel] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, p] = await Promise.all([listConstructionSites(), listHrEmployees('active')])
      setSites(s)
      setPeople(p)
      if (!employeeId && p[0]) setEmployeeId(p[0].id)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load sites'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, employeeId])

  useEffect(() => {
    void load()
  }, [load])

  async function openSite(site: ConstructionSite) {
    setSelected(site)
    try {
      setAssignments(await listSiteAssignments(site.id))
    } catch (e) {
      showToast(errorMessage(e, 'Could not load workforce'), 'error')
    }
  }

  async function onCreateSite(e: FormEvent) {
    e.preventDefault()
    try {
      await createConstructionSite({ code, name, location })
      showToast('Site created', 'success')
      setCode('')
      setName('')
      setLocation('')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not create site'), 'error')
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Construction · M12b</p>
          <h1 className={docsStyles.title}>
            <HardHat size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Sites
          </h1>
          <p className={docsStyles.subtitle}>
            Site register and workforce assignments. Not payroll or labour certification.
          </p>
        </div>
        <button
          type="button"
          className={docsStyles.newBtn}
          style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
          disabled={!sites.length}
          onClick={() => {
            exportListCsv(
              'construction-sites.csv',
              ['code', 'name', 'location', 'status'],
              sites.map((s) => ({
                code: s.code,
                name: s.name,
                location: s.location,
                status: s.status,
              })),
            )
            showToast('Sites CSV downloaded', 'success')
          }}
        >
          Export CSV
        </button>
      </header>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <form style={cardStyle} onSubmit={(e) => void onCreateSite(e)}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>New site</h2>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 2fr 2fr' }}>
              <label style={labelStyle}>
                Code
                <input style={inputStyle} value={code} onChange={(e) => setCode(e.target.value)} placeholder="S1" />
              </label>
              <label style={labelStyle}>
                Name
                <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label style={labelStyle}>
                Location
                <input style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} />
              </label>
            </div>
            <button type="submit" style={{ ...buttonPrimaryStyle, marginTop: 10 }}>
              Create site
            </button>
          </form>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Sites</h2>
            {sites.length === 0 ? (
              <EmptyState title="No sites" subtitle="Create a site above. Apply construction_sites migration if empty." />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {sites.map((s) => (
                  <li key={s.id}>
                    <button type="button" style={buttonSecondaryStyle} onClick={() => void openSite(s)}>
                      {siteLabel(s.code, s.name)} · {s.status}
                      {SITE_STATUSES.includes(s.status as (typeof SITE_STATUSES)[number]) ? '' : ''}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {selected ? (
              <div style={{ marginTop: 14 }}>
                <h3 style={{ fontSize: 14 }}>
                  Workforce · {siteLabel(selected.code, selected.name)}
                </h3>
                <form
                  style={{ display: 'grid', gap: 8, gridTemplateColumns: '2fr 1fr auto', marginBottom: 10 }}
                  onSubmit={(e) => {
                    e.preventDefault()
                    void assignSiteWorkforce({
                      siteId: selected.id,
                      employeeId: employeeId || null,
                      roleLabel,
                      startsOn: new Date().toISOString().slice(0, 10),
                    })
                      .then(async () => {
                        showToast('Assigned', 'success')
                        setRoleLabel('')
                        setAssignments(await listSiteAssignments(selected.id))
                      })
                      .catch((err) => showToast(errorMessage(err, 'Assign failed'), 'error'))
                  }}
                >
                  <label style={labelStyle}>
                    Person
                    <select style={selectStyle} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={labelStyle}>
                    Role
                    <input style={inputStyle} value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} required />
                  </label>
                  <button type="submit" style={{ ...buttonPrimaryStyle, alignSelf: 'end' }}>
                    Assign
                  </button>
                </form>
                {assignments.length === 0 ? (
                  <p style={{ color: colors.muted, fontSize: 13 }}>No assignments yet.</p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                    {assignments.map((a) => (
                      <li key={a.id} style={{ fontSize: 13 }}>
                        {a.hr_employees?.full_name || 'Unnamed'} · {a.role_label || '—'} ·{' '}
                        {assignmentWindow(a.starts_on, a.ends_on)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </section>
        </div>
      )}
    </div>
  )
}
