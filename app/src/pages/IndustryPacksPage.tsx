import { useCallback, useEffect, useMemo, useState } from 'react'
import { Layers } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import {
  activateIndustryPack,
  listIndustryPackCatalog,
  listTenantIndustryPacks,
  retireIndustryPack,
} from '../lib/featureSliceStores'
import { BUILTIN_INDUSTRY_PACKS, packModuleHints } from '../lib/industryPacks'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M12: industry pack catalog with tenant activate / retire. */
export default function IndustryPacksPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<Array<{ pack_key: string; name: string; description: string; version: string }>>([])
  const [tenant, setTenant] = useState<Awaited<ReturnType<typeof listTenantIndustryPacks>>>([])
  const [loading, setLoading] = useState(true)

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
      await activateIndustryPack(packKey)
      showToast('Pack activated', 'success')
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

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Industry packs</p>
          <h1 className={docsStyles.title}>Packs</h1>
          <p className={docsStyles.subtitle}>Activate vertical starters for this tenant. Manifest modules are hints for nav flags.</p>
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
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.muted2 }}>Modules: {hint}</p>
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
