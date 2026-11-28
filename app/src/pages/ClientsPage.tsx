import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../contexts/ToastContext'
import { nameKey } from '../lib/duplicates'
import { listClientRecords, type ClientListRow } from '../lib/client360Store'
import { errorMessage } from '../lib/errors'
import { inputStyle } from '../lib/uiStyles'
import styles from './ClientPage.module.css'

/** Client records: search a company and open its client page. */
export default function ClientsPage() {
  const { showToast } = useToast()
  const [list, setList] = useState<ClientListRow[] | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    listClientRecords()
      .then(setList)
      .catch((e) => {
        showToast(errorMessage(e, 'Could not load clients'), 'error')
        setList([])
      })
  }, [showToast])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    const key = nameKey(q)
    if (!list) return []
    if (!q) return list
    return list.filter(
      (c) =>
        c.company_name.toLowerCase().includes(q) ||
        (key && nameKey(c.company_name).includes(key)) ||
        (c.short_name || '').toLowerCase().includes(q) ||
        c.trn.includes(q) ||
        c.email.toLowerCase().includes(q),
    )
  }, [list, search])

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <p className={styles.kicker}>Sales</p>
        <h1 className={styles.name}>Client records</h1>
        <p className={styles.sub} style={{ margin: 0 }}>
          One page per company: totals, quotes, POs, invoices, payments, deliveries, contacts, tickets and the whole timeline.
        </p>
      </header>
      <input
        type="search"
        aria-label="Search clients"
        placeholder="Search by name, TRN or email…"
        style={{ ...inputStyle, maxWidth: 420 }}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {list === null ? <p className={styles.empty}>Loading clients…</p> : null}
      {list && !shown.length ? <p className={styles.empty}>No client matches.</p> : null}
      {shown.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Client</th>
                <th>TRN</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/clients/${c.id}`}>{c.company_name || 'No name'}</Link>
                    {c.short_name && c.short_name !== c.company_name ? <span className={styles.sub}> · {c.short_name}</span> : null}
                  </td>
                  <td>{c.trn || '—'}</td>
                  <td>{c.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
