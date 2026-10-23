import { db } from './db'
import { isMissingRelationError } from './errors'
import { DEFAULT_AGREEMENT_BODY, DEFAULT_AGREEMENT_TITLE, nextVersion } from './serviceAgreement'
import type { AgreementTemplate } from './types'

function check(result: { error: unknown }) {
  if (result.error) throw result.error
}

/** All versions, newest first. missingTable is true until the item 10 SQL has been run. */
export async function listAgreementTemplates(): Promise<{ rows: AgreementTemplate[]; missingTable: boolean }> {
  const { data, error } = await db.from('agreement_templates').select('*').order('version', { ascending: false })
  if (error) {
    if (isMissingRelationError(error)) return { rows: [], missingTable: true }
    throw error
  }
  const rows = ((data || []) as AgreementTemplate[]).sort((a, b) => b.version - a.version)
  return { rows, missingTable: false }
}

/** Save changes to a draft, or start a new draft (from the starter wording or a copy). Returns its id. */
export async function saveAgreementDraft(
  input: { title: string; body: string },
  author: string,
  existing: AgreementTemplate[],
  id?: string,
): Promise<string> {
  const now = new Date().toISOString()
  if (id) {
    const row = existing.find((t) => t.id === id)
    if (row && row.status !== 'draft') throw new Error('An approved template is locked. Start a new draft instead.')
    check(await db.from('agreement_templates').update({ title: input.title, body: input.body, updated_at: now }).eq('id', id))
    return id
  }
  const newId = crypto.randomUUID()
  check(
    await db.from('agreement_templates').insert({
      id: newId,
      version: nextVersion(existing),
      title: input.title || DEFAULT_AGREEMENT_TITLE,
      body: input.body || DEFAULT_AGREEMENT_BODY,
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

/** Record the lawyer's approval. The version that was in use is retired, so only one is approved. */
export async function approveAgreementTemplate(
  id: string,
  approval: { approvedBy: string; approvedOn: string; note: string },
  existing: AgreementTemplate[],
): Promise<void> {
  const by = approval.approvedBy.trim()
  if (!by) throw new Error('Type the name of the lawyer who approved it.')
  const now = new Date().toISOString()
  for (const t of existing.filter((x) => x.status === 'approved' && x.id !== id)) {
    check(await db.from('agreement_templates').update({ status: 'retired', updated_at: now }).eq('id', t.id))
  }
  check(
    await db
      .from('agreement_templates')
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

/** Only drafts can be deleted. */
export async function deleteAgreementDraft(t: AgreementTemplate): Promise<void> {
  if (t.status !== 'draft') throw new Error('Approved templates are kept as a record and cannot be deleted.')
  check(await db.from('agreement_templates').delete().eq('id', t.id))
}
