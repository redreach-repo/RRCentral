import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useI18n } from '../../../contexts/I18nContext'
import { useToast } from '../../../contexts/ToastContext'
import EmptyState from '../../../components/EmptyState'
import { db } from '../../../lib/db'
import { errorMessage, isMissingRelationError } from '../../../lib/errors'
import { isSupabaseConfigured } from '../../../lib/supabaseConfig'
import {
  buttonPrimaryStyle,
  cardStyle,
  colors,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  sectionTitleStyle,
} from '../../../lib/uiStyles'
import SetupNotice from '../_shared/SetupNotice'

type DashboardRow = {
  id: string
  name: string
  layout_json: { widgets?: unknown[] }
  active: boolean
}

export default function DashboardsPage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [rows, setRows] = useState<DashboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (!isSupabaseConfigured()) {
        setRows([])
        setMissing(true)
        return
      }
      const { data, error } = await db
        .from('custom_dashboards')
        .select('id, name, layout_json, active')
        .eq('active', true)
        .order('name')
      if (error) {
        if (isMissingRelationError(error)) {
          setMissing(true)
          setRows([])
          return
        }
        throw error
      }
      setMissing(false)
      setRows((data || []) as DashboardRow[])
    } catch (e) {
      showToast(errorMessage(e, 'Could not load dashboards'), 'error')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function addStub() {
    setBusy(true)
    try {
      const { error } = await db.from('custom_dashboards').insert({
        name: `Dashboard ${rows.length + 1}`,
        layout_json: { widgets: [] },
        active: true,
      })
      if (error) throw error
      showToast(t('page.dashboards.added'), 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not add dashboard'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>{t('page.dashboards.title')}</h1>
      <p style={pageSubtitleStyle}>{t('page.dashboards.subtitle')}</p>
      <SetupNotice
        localMode={!isSupabaseConfigured()}
        missingTable={missing && isSupabaseConfigured()}
        doc="docs/modules/dashboards.md"
      />
      {!missing ? (
        <div style={{ marginBottom: 16 }}>
          <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void addStub()}>
            <Plus size={14} style={{ marginRight: 4 }} />
            {t('page.dashboards.add')}
          </button>
        </div>
      ) : null}
      {loading ? (
        <p style={{ color: colors.muted }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState title={t('page.dashboards.empty')} />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((r) => (
            <div key={r.id} style={cardStyle}>
              <h2 style={{ ...sectionTitleStyle, marginBottom: 4 }}>{r.name}</h2>
              <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>
                {(r.layout_json?.widgets || []).length} widget slot(s) — builder later
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
