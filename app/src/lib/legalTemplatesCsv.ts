/** NDA + service agreement template CSV column maps (export / draft import). */

import type { ColumnMap } from './listIo'

export const NDA_TEMPLATES_CSV_COLUMNS: ColumnMap[] = [
  { key: 'title', label: 'title', required: true },
  { key: 'body', label: 'body', required: true },
  { key: 'status', label: 'status' },
  { key: 'version', label: 'version' },
]

export const AGREEMENT_TEMPLATES_CSV_COLUMNS: ColumnMap[] = [
  { key: 'title', label: 'title', required: true },
  { key: 'body', label: 'body', required: true },
  { key: 'status', label: 'status' },
  { key: 'version', label: 'version' },
]
