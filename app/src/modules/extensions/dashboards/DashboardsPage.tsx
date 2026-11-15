import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useI18n } from '../../../contexts/I18nContext'
import { useToast } from '../../../contexts/ToastContext'
import EmptyState from '../../../components/EmptyState'
import { db } from '../../../lib/db'
import {
  defaultStubWidgets,
  parseDashboardLayout,
  type DashboardWidget,
} from '../../../lib/dashboardWidgets'
import { errorMessage, isMissingRelationError } from '../../../lib/errors'
import { isSupabaseConfigured } from '../../../lib/supabaseConfig'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
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
  layout_json: unknown
  active: boolean
}

function WidgetCard({ w }: { w: DashboardWidget }) {
  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: 12,
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <div style={{ fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {w.type}
      </div>
      <div style={{ fontWeight: 600, marginTop: 4 }}>{w.title}</div>
      {w.type === 'kpi_count' ? (
        <div style={{ fontSize: 28, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
          {Number(w.value) || 0}
        </div>
      ) : null}
      {w.type === 'saved_view_link' && w.href ? (
        <Link to={w.href} style={{ color: 'var(--primary-text)', fontSize: 13, marginTop: 8, display: 'inline-block' }}>
          Open →
        </Link>
      ) : null}
      {w.type === 'static_note' ? (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: colors.muted, lineHeight: 1.45 }}>{w.body || '—'}</p>
      ) : null}
    </div>
  )
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
        layout_json: { widgets: defaultStubWidgets() },
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

  async function seedWidgets(row: DashboardRow) {
    setBusy(true)
    try {
      const layout = parseDashboardLayout(row.layout_json)
      if (layout.widgets.length) {
        showToast('Already has widgets', 'info')
        return
      }
      const { error } = await db
        .from('custom_dashboards')
        .update({
          layout_json: { widgets: defaultStubWidgets() },
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      if (error) throw error
      showToast('Stub widgets added', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not add widgets'), 'error')
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
          {rows.map((r) => {
            const widgets = parseDashboardLayout(r.layout_json).widgets
            return (
              <div key={r.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <h2 style={{ ...sectionTitleStyle, marginBottom: 4 }}>{r.name}</h2>
                  {!widgets.length ? (
                    <button
                      type="button"
                      style={buttonSecondaryStyle}
                      disabled={busy}
                      onClick={() => void seedWidgets(r)}
                    >
                      Seed stub widgets
                    </button>
                  ) : null}
                </div>
                {widgets.length === 0 ? (
                  <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>No widgets yet.</p>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gap: 10,
                      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                      marginTop: 12,
                    }}
                  >
                    {widgets.map((w) => (
                      <WidgetCard key={w.id} w={w} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
