/**
 * Client data export: one download with everything RR Central holds for a
 * client, as spreadsheets (CSV) plus one JSON file, with a README.
 *
 * "For the client" is what you hand over when they ask for their data or
 * leave: it leaves out internal notes, costs and anything about how we run
 * the account. "Full, for our records" includes everything.
 */
import { format } from 'date-fns'
import type { Account } from './types'
import { makeZip } from './zip'

export type ExportMode = 'client' | 'full'

export type ExportTable = {
  table: string
  label: string
  /** How the rows link to the client. */
  by: 'id' | 'account_id' | 'ticket_id'
  /** Included in the export handed to the client. */
  client: boolean
  /** Columns left out of the client export. */
  hideForClient?: string[]
  /** Columns never exported. */
  never?: string[]
}

export const EXPORT_TABLES: ExportTable[] = [
  { table: 'accounts', label: 'Client details', by: 'id', client: true, hideForClient: ['notes', 'owner_user_id', 'source', 'created_by'] },
  { table: 'account_contacts', label: 'Contacts', by: 'account_id', client: true },
  { table: 'contracts', label: 'Contracts', by: 'account_id', client: true, hideForClient: ['notes'] },
  { table: 'invoices', label: 'Invoices', by: 'account_id', client: true, hideForClient: ['notes', 'internal_notes', 'created_by'] },
  { table: 'quotations', label: 'Quotations', by: 'account_id', client: true, hideForClient: ['notes', 'internal_notes', 'created_by'] },
  { table: 'build_stages', label: 'Build progress', by: 'account_id', client: true },
  { table: 'build_tasks', label: 'Build checklist', by: 'account_id', client: true },
  { table: 'requirements', label: 'Requirements', by: 'account_id', client: true },
  { table: 'usage_records', label: 'Monthly usage', by: 'account_id', client: true },
  { table: 'tickets', label: 'Support tickets', by: 'account_id', client: true, hideForClient: ['assignee_user_id'] },
  { table: 'ticket_messages', label: 'Support messages', by: 'ticket_id', client: true, hideForClient: ['author_user_id'] },
  { table: 'time_entries', label: 'Hours logged', by: 'account_id', client: false },
  { table: 'account_activities', label: 'Activity and notes', by: 'account_id', client: false },
  { table: 'sales_deals', label: 'Sales deal', by: 'account_id', client: false },
  { table: 'ctrm_deals', label: 'CTRM deals', by: 'account_id', client: false },
  { table: 'ai_usage_log', label: 'AI help costs', by: 'account_id', client: false },
  { table: 'usage_sources', label: 'Usage import settings', by: 'account_id', client: false },
  { table: 'portal_access', label: 'Portal links', by: 'account_id', client: false, never: ['token_hash'] },
  { table: 'worship_church_profiles', label: 'WorshipHub profile', by: 'account_id', client: false },
]

export function tablesFor(mode: ExportMode): ExportTable[] {
  return mode === 'client' ? EXPORT_TABLES.filter((t) => t.client) : EXPORT_TABLES
}

type Row = Record<string, unknown>

/** Drops rows and columns the export should not carry. */
export function prepareRows(spec: ExportTable, rows: Row[], mode: ExportMode): Row[] {
  const drop = new Set([...(spec.never ?? []), ...(mode === 'client' ? (spec.hideForClient ?? []) : [])])
  return rows
    .filter((r) => !(mode === 'client' && spec.table === 'ticket_messages' && r.is_internal_note))
    .map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !drop.has(k))))
}

function cell(v: unknown): string {
  if (v == null) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  // Stop spreadsheet apps treating text as a formula.
  // Numbers and phone numbers such as +971 50 123 4567 are left alone.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().]+$/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** CSV with a header row of every column seen. Starts with a BOM so Excel reads Arabic and accents. */
export function toCsv(rows: Row[]): string {
  const cols: string[] = []
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k)
  const lines = [cols.map(cell).join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))]
  return `﻿${lines.join('\r\n')}\r\n`
}

const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

export function exportFileName(account: Pick<Account, 'name' | 'reference'>, mode: ExportMode, when: Date = new Date()): string {
  const who = [slug(account.reference || ''), slug(account.name || '')].filter(Boolean).join('-') || 'client'
  return `${who}-data${mode === 'full' ? '-full' : ''}-${format(when, 'yyyy-MM-dd')}.zip`
}

export function exportReadme(
  account: Pick<Account, 'name' | 'reference'>,
  mode: ExportMode,
  counts: { spec: ExportTable; count: number }[],
  meta: { companyName: string; madeBy: string; when: Date },
): string {
  const lines = [
    `Data export for ${account.name}${account.reference ? ` (${account.reference})` : ''}`,
    `Made by ${meta.companyName} on ${format(meta.when, "d MMMM yyyy 'at' HH:mm")}${meta.madeBy ? ` by ${meta.madeBy}` : ''}.`,
    '',
    mode === 'client'
      ? 'This is all the information we hold about your account in RR Central, our client management system.'
      : 'Full export for our records, including internal notes and costs. Do not send this one to the client.',
    '',
    'Each spreadsheet (.csv) opens in Excel, Numbers or Google Sheets. everything.json has the same data for importing into another system.',
    '',
    'Files:',
    ...counts.map((c) => `- ${slug(c.spec.label).toLowerCase()}.csv: ${c.spec.label}, ${c.count} ${c.count === 1 ? 'row' : 'rows'}`),
    '',
    'Dates and times are in UTC. Amounts are in AED unless a currency column says otherwise.',
  ]
  if (mode === 'client') {
    lines.push(
      '',
      'Your CRM system itself (your own contacts, leads and messages) is exported separately from that system.',
    )
  }
  return lines.join('\r\n') + '\r\n'
}

/** The ZIP: README, one CSV per table that has rows, and everything.json. */
export function buildExportZip(
  account: Pick<Account, 'name' | 'reference'>,
  mode: ExportMode,
  data: { spec: ExportTable; rows: Row[] }[],
  meta: { companyName: string; madeBy: string; when: Date },
): { zip: Uint8Array; counts: { spec: ExportTable; count: number }[] } {
  const prepared = data.map((d) => ({ spec: d.spec, rows: prepareRows(d.spec, d.rows, mode) }))
  const counts = prepared.map((p) => ({ spec: p.spec, count: p.rows.length }))
  const files = [
    { name: 'README.txt', data: exportReadme(account, mode, counts.filter((c) => c.count > 0), meta) },
    ...prepared.filter((p) => p.rows.length).map((p) => ({ name: `${slug(p.spec.label).toLowerCase()}.csv`, data: toCsv(p.rows) })),
    {
      name: 'everything.json',
      data: JSON.stringify(
        {
          exported_at: meta.when.toISOString(),
          kind: mode === 'client' ? 'client copy' : 'full internal copy',
          ...Object.fromEntries(prepared.map((p) => [p.spec.table, p.rows])),
        },
        null,
        2,
      ),
    },
  ]
  return { zip: makeZip(files, meta.when), counts }
}
