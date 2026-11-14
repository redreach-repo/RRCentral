import { useCallback, useEffect, useState } from 'react'
import { Layers } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import { listIndustryPackCatalog } from '../lib/featureSliceStores'
import { BUILTIN_INDUSTRY_PACKS, packModuleHints } from '../lib/industryPacks'
import { cardStyle, colors } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M12 first slice: industry pack catalog. */
export default function IndustryPacksPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<Array<{ pack_key: string; name: string; description: string; version: string }>>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listIndustryPackCatalog())
    } catch (e) {
      showToast(errorMessage(e, 'Could not load packs'), 'error')
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
          <p className={docsStyles.kicker}>Industry packs · first slice</p>
          <h1 className={docsStyles.title}>Packs</h1>
          <p className={docsStyles.subtitle}>Catalog of vertical starters. Activation wiring comes next.</p>
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
            return (
              <article key={r.pack_key} style={cardStyle}>
                <strong>{r.name}</strong>
                <span style={{ marginLeft: 8, color: colors.muted, fontSize: 12 }}>v{r.version}</span>
                <p style={{ margin: '8px 0 0', color: colors.muted, fontSize: 14 }}>{r.description}</p>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.muted2 }}>Modules: {hint}</p>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
