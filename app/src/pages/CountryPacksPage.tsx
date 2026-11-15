import { useCallback, useEffect, useState } from 'react'
import { Globe2 } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { errorMessage } from '../lib/errors'
import { isCountryPackVerified, type CountryPack } from '../lib/countryPacks'
import { activateCountryPack, listCountryPacks } from '../lib/opsSliceStores'
import { buttonPrimaryStyle, cardStyle, colors } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M8a: country packs (Unverified rules until counsel). */
export default function CountryPacksPage() {
  const { showToast } = useToast()
  const [packs, setPacks] = useState<CountryPack[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setPacks(await listCountryPacks())
    } catch (e) {
      showToast(errorMessage(e, 'Could not load country packs'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Localisation · M8a</p>
          <h1 className={docsStyles.title}>
            <Globe2 size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Country packs
          </h1>
          <p className={docsStyles.subtitle}>
            Data packs for UAE, India and Canada. Tax and payroll hints are Unverified until a specialist signs
            them off.
          </p>
        </div>
      </header>
      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {packs.map((p) => (
            <section key={p.pack_key} style={cardStyle}>
              <h2 style={{ margin: '0 0 6px', fontSize: 16 }}>
                {p.name} ({p.country_code}) · {p.currency}
              </h2>
              <p style={{ margin: '0 0 8px', color: colors.muted, fontSize: 13 }}>{p.description}</p>
              <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 13, color: colors.muted }}>
                <li>Tax ID label: {p.rules.taxIdLabel || '—'}</li>
                <li>Leave types: {(p.rules.leaveTypes || []).join(', ') || '—'}</li>
                <li>Status: {isCountryPackVerified(p) ? 'Verified' : 'Unverified'}</li>
              </ul>
              <button
                type="button"
                style={buttonPrimaryStyle}
                onClick={() => {
                  void activateCountryPack(p.pack_key)
                    .then(() => showToast(`Activated ${p.name}`, 'success'))
                    .catch((e) => showToast(errorMessage(e, 'Activate failed'), 'error'))
                }}
              >
                Activate for this workspace
              </button>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
