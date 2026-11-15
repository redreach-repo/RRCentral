import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { HardHat } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import SavedViewsBar from '../components/SavedViewsBar'
import { errorMessage } from '../lib/errors'
import { listHrEmployees, type HrEmployee } from '../lib/featureSliceStores'
import { assignmentWindow, siteLabel, SITE_STATUSES } from '../lib/constructionSites'
import { CONSTRUCTION_SITES_CSV_COLUMNS } from '../lib/constructionSitesCsv'
import {
  assignSiteWorkforce,
  createConstructionSite,
  listConstructionSites,
  listSiteAssignments,
  restoreConstructionSite,
  softDeleteConstructionSite,
  type ConstructionSite,
  type SiteWorkforceAssignment,
} from '../lib/constructionSitesStore'
import { csvRowsToObjects, exportListCsv, parseCsv, parseListIoRows } from '../lib/listIo'
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
  const { appUserId } = useAuth()
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
  const [showArchived, setShowArchived] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const sitesViewFilters = useMemo(
    () => ({ status: statusFilter, archived: showArchived ? '1' : '0' }),
    [statusFilter, showArchived],
  )
  const visibleSites = useMemo(
    () => (statusFilter === 'all' ? sites : sites.filter((s) => s.status === statusFilter)),
    [sites, statusFilter],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, p] = await Promise.all([
        listConstructionSites({ includeDeleted: showArchived }),
        listHrEmployees('active'),
      ])
      setSites(s)
      setPeople(p)
      if (!employeeId && p[0]) setEmployeeId(p[0].id)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load sites'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, employeeId, showArchived])

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

  async function importSitesCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      const objects = csvRowsToObjects(headers, rows).map((row) => {
        const normalized: Record<string, string> = {}
        for (const c of CONSTRUCTION_SITES_CSV_COLUMNS) {
          normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
        }
        return normalized
      })
      const { ok, errors } = parseListIoRows(objects, CONSTRUCTION_SITES_CSV_COLUMNS)
      if (!ok.length && errors.length) {
        showToast(errors[0] || 'No valid site rows', 'error')
        return
      }
      const statusSet = new Set<string>(SITE_STATUSES)
      const existingCodes = new Set(sites.map((s) => s.code.toUpperCase()))
      let saved = 0
      let skipped = errors.length
      for (const row of ok) {
        const codeVal = (row.code || '').trim().toUpperCase()
        if (codeVal && existingCodes.has(codeVal)) {
          skipped += 1
          continue
        }
        const status = statusSet.has(row.status) ? row.status : 'active'
        await createConstructionSite({
          code: codeVal,
          name: row.name,
          location: row.location || '',
          status,
        })
        if (codeVal) existingCodes.add(codeVal)
        saved += 1
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} site(s)${skipNote}`, 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Sites CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importSitesCsv(file)
            }}
          />
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!visibleSites.length}
            onClick={() => {
              exportListCsv(
                'construction-sites.csv',
                ['code', 'name', 'location', 'status'],
                visibleSites.map((s) => ({
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
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
        </div>
      </header>

      <SavedViewsBar
        moduleId="construction_sites"
        filters={sitesViewFilters}
        ownerUserId={appUserId}
        canWrite
        applyDefaultOnLoad={false}
        onApply={(f) => {
          setStatusFilter(String(f.status || 'all'))
          setShowArchived(String(f.archived || '0') === '1')
        }}
        onToast={showToast}
        filtersEqual={(a, b) =>
          String(a.status || 'all') === String(b.status || 'all') &&
          String(a.archived || '0') === String(b.archived || '0')
        }
      />

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>
          Status
          <select style={selectStyle} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            {SITE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

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
            {visibleSites.length === 0 ? (
              <EmptyState title="No sites" subtitle="Create a site above. Apply construction_sites migration if empty." />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {visibleSites.map((s) => {
                  const archived = Boolean(s.deleted_at)
                  return (
                    <li key={s.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button type="button" style={buttonSecondaryStyle} onClick={() => void openSite(s)}>
                        {siteLabel(s.code, s.name)} · {s.status}
                        {archived ? ' · archived' : ''}
                      </button>
                      <button
                        type="button"
                        style={buttonSecondaryStyle}
                        onClick={() => {
                          if (
                            !window.confirm(
                              archived
                                ? `Restore ${s.code || s.name}?`
                                : `Archive ${s.code || s.name}?`,
                            )
                          ) {
                            return
                          }
                          void (archived
                            ? restoreConstructionSite(s.id)
                            : softDeleteConstructionSite(s.id))
                            .then(() => {
                              showToast(archived ? 'Site restored' : 'Site archived', 'success')
                              if (selected?.id === s.id) setSelected(null)
                              return load()
                            })
                            .catch((err) => showToast(errorMessage(err, 'Archive failed'), 'error'))
                        }}
                      >
                        {archived ? 'Restore' : 'Archive'}
                      </button>
                    </li>
                  )
                })}
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
