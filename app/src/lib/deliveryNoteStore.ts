import { db } from './db'
import { asError, shouldFallbackDeliveryNoteStorage } from './errors'
import {
  loadLineItems,
  saveLineItems,
  toPersistedLineItemRows,
  type DraftLineItem,
} from './lineItems'
import type { DeliveryNote, LineItem } from './types'

export const DELIVERY_NOTES_STORE_KEY = 'delivery_notes_store'

export type DeliveryNotesStoreBlob = {
  notes: DeliveryNote[]
  items: LineItem[]
}

let tableMissing: boolean | null = null

export function parseDeliveryNotesStoreValue(raw: string | null | undefined): DeliveryNotesStoreBlob {
  if (!raw || !String(raw).trim()) return { notes: [], items: [] }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return { notes: parsed as DeliveryNote[], items: [] }
    }
    if (parsed && typeof parsed === 'object') {
      const o = parsed as { notes?: unknown; items?: unknown }
      return {
        notes: Array.isArray(o.notes) ? (o.notes as DeliveryNote[]) : [],
        items: Array.isArray(o.items) ? (o.items as LineItem[]) : [],
      }
    }
  } catch {
    return { notes: [], items: [] }
  }
  return { notes: [], items: [] }
}

function sortNotes(notes: DeliveryNote[]): DeliveryNote[] {
  return [...notes].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
}

async function readBlob(): Promise<DeliveryNotesStoreBlob> {
  const { data, error } = await db
    .from('app_settings')
    .select('key, value')
    .eq('key', DELIVERY_NOTES_STORE_KEY)
    .maybeSingle()
  if (error) {
    if (shouldFallbackDeliveryNoteStorage(error)) return { notes: [], items: [] }
    throw asError(error, 'Could not load delivery notes')
  }
  return parseDeliveryNotesStoreValue((data as { value?: string } | null)?.value)
}

async function writeBlob(blob: DeliveryNotesStoreBlob): Promise<void> {
  const { error } = await db.from('app_settings').upsert(
    { key: DELIVERY_NOTES_STORE_KEY, value: JSON.stringify(blob) },
    { onConflict: 'key' },
  )
  if (error) throw asError(error, 'Could not save delivery note')
}

export async function listDeliveryNotes(): Promise<DeliveryNote[]> {
  const blob = await readBlob()
  if (tableMissing !== true) {
    const { data, error } = await db
      .from('delivery_notes')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) {
      tableMissing = false
      const byId = new Map(((data || []) as DeliveryNote[]).map((n) => [n.id, n]))
      for (const note of blob.notes) {
        if (!byId.has(note.id)) byId.set(note.id, note)
      }
      return sortNotes([...byId.values()])
    }
    if (shouldFallbackDeliveryNoteStorage(error)) tableMissing = true
    else throw asError(error, 'Could not load delivery notes')
  }
  return sortNotes(blob.notes)
}

export async function listDeliveryNoteRefs(): Promise<string[]> {
  return (await listDeliveryNotes()).map((n) => n.reference_number).filter(Boolean)
}

export async function getDeliveryNote(id: string): Promise<DeliveryNote | null> {
  if (tableMissing !== true) {
    const { data, error } = await db.from('delivery_notes').select('*').eq('id', id).maybeSingle()
    if (!error) {
      tableMissing = false
      if (data) return data as DeliveryNote
    } else if (shouldFallbackDeliveryNoteStorage(error)) {
      tableMissing = true
    } else {
      throw asError(error, 'Could not load delivery note')
    }
  }
  const blob = await readBlob()
  return blob.notes.find((n) => n.id === id) || null
}

export async function insertDeliveryNote(note: DeliveryNote): Promise<DeliveryNote> {
  if (tableMissing !== true) {
    const { error } = await db.from('delivery_notes').insert(note)
    if (!error) {
      tableMissing = false
      return note
    }
    if (shouldFallbackDeliveryNoteStorage(error)) tableMissing = true
    else throw asError(error, 'Could not create delivery note')
  }
  const blob = await readBlob()
  blob.notes = [note, ...blob.notes.filter((n) => n.id !== note.id && n.reference_number !== note.reference_number)]
  await writeBlob(blob)
  return note
}

export async function updateDeliveryNote(id: string, patch: Partial<DeliveryNote>): Promise<void> {
  if (tableMissing !== true) {
    const { error } = await db.from('delivery_notes').update(patch).eq('id', id)
    if (error && shouldFallbackDeliveryNoteStorage(error)) tableMissing = true
    else if (error) throw asError(error, 'Could not save delivery note')
    else tableMissing = false
  }
  const blob = await readBlob()
  const idx = blob.notes.findIndex((n) => n.id === id)
  if (idx >= 0) {
    blob.notes[idx] = { ...blob.notes[idx], ...patch }
    await writeBlob(blob)
    return
  }
  if (tableMissing === true) throw new Error('Delivery note not found')
}

export async function deleteDeliveryNote(id: string): Promise<void> {
  if (tableMissing !== true) {
    const { error } = await db.from('delivery_notes').delete().eq('id', id)
    if (error && shouldFallbackDeliveryNoteStorage(error)) tableMissing = true
    else if (error) throw asError(error, 'Could not delete delivery note')
  }
  const blob = await readBlob()
  const note = blob.notes.find((n) => n.id === id)
  blob.notes = blob.notes.filter((n) => n.id !== id)
  if (note?.reference_number) {
    blob.items = blob.items.filter((i) => i.reference !== note.reference_number)
  }
  await writeBlob(blob)
}

export async function loadDeliveryNoteLineItems(reference: string): Promise<LineItem[]> {
  if (!reference) return []
  try {
    const rows = await loadLineItems('DeliveryNote', reference)
    if (rows.length) return rows
  } catch (e) {
    if (!shouldFallbackDeliveryNoteStorage(e)) throw asError(e, 'Failed to load line items')
  }
  const blob = await readBlob()
  return blob.items
    .filter((i) => i.reference === reference)
    .sort((a, b) => (a.line_no || 0) - (b.line_no || 0))
}

export async function saveDeliveryNoteLineItems(reference: string, drafts: DraftLineItem[]): Promise<void> {
  try {
    await saveLineItems('DeliveryNote', reference, drafts, 0)
    const blob = await readBlob()
    if (blob.items.some((i) => i.reference === reference)) {
      blob.items = blob.items.filter((i) => i.reference !== reference)
      await writeBlob(blob)
    }
    return
  } catch (e) {
    if (!shouldFallbackDeliveryNoteStorage(e)) throw asError(e, 'Could not save delivery note lines')
  }
  const now = new Date().toISOString()
  const items: LineItem[] = toPersistedLineItemRows('DeliveryNote', reference, drafts, 0).map((row) => ({
    id: crypto.randomUUID(),
    created_at: now,
    ...row,
    sizes_json: row.sizes_json as LineItem['sizes_json'],
  }))
  const blob = await readBlob()
  blob.items = [...blob.items.filter((i) => i.reference !== reference), ...items]
  await writeBlob(blob)
}

export async function deleteDeliveryNoteLineItems(reference: string): Promise<void> {
  if (reference) {
    const { error } = await db
      .from('line_items')
      .delete()
      .eq('doc_type', 'DeliveryNote')
      .eq('reference', reference)
    if (error && !shouldFallbackDeliveryNoteStorage(error)) {
      throw asError(error, 'Could not delete delivery note lines')
    }
  }
  const blob = await readBlob()
  blob.items = blob.items.filter((i) => i.reference !== reference)
  await writeBlob(blob)
}
