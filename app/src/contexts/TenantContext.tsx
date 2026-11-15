import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { db } from '../lib/db'
import {
  applyBrandCssVars,
  BRAND_KIT_COLUMNS,
  coerceBrandKit,
  REDREACH_DEFAULT_BRAND,
  resolveBrandKit,
  type BrandKit,
} from '../lib/brandKit'
import { listBrandKitsForCompany, listCompanyBusinessUnits, type BusinessUnitRow } from '../lib/brandKitStore'
import { REDREACH_COMPANY_ID, REDREACH_TENANT_ID } from '../modules/registry'
import { applyTenantWebManifest, identityFromBrandKit } from '../lib/tenantAppIdentity'

export type TenantCompany = {
  id: string
  name: string
  legal_name: string
  is_default: boolean
  active: boolean
  currency: string
}

type TenantValue = {
  tenantId: string | null
  companies: TenantCompany[]
  activeCompanyId: string | null
  activeCompany: TenantCompany | null
  setActiveCompanyId: (id: string) => void
  businessUnits: BusinessUnitRow[]
  /** null = company-wide chrome kit */
  activeBusinessUnitId: string | null
  activeBusinessUnit: BusinessUnitRow | null
  setActiveBusinessUnitId: (id: string | null) => void
  brandKit: BrandKit
  /** Apply a kit immediately (Theme Studio save / preview). Also merges into kit cache. */
  setBrandKit: (kit: BrandKit) => void
  loading: boolean
}

const TenantContext = createContext<TenantValue | undefined>(undefined)

const COMPANY_KEY = 'rrcentral_active_company'
const BU_KEY = 'rrcentral_active_business_unit'

function readStoredCompany(): string | null {
  try {
    return localStorage.getItem(COMPANY_KEY)
  } catch {
    return null
  }
}

function readStoredBu(): string | null {
  try {
    return localStorage.getItem(BU_KEY)
  } catch {
    return null
  }
}

const FALLBACK_COMPANY: TenantCompany = {
  id: REDREACH_COMPANY_ID,
  name: 'Red Reach Middle East FZE',
  legal_name: 'Red Reach Middle East FZE',
  is_default: true,
  active: true,
  currency: 'AED',
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, hasAccess, tenantId: authTenantId, isLocalMode } = useAuth()
  const [companies, setCompanies] = useState<TenantCompany[]>([])
  const [businessUnits, setBusinessUnits] = useState<BusinessUnitRow[]>([])
  const [kitCache, setKitCache] = useState<BrandKit[]>([REDREACH_DEFAULT_BRAND])
  const [brandKit, setBrandKitState] = useState<BrandKit>(REDREACH_DEFAULT_BRAND)
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null)
  const [activeBusinessUnitId, setActiveBusinessUnitIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const tenantId = authTenantId || (isLocalMode ? REDREACH_TENANT_ID : null)

  const applyResolved = useCallback(
    (kits: BrandKit[], companyId: string | null, buId: string | null) => {
      const resolved = resolveBrandKit({ kits, companyId, businessUnitId: buId })
      setBrandKitState(resolved)
    },
    [],
  )

  const setActiveCompanyId = useCallback((id: string) => {
    setActiveCompanyIdState(id)
    try {
      localStorage.setItem(COMPANY_KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  const setActiveBusinessUnitId = useCallback((id: string | null) => {
    setActiveBusinessUnitIdState(id)
    try {
      if (id) localStorage.setItem(BU_KEY, id)
      else localStorage.removeItem(BU_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const setBrandKit = useCallback(
    (kit: BrandKit) => {
      setBrandKitState(kit)
      setKitCache((prev) => {
        const coerced = coerceBrandKit(kit)
        if (coerced.business_unit_id) {
          return [...prev.filter((k) => k.business_unit_id !== coerced.business_unit_id), coerced]
        }
        if (coerced.company_id) {
          return [
            ...prev.filter(
              (k) => !(k.company_id === coerced.company_id && k.business_unit_id == null),
            ),
            coerced,
          ]
        }
        return [...prev.filter((k) => !(k.company_id == null && k.business_unit_id == null)), coerced]
      })
    },
    [],
  )

  // Initial companies + tenant default kit
  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!user || !hasAccess) {
        if (!cancelled) {
          setCompanies([FALLBACK_COMPANY])
          setActiveCompanyIdState(REDREACH_COMPANY_ID)
          setBusinessUnits([])
          setActiveBusinessUnitIdState(null)
          setKitCache([REDREACH_DEFAULT_BRAND])
          setBrandKitState(REDREACH_DEFAULT_BRAND)
          setLoading(false)
        }
        return
      }

      setLoading(true)
      try {
        const { data: companyRows } = await db
          .from('companies')
          .select('id, name, legal_name, is_default, active, currency')
          .eq('active', true)
          .order('is_default', { ascending: false })
          .order('name')

        const list = (companyRows || []) as TenantCompany[]
        const fallback = list.length > 0 ? list : [FALLBACK_COMPANY]
        if (cancelled) return
        setCompanies(fallback)

        const stored = readStoredCompany()
        const pick =
          (stored && fallback.find((c) => c.id === stored)?.id) ||
          fallback.find((c) => c.is_default)?.id ||
          fallback[0]?.id ||
          null
        setActiveCompanyIdState(pick)
      } catch {
        if (!cancelled) {
          setCompanies([FALLBACK_COMPANY])
          setActiveCompanyIdState(REDREACH_COMPANY_ID)
          setBusinessUnits([])
          setKitCache([REDREACH_DEFAULT_BRAND])
          setBrandKitState(REDREACH_DEFAULT_BRAND)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [user, hasAccess, tenantId])

  // When company changes: load BUs + kits and resolve chrome kit
  useEffect(() => {
    let cancelled = false

    async function loadCompanyScope() {
      if (!activeCompanyId) return

      if (isLocalMode || !user || !hasAccess) {
        setBusinessUnits([])
        setActiveBusinessUnitIdState(null)
        setKitCache([REDREACH_DEFAULT_BRAND])
        applyResolved([REDREACH_DEFAULT_BRAND], activeCompanyId, null)
        return
      }

      try {
        const [units, companyKits, tenantKitResult] = await Promise.all([
          listCompanyBusinessUnits(activeCompanyId),
          listBrandKitsForCompany(activeCompanyId),
          db
            .from('brand_kits')
            .select(BRAND_KIT_COLUMNS)
            .is('company_id', null)
            .is('business_unit_id', null)
            .limit(1),
        ])
        if (cancelled) return

        setBusinessUnits(units)

        const storedBu = readStoredBu()
        const buPick = storedBu && units.some((u) => u.id === storedBu) ? storedBu : null
        setActiveBusinessUnitIdState(buPick)

        const tenantKits = ((tenantKitResult.data || []) as BrandKit[]).map((row) => coerceBrandKit(row))
        const merged = [...tenantKits, ...companyKits]
        setKitCache(merged.length ? merged : [REDREACH_DEFAULT_BRAND])
        applyResolved(merged, activeCompanyId, buPick)
      } catch {
        if (!cancelled) {
          setBusinessUnits([])
          setActiveBusinessUnitIdState(null)
          setKitCache([REDREACH_DEFAULT_BRAND])
          applyResolved([REDREACH_DEFAULT_BRAND], activeCompanyId, null)
        }
      }
    }

    void loadCompanyScope()
    return () => {
      cancelled = true
    }
  }, [activeCompanyId, user, hasAccess, isLocalMode, applyResolved])

  // When BU selection changes (same company), re-resolve without refetch
  useEffect(() => {
    if (!activeCompanyId) return
    applyResolved(kitCache, activeCompanyId, activeBusinessUnitId)
  }, [activeBusinessUnitId, activeCompanyId, kitCache, applyResolved])

  useEffect(() => {
    applyBrandCssVars(brandKit)
  }, [brandKit])

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) || companies[0] || null,
    [companies, activeCompanyId],
  )

  // Spec §5.6: after sign-in, the installable web app carries the company's name/colours.
  useEffect(() => {
    if (!user || !hasAccess) return
    const identity = identityFromBrandKit({
      tenantId: tenantId || REDREACH_TENANT_ID,
      companyId: activeCompany?.id ?? null,
      companyName: activeCompany?.name || activeCompany?.legal_name || null,
      kit: brandKit,
    })
    applyTenantWebManifest(identity)
  }, [user, hasAccess, tenantId, brandKit, activeCompany])

  const activeBusinessUnit = useMemo(
    () => businessUnits.find((u) => u.id === activeBusinessUnitId) || null,
    [businessUnits, activeBusinessUnitId],
  )

  const value = useMemo(
    () => ({
      tenantId,
      companies,
      activeCompanyId: activeCompany?.id ?? null,
      activeCompany,
      setActiveCompanyId,
      businessUnits,
      activeBusinessUnitId,
      activeBusinessUnit,
      setActiveBusinessUnitId,
      brandKit,
      setBrandKit,
      loading,
    }),
    [
      tenantId,
      companies,
      activeCompany,
      setActiveCompanyId,
      businessUnits,
      activeBusinessUnitId,
      activeBusinessUnit,
      setActiveBusinessUnitId,
      brandKit,
      setBrandKit,
      loading,
    ],
  )

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant() {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant must be used within a TenantProvider')
  return ctx
}
