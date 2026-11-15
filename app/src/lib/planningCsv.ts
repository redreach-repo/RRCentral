/** Planning goals + scenarios CSV column maps for listIo import. */

import type { ColumnMap } from './listIo'

export const PLANNING_GOALS_CSV_COLUMNS: ColumnMap[] = [
  { key: 'name', label: 'name', required: true },
  { key: 'metric_key', label: 'metric_key' },
  { key: 'target_value', label: 'target_value', required: true },
  { key: 'period_yyyy_mm', label: 'period_yyyy_mm' },
  { key: 'status', label: 'status' },
  { key: 'notes', label: 'notes' },
]

export const PLANNING_SCENARIOS_CSV_COLUMNS: ColumnMap[] = [
  { key: 'name', label: 'name', required: true },
  { key: 'description', label: 'description' },
  { key: 'assumptions_json', label: 'assumptions_json' },
]
