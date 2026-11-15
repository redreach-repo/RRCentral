import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { errorMessage } from '../lib/errors'
import { listBusinessTypePacks, requestWorkspaceProvision } from '../lib/m10m12Stores'
import type { BusinessTypePack } from '../lib/workspaceProvision'
import { provisionRequestProblem } from '../lib/workspaceProvision'
import { PRODUCT } from '../lib/product'
import { buttonPrimaryStyle, cardStyle, colors, inputStyle, labelStyle, selectStyle } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M11: public-ish workspace setup form (maps business type → industry pack). */
export default function WorkspaceSetupPage() {
  const { showToast } = useToast()
  const [types, setTypes] = useState<BusinessTypePack[]>([])
  const [workspaceName, setWorkspaceName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [businessType, setBusinessType] = useState('services')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    void listBusinessTypePacks()
      .then((rows) => {
        setTypes(rows)
        if (rows[0]) setBusinessType(rows[0].business_type)
      })
      .catch(() => setTypes([]))
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const problem = provisionRequestProblem({ workspaceName, adminEmail, businessType })
    if (problem) {
      showToast(problem.replace(/_/g, ' '), 'error')
      return
    }
    setBusy(true)
    setResult(null)
    try {
      const res = await requestWorkspaceProvision({ workspaceName, adminEmail, businessType })
      const detail = res.detail || (res.pack_key ? `Pack ${res.pack_key}` : 'ok')
      setResult(detail)
      showToast(res.idempotent ? 'Already provisioned (idempotent)' : 'Provision request recorded', 'success')
    } catch (err) {
      showToast(errorMessage(err, 'Could not provision'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>{PRODUCT.name}</p>
          <h1 className={docsStyles.title}>Workspace setup</h1>
          <p className={docsStyles.subtitle}>
            Choose a business type to map an industry pack. Full tenant + admin user create still needs ops secrets.
          </p>
        </div>
      </header>

      <form onSubmit={(e) => void onSubmit(e)} style={{ ...cardStyle, maxWidth: 520, display: 'grid', gap: 12 }}>
        <label style={labelStyle}>
          Workspace name
          <input style={inputStyle} value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} required />
        </label>
        <label style={labelStyle}>
          Admin email
          <input
            style={inputStyle}
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            required
          />
        </label>
        <label style={labelStyle}>
          Business type
          <select style={selectStyle} value={businessType} onChange={(e) => setBusinessType(e.target.value)}>
            {types.map((t) => (
              <option key={t.business_type} value={t.business_type}>
                {t.label} → {t.pack_key}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" style={buttonPrimaryStyle} disabled={busy}>
          <Building2 size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          {busy ? 'Submitting…' : 'Request workspace'}
        </button>
        {result ? <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>{result}</p> : null}
      </form>
    </div>
  )
}
