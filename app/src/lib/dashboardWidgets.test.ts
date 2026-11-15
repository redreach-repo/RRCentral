import { describe, expect, it } from 'vitest'
import { defaultStubWidgets, parseDashboardLayout } from './dashboardWidgets'

describe('dashboardWidgets', () => {
  it('parses known widget types and drops junk', () => {
    const layout = parseDashboardLayout({
      widgets: [
        { id: '1', type: 'kpi_count', title: 'Deals', value: 3 },
        { type: 'chart', title: 'Nope' },
        { id: '2', type: 'static_note', title: 'Hi', body: 'Hello' },
      ],
    })
    expect(layout.widgets).toHaveLength(2)
    expect(layout.widgets[0].type).toBe('kpi_count')
    expect(layout.widgets[1].body).toBe('Hello')
  })

  it('seeds three stub widgets', () => {
    expect(defaultStubWidgets().map((w) => w.type)).toEqual([
      'kpi_count',
      'saved_view_link',
      'static_note',
    ])
  })
})
