import { db } from './db'
import { isMissingRelationError } from './errors'
import { DEFAULT_NDA_BODY, DEFAULT_NDA_TITLE, nextNdaVersion } from './nda'
import type { NdaTemplate } from './types'

function check(result: { error: unknown }) {
  if (result.error) throw result.error
}

export async function listNdaTemplates(): Promise<{ rows: NdaTemplate[]; missingTable: boolean }> {
  const { data, error } = await db.from('nda_templates').select('*').order('version', { ascending: false })
  if (error) {
    if (isMissingRelationError(error)) return { rows: [], missingTable: true }
    throw error
  }
  const rows = ((data || []) as NdaTemplate[]).sort((a, b) => b.version - a.version)
  return { rows, missingTable: false }
}

export async function saveNdaDraft(
  input: { title: string; body: string },
  author: string,
  existing: NdaTemplate[],
  id?: string,
): Promise<string> {
  const now = new Date().toISOString()
  if (id) {
    const row = existing.find((t) => t.id === id)
    if (row && row.status !== 'draft') throw new Error('An approved template is locked. Start a new draft instead.')
    check(await db.from('nda_templates').update({ title: input.title, body: input.body, updated_at: now }).eq('id', id))
    return id
  }
  const newId = crypto.randomUUID()
  check(
    await db.from('nda_templates').insert({
      id: newId,
      version: nextNdaVersion(existing),
      title: input.title || DEFAULT_NDA_TITLE,
      body: input.body || DEFAULT_NDA_BODY,
      status: 'draft',
      approved_by: '',
      approved_at: null,
      approval_note: '',
      created_by: author,
      created_at: now,
      updated_at: now,
    }),
  )
  return newId
}

export async function approveNdaTemplate(
  id: string,
  approval: { approvedBy: string; approvedOn: string; note: string },
  existing: NdaTemplate[],
): Promise<void> {
  const by = approval.approvedBy.trim()
  if (!by) throw new Error('Type the name of the lawyer who approved it.')
  const now = new Date().toISOString()
  for (const t of existing.filter((x) => x.status === 'approved' && x.id !== id)) {
    check(await db.from('nda_templates').update({ status: 'retired', updated_at: now }).eq('id', t.id))
  }
  check(
    await db
      .from('nda_templates')
      .update({
        status: 'approved',
        approved_by: by,
        approved_at: approval.approvedOn ? new Date(`${approval.approvedOn}T12:00:00Z`).toISOString() : now,
        approval_note: approval.note.trim(),
        updated_at: now,
      })
      .eq('id', id),
  )
}

export async function deleteNdaDraft(id: string): Promise<void> {
  check(await db.from('nda_templates').delete().eq('id', id).eq('status', 'draft'))
}
