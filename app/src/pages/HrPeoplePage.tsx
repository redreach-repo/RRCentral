import { useCallback, useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import { createHrEmployee, listHrEmployees, type HrEmployee } from '../lib/featureSliceStores'
import {
  buttonPrimaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M6 first slice: employee directory. */
export default function HrPeoplePage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<HrEmployee[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listHrEmployees())
    } catch (e) {
      showToast(errorMessage(e, 'Could not load people'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function onAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    try {
      await createHrEmployee({ full_name: name, email, job_title: title })
      setName('')
      setEmail('')
      setTitle('')
      showToast('Person added', 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not add person'), 'error')
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>HR · first slice</p>
          <h1 className={docsStyles.title}>People</h1>
          <p className={docsStyles.subtitle}>Employee directory foundation. Payroll links here next.</p>
        </div>
      </header>

      <form onSubmit={(e) => void onAdd(e)} style={{ ...cardStyle, marginBottom: 16, display: 'grid', gap: 10, maxWidth: 520 }}>
        <label style={labelStyle}>
          Full name
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label style={labelStyle}>
          Email
          <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label style={labelStyle}>
          Job title
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <button type="submit" style={buttonPrimaryStyle}>
          Add person
        </button>
      </form>

      {loading ? (
        <p style={{ color: colors.muted }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Users size={22} />} title="No people yet" subtitle="Add the first employee to start HR." />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => (
            <article key={r.id} style={cardStyle}>
              <strong>{r.full_name}</strong>
              <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                {[r.job_title, r.email, r.employment_status].filter(Boolean).join(' · ')}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
