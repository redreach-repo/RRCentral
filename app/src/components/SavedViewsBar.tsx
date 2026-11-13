import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createSavedView,
  deleteSavedView,
  listSavedViews,
  type SavedView,
} from '../lib/savedViews'
import { errorMessage } from '../lib/errors'
import { parseSavedViewForm } from '../lib/schemas/savedView'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  colors,
  inputStyle,
  selectStyle,
} from '../lib/uiStyles'

type Props = {
  moduleId: string
  /** Current filter snapshot to save / match against. */
  filters: Record<string, unknown>
  ownerUserId: string | null
  canWrite: boolean
  onApply: (filters: Record<string, unknown>) => void
  onToast: (message: string, kind: 'success' | 'error') => void
  /** When true, apply the module default once on first load. */
  applyDefaultOnLoad?: boolean
  filtersEqual?: (a: Record<string, unknown>, b: Record<string, unknown>) => boolean
}

export default function SavedViewsBar({
  moduleId,
  filters,
  ownerUserId,
  canWrite,
  onApply,
  onToast,
  applyDefaultOnLoad = true,
  filtersEqual,
}: Props) {
  const [views, setViews] = useState<SavedView[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [saving, setSaving] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [naming, setNaming] = useState(false)
  const [didApplyDefault, setDidApplyDefault] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setViews(await listSavedViews(moduleId))
    } catch {
      setViews([])
    } finally {
      setLoading(false)
    }
  }, [moduleId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!applyDefaultOnLoad || didApplyDefault || loading || !views.length) return
    const def = views.find((v) => v.is_default) || views[0]
    if (!def) return
    setSelectedId(def.id)
    onApply((def.filters || {}) as Record<string, unknown>)
    setDidApplyDefault(true)
  }, [applyDefaultOnLoad, didApplyDefault, loading, views, onApply])

  const selected = useMemo(
    () => views.find((v) => v.id === selectedId) || null,
    [views, selectedId],
  )

  const matchesSelected = useMemo(() => {
    if (!selected) return false
    const a = (selected.filters || {}) as Record<string, unknown>
    if (filtersEqual) return filtersEqual(a, filters)
    return JSON.stringify(a) === JSON.stringify(filters)
  }, [selected, filters, filtersEqual])

  async function saveCurrent() {
    const parsed = parseSavedViewForm({
      name: nameDraft,
      module_id: moduleId,
      filters,
      owner_user_id: ownerUserId,
    })
    if (!parsed.ok) {
      onToast(parsed.error, 'error')
      return
    }
    setSaving(true)
    try {
      const row = await createSavedView({
        module_id: parsed.data.module_id,
        name: parsed.data.name,
        filters: parsed.data.filters,
        is_shared: parsed.data.is_shared,
        owner_user_id: parsed.data.owner_user_id,
      })
      setViews((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedId(row.id)
      setNaming(false)
      setNameDraft('')
      onToast('View saved', 'success')
    } catch (e) {
      onToast(errorMessage(e, 'Could not save view'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function removeSelected() {
    if (!selected) return
    if (selected.is_default) {
      onToast('Default shared views cannot be deleted here', 'error')
      return
    }
    setSaving(true)
    try {
      await deleteSavedView(selected.id)
      setViews((prev) => prev.filter((v) => v.id !== selected.id))
      setSelectedId('')
      onToast('View deleted', 'success')
    } catch (e) {
      onToast(errorMessage(e, 'Could not delete view'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
      }}
    >
      <label style={{ fontSize: 12, color: colors.muted, whiteSpace: 'nowrap' }}>View</label>
      <select
        style={{ ...selectStyle, maxWidth: 220, height: 36 }}
        value={selectedId}
        disabled={loading}
        aria-label="Saved view"
        onChange={(e) => {
          const id = e.target.value
          setSelectedId(id)
          const view = views.find((v) => v.id === id)
          if (view) onApply((view.filters || {}) as Record<string, unknown>)
        }}
      >
        <option value="">{loading ? 'Loading…' : 'Current filters'}</option>
        {views.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
            {v.is_shared ? ' (shared)' : ''}
            {v.is_default ? ' ★' : ''}
          </option>
        ))}
      </select>

      {canWrite ? (
        naming ? (
          <>
            <input
              style={{ ...inputStyle, maxWidth: 180, height: 36 }}
              placeholder="View name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveCurrent()
                if (e.key === 'Escape') {
                  setNaming(false)
                  setNameDraft('')
                }
              }}
            />
            <button
              type="button"
              style={buttonPrimaryStyle}
              disabled={saving}
              onClick={() => void saveCurrent()}
            >
              Save
            </button>
            <button
              type="button"
              style={buttonSecondaryStyle}
              onClick={() => {
                setNaming(false)
                setNameDraft('')
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              style={buttonSecondaryStyle}
              disabled={saving || (Boolean(selectedId) && matchesSelected)}
              onClick={() => setNaming(true)}
              title="Save the current filters as a view"
            >
              Save view
            </button>
            {selected && !selected.is_default ? (
              <button
                type="button"
                style={buttonSecondaryStyle}
                disabled={saving}
                onClick={() => void removeSelected()}
              >
                Delete
              </button>
            ) : null}
          </>
        )
      ) : null}
    </div>
  )
}
