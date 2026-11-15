import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layers } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { useSettings } from '../contexts/SettingsContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import {
  activateIndustryPack,
  listIndustryPackCatalog,
  listTenantIndustryPacks,
  retireIndustryPack,
} from '../lib/featureSliceStores'
import { BUILTIN_INDUSTRY_PACKS, moduleFlagsForPack, packModuleHints } from '../lib/industryPacks'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../lib/listIo'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M12: industry pack catalog with tenant activate / retire + module flag wiring. */
export default function IndustryPacksPage() {
  const { showToast } = useToast()
  const { refresh } = useSettings()
  const [rows, setRows] = useState<Array<{ pack_key: string; name: string; description: string; version: string }>>([])
  const [tenant, setTenant] = useState<Awaited<ReturnType<typeof listTenantIndustryPacks>>>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [catalog, active] = await Promise.all([listIndustryPackCatalog(), listTenantIndustryPacks()])
      setRows(catalog)
      setTenant(active)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load packs'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const statusByKey = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of tenant) {
      const key = t.industry_packs?.pack_key
      if (key) map.set(key, t.status)
    }
    return map
  }, [tenant])

  async function onActivate(packKey: string) {
    try {
      const result = await activateIndustryPack(packKey)
      await refresh()
      const flags = result.enabledFlags.length ? ` · enabled: ${result.enabledFlags.join(', ')}` : ''
      const tpl =
        result.fieldsCreated || result.pipelinesCreated
          ? ` · templates +${result.fieldsCreated} fields / +${result.pipelinesCreated} pipelines`
          : ''
      showToast(`Pack activated${flags}${tpl}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not activate pack'), 'error')
    }
  }

  async function onRetire(packKey: string) {
    try {
      await retireIndustryPack(packKey)
      showToast('Pack retired', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not retire pack'), 'error')
    }
  }

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
      const known = new Set(rows.map((r) => r.pack_key))
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
          await retireIndustryPack(packKey)
          activated += 1
          continue
        }
        if (statusByKey.get(packKey) === 'active') {
          skipped += 1
          continue
        }
        await activateIndustryPack(packKey)
        activated += 1
      }
      await refresh()
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Processed ${activated} pack row(s)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Industry packs CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Industry packs</p>
          <h1 className={docsStyles.title}>Packs</h1>
          <p className={docsStyles.subtitle}>
            Activate vertical starters for this tenant. Activation enables matching shell module flags (Settings →
            Module flags).
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
            disabled={!rows.length || importing}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!rows.length}
            onClick={() => {
              exportListCsv(
                'industry-packs.csv',
                ['pack_key', 'name', 'version', 'status', 'description', 'modules'],
                rows.map((r) => {
                  const builtin = BUILTIN_INDUSTRY_PACKS.find((p) => p.pack_key === r.pack_key)
                  return {
                    pack_key: r.pack_key,
                    name: r.name,
                    version: r.version,
                    status: statusByKey.get(r.pack_key) || 'available',
                    description: r.description,
                    modules: builtin ? packModuleHints(builtin) : 'general',
                  }
                }),
              )
              showToast('Industry packs CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        </div>
      </header>

      {loading ? (
        <p style={{ color: colors.muted }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Layers size={22} />} title="No packs" subtitle="Seed industry_packs to continue." />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((r) => {
            const builtin = BUILTIN_INDUSTRY_PACKS.find((p) => p.pack_key === r.pack_key)
            const hint = builtin ? packModuleHints(builtin) : 'general'
            const status = statusByKey.get(r.pack_key) || 'available'
            return (
              <article key={r.pack_key} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{r.name}</strong>
                    <span style={{ marginLeft: 8, color: colors.muted, fontSize: 12 }}>v{r.version}</span>
                    <span style={{ marginLeft: 8, color: colors.muted, fontSize: 12 }}>· {status}</span>
                    <p style={{ margin: '8px 0 0', color: colors.muted, fontSize: 14 }}>{r.description}</p>
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.muted2 }}>
                      Modules: {hint}
                      {builtin
                        ? ` · flags: ${moduleFlagsForPack(builtin).join(', ') || 'none'}`
                        : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'start' }}>
                    {status !== 'active' ? (
                      <button type="button" style={buttonPrimaryStyle} onClick={() => void onActivate(r.pack_key)}>
                        Activate
                      </button>
                    ) : (
                      <button type="button" style={buttonSecondaryStyle} onClick={() => void onRetire(r.pack_key)}>
                        Retire
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
