import { useCallback, useEffect, useMemo, useState } from 'react'
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
  BRAND_DENSITY_OPTIONS,
  BRAND_FONT_OPTIONS,
  BRAND_PRESETS,
  coerceBrandKit,
  contrastRatio,
  fontStack,
  REDREACH_DEFAULT_BRAND,
  type BrandKit,
  type BrandKitDraft,
} from '../lib/brandKit'
import {
  listBrandKitsForCompany,
  listCompanyBusinessUnits,
  saveBrandKit,
  type BusinessUnitRow,
} from '../lib/brandKitStore'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
  selectStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

const COMPANY_SCOPE = '__company__'

/** §5.3 deepen: company + BU kits, fonts, density, live preview. */
export default function ThemeStudioPage() {
  const { showToast } = useToast()
  const { isLocalMode } = useAuth()
  const { tenantId, activeCompany, brandKit, setBrandKit } = useTenant()
  const [scopeId, setScopeId] = useState(COMPANY_SCOPE)
  const [units, setUnits] = useState<BusinessUnitRow[]>([])
  const [kits, setKits] = useState<BrandKit[]>([])
  const [editingKit, setEditingKit] = useState<BrandKit>(brandKit)
  const [draft, setDraft] = useState<BrandKitDraft>(() => brandKitToDraft(brandKit))
  const [saving, setSaving] = useState(false)

  const loadScoped = useCallback(async () => {
    if (!activeCompany?.id || isLocalMode) {
      setUnits([])
      setKits([])
      setEditingKit(brandKit)
      setDraft(brandKitToDraft(brandKit))
      setScopeId(COMPANY_SCOPE)
      return
    }
    try {
      const [buRows, kitRows] = await Promise.all([
        listCompanyBusinessUnits(activeCompany.id),
        listBrandKitsForCompany(activeCompany.id),
      ])
      setUnits(buRows)
      setKits(kitRows)
      const companyKit =
        kitRows.find((k) => k.business_unit_id == null) ||
        (brandKit.company_id === activeCompany.id ? brandKit : REDREACH_DEFAULT_BRAND)
      setEditingKit(companyKit)
      setDraft(brandKitToDraft(companyKit))
      setScopeId(COMPANY_SCOPE)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load business units'), 'error')
    }
  }, [activeCompany?.id, brandKit, isLocalMode, showToast])

  useEffect(() => {
    void loadScoped()
  }, [loadScoped])

  function onScopeChange(next: string) {
    setScopeId(next)
    if (next === COMPANY_SCOPE) {
      const companyKit =
        kits.find((k) => k.business_unit_id == null) ||
        (brandKit.company_id === activeCompany?.id ? brandKit : REDREACH_DEFAULT_BRAND)
      setEditingKit(companyKit)
      setDraft(brandKitToDraft(companyKit))
      return
    }
    const existing = kits.find((k) => k.business_unit_id === next)
    if (existing) {
      setEditingKit(existing)
      setDraft(brandKitToDraft(existing))
      return
    }
    const base = kits.find((k) => k.business_unit_id == null) || brandKit
    const blank = coerceBrandKit({
      ...base,
      id: undefined,
      business_unit_id: next,
      company_id: activeCompany?.id || base.company_id,
    })
    setEditingKit(blank)
    setDraft(brandKitToDraft(blank))
  }

  // Live preview while editing.
  useEffect(() => {
    applyBrandCssVars({
      ...editingKit,
      primary_color: draft.primary_color || editingKit.primary_color,
      accent_color: draft.accent_color || editingKit.accent_color,
      neutral_dark: draft.neutral_dark || editingKit.neutral_dark,
      neutral_light: draft.neutral_light || editingKit.neutral_light,
      fonts: {
        heading: draft.heading_font,
        body: draft.body_font,
        density: draft.density,
      },
    })
  }, [draft, editingKit])

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
    const { fonts, ...colorsOnly } = preset.kit
    setDraft((d) => ({
      ...d,
      ...colorsOnly,
      heading_font: fonts?.heading || d.heading_font,
      body_font: fonts?.body || d.body_font,
      density: fonts?.density || d.density,
    }))
  }

  function resetDefaults() {
    setDraft(brandKitToDraft(REDREACH_DEFAULT_BRAND))
  }

  async function onSave() {
    if (!tenantId || !activeCompany?.id) {
      showToast('No active company to save a brand kit for', 'error')
      return
    }
    const buId = scopeId === COMPANY_SCOPE ? null : scopeId
    if (isLocalMode) {
      const local = coerceBrandKit({
        ...editingKit,
        ...draftToLocal(draft),
        tenant_id: tenantId,
        company_id: activeCompany.id,
        business_unit_id: buId,
      })
      setEditingKit(local)
      if (!buId) setBrandKit(local)
      showToast(buId ? 'BU kit applied locally (not persisted)' : 'Brand kit applied locally (not persisted)', 'success')
      return
    }
    setSaving(true)
    try {
      const saved = await saveBrandKit({
        tenantId,
        companyId: activeCompany.id,
        businessUnitId: buId,
        draft,
        existingId: editingKit.id || null,
      })
      setEditingKit(saved)
      setKits((prev) => {
        const others = prev.filter((k) =>
          buId ? k.business_unit_id !== buId : k.business_unit_id != null,
        )
        return [...others, saved]
      })
      if (!buId) setBrandKit(saved)
      showToast(buId ? 'Business unit kit saved' : 'Company brand kit saved', 'success')
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

  const scopeLabel =
    scopeId === COMPANY_SCOPE
      ? activeCompany.name
      : units.find((u) => u.id === scopeId)?.name || 'Business unit'

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Theme studio · §5.3</p>
          <h1 className={docsStyles.title}>Brand kit</h1>
          <p className={docsStyles.subtitle}>
            Colours, fonts, density, and logo paths for <strong>{scopeLabel}</strong>. Official SVG masters still wait
            on the asset zip.
          </p>
        </div>
      </header>

      <div style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={labelStyle}>
          Scope
          <select style={selectStyle} value={scopeId} onChange={(e) => onScopeChange(e.target.value)}>
            <option value={COMPANY_SCOPE}>Company · {activeCompany.name}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                BU · {u.code} {u.name}
              </option>
            ))}
          </select>
        </label>
        {isLocalMode ? (
          <span style={{ fontSize: 12, color: colors.muted }}>Local mode — BU list unavailable from DB</span>
        ) : null}
      </div>

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

          <strong style={{ marginTop: 8 }}>Typography & density</strong>
          <label style={labelStyle}>
            Heading font
            <select
              style={selectStyle}
              value={draft.heading_font}
              onChange={(e) => patch('heading_font', e.target.value as BrandKitDraft['heading_font'])}
            >
              {BRAND_FONT_OPTIONS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Body font
            <select
              style={selectStyle}
              value={draft.body_font}
              onChange={(e) => patch('body_font', e.target.value as BrandKitDraft['body_font'])}
            >
              {BRAND_FONT_OPTIONS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            UI density
            <select
              style={selectStyle}
              value={draft.density}
              onChange={(e) => patch('density', e.target.value as BrandKitDraft['density'])}
            >
              {BRAND_DENSITY_OPTIONS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

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
              {saving ? 'Saving…' : scopeId === COMPANY_SCOPE ? 'Save company kit' : 'Save BU kit'}
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
              fontFamily: fontStack(draft.body_font),
              padding: `calc(12px * var(--rr-density, 1))`,
            }}
          >
            <div
              style={{
                background: draft.primary_color,
                color: draft.neutral_light,
                padding: `calc(14px * var(--rr-density, 1)) calc(16px * var(--rr-density, 1))`,
                fontWeight: 600,
                fontFamily: fontStack(draft.heading_font),
              }}
            >
              {scopeLabel}
            </div>
            <div style={{ padding: `calc(16px * var(--rr-density, 1))`, display: 'grid', gap: `calc(10px * var(--rr-density, 1))` }}>
              <img
                src={brandAssetUrl(draft.logo_horizontal_path || editingKit.logo_horizontal_path)}
                alt=""
                style={{ maxHeight: 40, maxWidth: '100%', objectFit: 'contain' }}
              />
              <h3 style={{ margin: 0, fontFamily: fontStack(draft.heading_font), fontSize: 18 }}>Heading sample</h3>
              <p style={{ margin: 0, fontSize: 14 }}>Sample body text on neutral light · density {draft.density}.</p>
              <button
                type="button"
                style={{
                  ...buttonPrimaryStyle,
                  background: draft.accent_color,
                  borderColor: draft.accent_color,
                  justifySelf: 'start',
                  padding: `var(--space-control-y, 9px) var(--space-control-x, 14px)`,
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

function draftToLocal(draft: BrandKitDraft) {
  return {
    primary_color: draft.primary_color,
    accent_color: draft.accent_color,
    neutral_dark: draft.neutral_dark,
    neutral_light: draft.neutral_light,
    logo_horizontal_path: draft.logo_horizontal_path || null,
    logo_light_path: draft.logo_light_path || null,
    mark_square_path: draft.mark_square_path || null,
    legal_footer: draft.legal_footer,
    fonts: {
      heading: draft.heading_font,
      body: draft.body_font,
      density: draft.density,
    },
  }
}
