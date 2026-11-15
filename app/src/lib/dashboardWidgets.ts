/** Typed stub widgets for custom_dashboards.layout_json (no live charts). */

export type DashboardWidgetType = 'kpi_count' | 'saved_view_link' | 'static_note'

export type DashboardWidget = {
  id: string
  type: DashboardWidgetType
  title: string
  /** kpi_count: numeric stub; saved_view_link: path; static_note: body text */
  value?: string | number
  href?: string
  body?: string
}

export type DashboardLayout = {
  widgets: DashboardWidget[]
}

const TYPES = new Set<DashboardWidgetType>(['kpi_count', 'saved_view_link', 'static_note'])

export function parseDashboardLayout(raw: unknown): DashboardLayout {
  const widgetsIn =
    raw && typeof raw === 'object' && Array.isArray((raw as { widgets?: unknown }).widgets)
      ? ((raw as { widgets: unknown[] }).widgets)
      : []
  const widgets: DashboardWidget[] = []
  for (const w of widgetsIn) {
    if (!w || typeof w !== 'object') continue
    const o = w as Record<string, unknown>
    const type = String(o.type || '') as DashboardWidgetType
    if (!TYPES.has(type)) continue
    const id = String(o.id || cryptoRandomId())
    const title = String(o.title || type).trim() || type
    widgets.push({
      id,
      type,
      title,
      value: o.value as string | number | undefined,
      href: o.href != null ? String(o.href) : undefined,
      body: o.body != null ? String(o.body) : undefined,
    })
  }
  return { widgets }
}

export function defaultStubWidgets(): DashboardWidget[] {
  return [
    {
      id: cryptoRandomId(),
      type: 'kpi_count',
      title: 'Open deals',
      value: 0,
    },
    {
      id: cryptoRandomId(),
      type: 'saved_view_link',
      title: 'Pipeline',
      href: '/deals',
    },
    {
      id: cryptoRandomId(),
      type: 'static_note',
      title: 'Note',
      body: 'Widget builder later — these slots are stubs.',
    },
  ]
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `w_${Math.random().toString(36).slice(2, 10)}`
}
