import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileStack } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { formatMoneyAmount } from '../../lib/currency'
import {
  ALL_SALES,
  EVERYONE,
  PERIOD_DAYS,
  SALES_DOC_KINDS,
  filterSalesDocs,
  kindLabel,
  makerName,
  salesDocHref,
  sinceIso,
  summarizeByMaker,
  type SalesDoc,
  type SalesDocKind,
  type TeamMember,
} from '../../lib/salesDocuments'
import { loadSalesDocuments } from '../../lib/salesDocumentsStore'
import { cardStyle, colors, sectionTitleStyle, selectStyle } from '../../lib/uiStyles'

const SHOW = 15

function when(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM')
  } catch {
    return ''
  }
}

/**
 * Home, for admins and managers: every quote, invoice, delivery note and client
 * PO Sales made, with who made it. Filter by person, document and period.
 */
export default function SalesDocumentsCard() {
  const [days, setDays] = useState(30)
  const [person, setPerson] = useState(ALL_SALES)
  const [kind, setKind] = useState<SalesDocKind | 'all'>('all')
  const [data, setData] = useState<{ docs: SalesDoc[]; team: TeamMember[]; poMakerMissing: boolean } | null>(null)
  const [error, setError] = useState(false)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let live = true
    setError(false)
    loadSalesDocuments(sinceIso(days))
      .then((d) => {
        if (live) setData(d)
      })
      .catch(() => {
        if (live) setError(true)
      })
    return () => {
      live = false
    }
  }, [days])

  const team = useMemo(() => data?.team ?? [], [data])
  const salesPeople = useMemo(
    () => team.filter((m) => m.role === 'sales').sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)),
    [team],
  )
  const since = useMemo(() => sinceIso(days), [days])
  const inPeriod = useMemo(
    () => (data ? filterSalesDocs(data.docs, team, { person, kind: 'all', sinceIso: since }) : []),
    [data, team, person, since],
  )
  const docs = useMemo(() => (kind === 'all' ? inPeriod : inPeriod.filter((d) => d.kind === kind)), [inPeriod, kind])
  const summary = useMemo(() => summarizeByMaker(inPeriod, team), [inPeriod, team])

  const shown = showAll ? docs : docs.slice(0, SHOW)
  const th = { textAlign: 'left' as const, padding: '6px 8px', fontWeight: 600, color: colors.muted, fontSize: 12 }
  const td = { padding: '6px 8px', borderTop: `1px solid ${colors.border}`, fontSize: 13, verticalAlign: 'top' as const }

  return (
    <section aria-label="Made by Sales" style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={{ ...sectionTitleStyle, display: 'flex', gap: 8, alignItems: 'center' }}>
        <FileStack size={16} aria-hidden /> Made by Sales
      </h2>
      <p style={{ color: colors.muted, fontSize: 12, margin: '0 0 10px' }}>
        Quotes, invoices, delivery notes and client POs your Sales team made.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 12 }}>
        <label style={{ fontSize: 12 }}>
          Person
          <select style={selectStyle} value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value={ALL_SALES}>All Sales</option>
            {salesPeople.map((m) => (
              <option key={m.email} value={m.email.toLowerCase()}>
                {m.name || m.email}
                {m.active === false ? ' (left)' : ''}
              </option>
            ))}
            <option value={EVERYONE}>Everyone in the team</option>
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          Document
          <select style={selectStyle} value={kind} onChange={(e) => setKind(e.target.value as SalesDocKind | 'all')}>
            <option value="all">All documents</option>
            {SALES_DOC_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.plural}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          Period
          <select style={selectStyle} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {PERIOD_DAYS.map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p role="status" style={{ color: colors.warn, fontSize: 13, margin: 0 }}>Could not load the documents.</p>
      ) : !data ? (
        <p role="status" style={{ color: colors.muted, fontSize: 13, margin: 0 }}>Loading…</p>
      ) : (
        <>
          {summary.length > 0 ? (
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <caption style={{ textAlign: 'left', fontSize: 12, color: colors.muted, padding: '0 0 4px' }}>
                  Who made what, last {days} days
                </caption>
                <thead>
                  <tr>
                    <th scope="col" style={th}>Person</th>
                    {SALES_DOC_KINDS.map((k) => (
                      <th key={k.kind} scope="col" style={{ ...th, textAlign: 'right' }}>{k.plural}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s) => (
                    <tr key={s.email || 'unknown'}>
                      <th scope="row" style={{ ...td, fontWeight: 500, textAlign: 'left' }}>{s.name}</th>
                      {SALES_DOC_KINDS.map((k) => (
                        <td key={k.kind} style={{ ...td, textAlign: 'right' }}>{s.counts[k.kind]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {docs.length === 0 ? (
            <p role="status" style={{ color: colors.muted, fontSize: 13, margin: 0 }}>
              Nothing made in the last {days} days for this choice.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <caption style={{ textAlign: 'left', fontSize: 12, color: colors.muted, padding: '0 0 4px' }}>
                  Newest first ({docs.length})
                </caption>
                <thead>
                  <tr>
                    <th scope="col" style={th}>Date</th>
                    <th scope="col" style={th}>Document</th>
                    <th scope="col" style={th}>Client</th>
                    <th scope="col" style={{ ...th, textAlign: 'right' }}>Amount</th>
                    <th scope="col" style={th}>Status</th>
                    <th scope="col" style={th}>Made by</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((d) => (
                    <tr key={`${d.kind}-${d.id}`}>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{when(d.created_at)}</td>
                      <td style={td}>
                        <span style={{ color: colors.muted, fontSize: 12 }}>{kindLabel(d.kind)} </span>
                        <Link to={salesDocHref(d)} style={{ color: colors.accentText }}>
                          {d.reference || 'No number yet'}
                        </Link>
                      </td>
                      <td style={td}>{d.client || '-'}</td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {d.amount == null ? '-' : formatMoneyAmount(d.amount, d.currency)}
                      </td>
                      <td style={td}>{d.status || '-'}</td>
                      <td style={td}>{makerName(d.created_by, team)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {docs.length > SHOW ? (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  style={{ marginTop: 8, background: 'none', border: 'none', color: colors.accentText, cursor: 'pointer', padding: 0, fontSize: 13 }}
                >
                  {showAll ? 'Show fewer' : `Show all ${docs.length}`}
                </button>
              ) : null}
            </div>
          )}
          {data.poMakerMissing ? (
            <p role="status" style={{ color: colors.warn, fontSize: 12, margin: '8px 0 0' }}>
              Client POs show once document-created-by.sql is run in Supabase.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
