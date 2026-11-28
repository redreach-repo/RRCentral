import { db } from './db'
import { cleanHiddenPages, canHidePage, pagePath } from './hiddenPages'

/** Pages hidden from one person. Missing table (SQL not run yet) reads as none. */
export async function listHiddenPages(userId: string): Promise<{ pages: string[]; missingTable: boolean }> {
  const { data, error } = await db.from('user_hidden_pages').select('page_path').eq('user_id', userId)
  if (error) {
    const missing = /user_hidden_pages|does not exist|schema cache/i.test(error.message || '')
    if (missing) return { pages: [], missingTable: true }
    throw new Error(error.message)
  }
  return { pages: cleanHiddenPages(((data || []) as { page_path: string }[]).map((r) => r.page_path)), missingTable: false }
}

/** Hide or show pages for one person. Only admins can (the database refuses everyone else). */
export async function setPagesHidden(userId: string, paths: readonly string[], hidden: boolean): Promise<void> {
  const clean = [...new Set(paths.map(pagePath).filter(canHidePage))]
  if (clean.length === 0) return
  if (hidden) {
    const { error } = await db
      .from('user_hidden_pages')
      .upsert(
        clean.map((page_path) => ({ user_id: userId, page_path })),
        { onConflict: 'user_id,page_path', ignoreDuplicates: true },
      )
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await db.from('user_hidden_pages').delete().eq('user_id', userId).in('page_path', clean)
  if (error) throw new Error(error.message)
}
