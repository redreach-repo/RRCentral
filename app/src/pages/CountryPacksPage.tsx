import { useCallback, useEffect, useRef, useState } from 'react'
import { Globe2 } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { errorMessage } from '../lib/errors'
import { isCountryPackVerified, type CountryPack } from '../lib/countryPacks'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../lib/listIo'
import { activateCountryPack, listCountryPacks, retireCountryPack } from '../lib/opsSliceStores'
import { buttonPrimaryStyle, cardStyle, colors } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M8a: country packs (Unverified rules until counsel). */
export default function CountryPacksPage() {
  const { showToast } = useToast()
  const [packs, setPacks] = useState<CountryPack[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

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

  async function importPacksCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const known = new Set(packs.map((p) => p.pack_key))
      let activated = 0
      let skipped = 0
      for (const row of objects) {
        const packKey = String(row.pack_key || row.key || '').trim()
        const action = String(row.action || row.status || 'activate').trim().toLowerCase()
        if (!packKey || !known.has(packKey)) {
          skipped += 1
          continue
        }
        if (action === 'retire' || action === 'retired') {
          await retireCountryPack(packKey)
          activated += 1
          continue
        }
        await activateCountryPack(packKey)
        activated += 1
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Processed ${activated} pack row(s)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Country packs CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importPacksCsv(file)
            }}
          />
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!packs.length || importing}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!packs.length}
            onClick={() => {
              exportListCsv(
                'country-packs.csv',
                ['pack_key', 'name', 'country_code', 'currency', 'tax_id_label', 'leave_types', 'verified', 'description'],
                packs.map((p) => ({
                  pack_key: p.pack_key,
                  name: p.name,
                  country_code: p.country_code,
                  currency: p.currency,
                  tax_id_label: p.rules.taxIdLabel || '',
                  leave_types: (p.rules.leaveTypes || []).join('; '),
                  verified: isCountryPackVerified(p) ? 'yes' : 'no',
                  description: p.description,
                })),
              )
              showToast('Country packs CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
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
