import { useEffect, useMemo, useState } from 'react'
import { Palette } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { useTenant } from '../contexts/TenantContext'
import { useAuth } from '../contexts/AuthContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import {
  applyBrandCssVars,
  brandAssetUrl,
  brandKitToDraft,
  BRAND_PRESETS,
  contrastRatio,
  REDREACH_DEFAULT_BRAND,
  type BrandKitDraft,
} from '../lib/brandKit'
import { saveCompanyBrandKit } from '../lib/brandKitStore'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** §5.3 first slice: edit company brand kit colours + logo paths with live preview. */
export default function ThemeStudioPage() {
  const { showToast } = useToast()
  const { isLocalMode } = useAuth()
  const { tenantId, activeCompany, brandKit, setBrandKit } = useTenant()
  const [draft, setDraft] = useState<BrandKitDraft>(() => brandKitToDraft(brandKit))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(brandKitToDraft(brandKit))
  }, [brandKit])

  // Live preview while editing (reverts if user navigates away without save via TenantContext reload on remount).
  useEffect(() => {
    applyBrandCssVars({
      ...brandKit,
      primary_color: draft.primary_color || brandKit.primary_color,
      accent_color: draft.accent_color || brandKit.accent_color,
      neutral_dark: draft.neutral_dark || brandKit.neutral_dark,
      neutral_light: draft.neutral_light || brandKit.neutral_light,
    })
  }, [draft, brandKit])

  const primaryOnLight = useMemo(
    () => contrastRatio(draft.primary_color || '#000', draft.neutral_light || '#fff'),
    [draft.primary_color, draft.neutral_light],
  )
  const lightOnPrimary = useMemo(
    () => contrastRatio(draft.neutral_light || '#fff', draft.primary_color || '#000'),
    [draft.primary_color, draft.neutral_light],
  )

  function patch<K extends keyof BrandKitDraft>(key: K, value: BrandKitDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function applyPreset(key: string) {
    const preset = BRAND_PRESETS.find((p) => p.key === key)
    if (!preset) return
    setDraft((d) => ({ ...d, ...preset.kit }))
  }

  function resetDefaults() {
    setDraft(brandKitToDraft(REDREACH_DEFAULT_BRAND))
  }

  async function onSave() {
    if (!tenantId || !activeCompany?.id) {
      showToast('No active company to save a brand kit for', 'error')
      return
    }
    if (isLocalMode) {
      const local = {
        ...brandKit,
        ...draft,
        tenant_id: tenantId,
        company_id: activeCompany.id,
        logo_horizontal_path: draft.logo_horizontal_path || null,
        logo_light_path: draft.logo_light_path || null,
        mark_square_path: draft.mark_square_path || null,
      }
      setBrandKit(local)
      showToast('Brand kit applied locally (not persisted)', 'success')
      return
    }
    setSaving(true)
    try {
      const saved = await saveCompanyBrandKit({
        tenantId,
        companyId: activeCompany.id,
        draft,
        existingId: brandKit.company_id === activeCompany.id ? brandKit.id : null,
      })
      setBrandKit(saved)
      showToast('Brand kit saved', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not save brand kit'), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!activeCompany) {
    return (
      <div className={docsStyles.page}>
        <EmptyState icon={<Palette size={22} />} title="No company" subtitle="Pick a company in the top bar first." />
      </div>
    )
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Theme studio · §5.3 slice</p>
          <h1 className={docsStyles.title}>Brand kit</h1>
          <p className={docsStyles.subtitle}>
            Colours and logo paths for <strong>{activeCompany.name}</strong>. Fonts and full layout studio stay later.
            Official SVG masters still wait on the asset zip.
          </p>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {BRAND_PRESETS.map((p) => (
          <button key={p.key} type="button" style={buttonSecondaryStyle} onClick={() => applyPreset(p.key)}>
            {p.name}
          </button>
        ))}
        <button type="button" style={buttonSecondaryStyle} onClick={resetDefaults}>
          Reset to HighMast defaults
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void onSave()
          }}
          style={{ ...cardStyle, display: 'grid', gap: 10 }}
        >
          <strong>Colours</strong>
          {(
            [
              ['primary_color', 'Primary'],
              ['accent_color', 'Accent'],
              ['neutral_dark', 'Neutral dark'],
              ['neutral_light', 'Neutral light'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} style={labelStyle}>
              {label}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(draft[key]) ? draft[key] : '#000000'}
                  onChange={(e) => patch(key, e.target.value.toUpperCase())}
                  aria-label={`${label} picker`}
                />
                <input style={inputStyle} value={draft[key]} onChange={(e) => patch(key, e.target.value)} />
              </div>
            </label>
          ))}

          <strong style={{ marginTop: 8 }}>Assets</strong>
          <label style={labelStyle}>
            Logo (horizontal path or URL)
            <input
              style={inputStyle}
              value={draft.logo_horizontal_path}
              onChange={(e) => patch('logo_horizontal_path', e.target.value)}
            />
          </label>
          <label style={labelStyle}>
            Logo light
            <input style={inputStyle} value={draft.logo_light_path} onChange={(e) => patch('logo_light_path', e.target.value)} />
          </label>
          <label style={labelStyle}>
            Mark square
            <input style={inputStyle} value={draft.mark_square_path} onChange={(e) => patch('mark_square_path', e.target.value)} />
          </label>
          <label style={labelStyle}>
            Legal footer
            <input style={inputStyle} value={draft.legal_footer} onChange={(e) => patch('legal_footer', e.target.value)} />
          </label>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="submit" style={buttonPrimaryStyle} disabled={saving}>
              {saving ? 'Saving…' : 'Save brand kit'}
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>
            Contrast primary on light: {primaryOnLight}:1 · light on primary: {lightOnPrimary}:1 (aim ≥ 4.5 for text).
          </p>
        </form>

        <div style={{ ...cardStyle, display: 'grid', gap: 12, alignContent: 'start' }}>
          <strong>Preview</strong>
          <div
            style={{
              borderRadius: 12,
              overflow: 'hidden',
              border: `1px solid ${colors.border}`,
              background: draft.neutral_light,
              color: draft.neutral_dark,
            }}
          >
            <div style={{ background: draft.primary_color, color: draft.neutral_light, padding: '14px 16px', fontWeight: 600 }}>
              {activeCompany.name}
            </div>
            <div style={{ padding: 16, display: 'grid', gap: 10 }}>
              <img
                src={brandAssetUrl(draft.logo_horizontal_path || brandKit.logo_horizontal_path)}
                alt=""
                style={{ maxHeight: 40, maxWidth: '100%', objectFit: 'contain' }}
              />
              <p style={{ margin: 0, fontSize: 14 }}>Sample body text on neutral light.</p>
              <button
                type="button"
                style={{
                  ...buttonPrimaryStyle,
                  background: draft.accent_color,
                  borderColor: draft.accent_color,
                  justifySelf: 'start',
                }}
              >
                Accent action
              </button>
              <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>{draft.legal_footer || 'Legal footer'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
