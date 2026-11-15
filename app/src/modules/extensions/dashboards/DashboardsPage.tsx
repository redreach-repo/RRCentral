import { useCallback, useEffect, useRef, useState } from 'react'
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
  type DashboardWidgetType,
} from '../../../lib/dashboardWidgets'
import { errorMessage, isMissingRelationError } from '../../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../../lib/listIo'
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

const DASHBOARD_CSV_HEADERS = ['name', 'active', 'widget_count', 'widget_types'] as const

const WIDGET_TYPES = new Set<DashboardWidgetType>(['kpi_count', 'saved_view_link', 'static_note'])

type DashboardRow = {
  id: string
  name: string
  layout_json: unknown
  active: boolean
}

function parseActiveFlag(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  if (!v) return true
  return !['0', 'false', 'no', 'n', 'off'].includes(v)
}

function widgetId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `w_${Math.random().toString(36).slice(2, 10)}`
}

/** Rebuild stub widgets from export's semicolon-separated types column. */
function widgetsFromTypes(raw: string): DashboardWidget[] {
  const parts = raw
    .split(/[;|,]/)
    .map((p) => p.trim())
    .filter(Boolean)
  const widgets: DashboardWidget[] = []
  for (const part of parts) {
    const type = part as DashboardWidgetType
    if (!WIDGET_TYPES.has(type)) continue
    if (type === 'kpi_count') {
      widgets.push({ id: widgetId(), type, title: 'KPI', value: 0 })
    } else if (type === 'saved_view_link') {
      widgets.push({ id: widgetId(), type, title: 'Saved view', href: '/deals' })
    } else {
      widgets.push({ id: widgetId(), type, title: 'Note', body: 'Imported stub widget.' })
    }
  }
  return widgets
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
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

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

  async function importDashboardsCsv(file: File) {
    if (!isSupabaseConfigured() || missing) {
      showToast('Dashboards store is not available', 'error')
      return
    }
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const { data: existingRaw, error: existingError } = await db
        .from('custom_dashboards')
        .select('id, name, layout_json, active')
      if (existingError) {
        if (isMissingRelationError(existingError)) {
          showToast('custom_dashboards table is missing', 'error')
          return
        }
        throw existingError
      }
      const byName = new Map(
        ((existingRaw || []) as DashboardRow[]).map(
          (r) => [r.name.trim().toLowerCase(), r] as const,
        ),
      )
      let saved = 0
      let skipped = 0
      for (const row of objects) {
        const name = String(row.name || '').trim()
        if (!name) {
          skipped += 1
          continue
        }
        const active = parseActiveFlag(String(row.active ?? 'yes'))
        const fromTypes = widgetsFromTypes(String(row.widget_types || ''))
        const existing = byName.get(name.toLowerCase())
        if (existing) {
          const existingWidgets = parseDashboardLayout(existing.layout_json).widgets
          const layout_json =
            existingWidgets.length > 0
              ? existing.layout_json
              : { widgets: fromTypes.length ? fromTypes : defaultStubWidgets() }
          const { error } = await db
            .from('custom_dashboards')
            .update({
              name,
              active,
              layout_json,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
          if (error) throw error
          byName.set(name.toLowerCase(), {
            ...existing,
            name,
            active,
            layout_json,
          })
        } else {
          const layout_json = {
            widgets: fromTypes.length ? fromTypes : defaultStubWidgets(),
          }
          const { data: inserted, error } = await db
            .from('custom_dashboards')
            .insert({ name, layout_json, active })
            .select('id, name, layout_json, active')
            .single()
          if (error) throw error
          if (inserted) {
            byName.set(name.toLowerCase(), inserted as DashboardRow)
          }
        }
        saved += 1
      }
      if (!saved) {
        showToast('No matching dashboard rows in CSV', 'error')
        return
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} dashboard(s)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Dashboards CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'start' }}>
        <div>
          <h1 style={pageTitleStyle}>{t('page.dashboards.title')}</h1>
          <p style={pageSubtitleStyle}>{t('page.dashboards.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importDashboardsCsv(file)
            }}
          />
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={importing || missing || !isSupabaseConfigured()}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={!rows.length}
            onClick={() => {
              exportListCsv(
                'custom-dashboards.csv',
                [...DASHBOARD_CSV_HEADERS],
                rows.map((r) => {
                  const widgets = parseDashboardLayout(r.layout_json).widgets
                  return {
                    name: r.name,
                    active: r.active ? 'yes' : 'no',
                    widget_count: widgets.length,
                    widget_types: widgets.map((w) => w.type).join('; '),
                  }
                }),
              )
              showToast('Dashboards CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        </div>
      </div>
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
