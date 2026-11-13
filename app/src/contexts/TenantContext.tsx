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
  REDREACH_DEFAULT_BRAND,
  type BrandKit,
} from '../lib/brandKit'
import { REDREACH_COMPANY_ID, REDREACH_TENANT_ID } from '../modules/registry'

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
  brandKit: BrandKit
  loading: boolean
}

const TenantContext = createContext<TenantValue | undefined>(undefined)

const COMPANY_KEY = 'rrcentral_active_company'

function readStoredCompany(): string | null {
  try {
    return localStorage.getItem(COMPANY_KEY)
  } catch {
    return null
  }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, hasAccess, tenantId: authTenantId, isLocalMode } = useAuth()
  const [companies, setCompanies] = useState<TenantCompany[]>([])
  const [brandKit, setBrandKit] = useState<BrandKit>(REDREACH_DEFAULT_BRAND)
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const tenantId = authTenantId || (isLocalMode ? REDREACH_TENANT_ID : null)

  const setActiveCompanyId = useCallback((id: string) => {
    setActiveCompanyIdState(id)
    try {
      localStorage.setItem(COMPANY_KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!user || !hasAccess) {
        if (!cancelled) {
          setCompanies([
            {
              id: REDREACH_COMPANY_ID,
              name: 'Red Reach Middle East FZE',
              legal_name: 'Red Reach Middle East FZE',
              is_default: true,
              active: true,
              currency: 'AED',
            },
          ])
          setActiveCompanyIdState(REDREACH_COMPANY_ID)
          setBrandKit(REDREACH_DEFAULT_BRAND)
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
        const fallback: TenantCompany[] =
          list.length > 0
            ? list
            : [
                {
                  id: REDREACH_COMPANY_ID,
                  name: 'Red Reach Middle East FZE',
                  legal_name: 'Red Reach Middle East FZE',
                  is_default: true,
                  active: true,
                  currency: 'AED',
                },
              ]

        if (cancelled) return
        setCompanies(fallback)

        const stored = readStoredCompany()
        const pick =
          (stored && fallback.find((c) => c.id === stored)?.id) ||
          fallback.find((c) => c.is_default)?.id ||
          fallback[0]?.id ||
          null
        setActiveCompanyIdState(pick)

        const { data: kitRows } = await db
          .from('brand_kits')
          .select(
            'id, tenant_id, company_id, business_unit_id, primary_color, accent_color, neutral_dark, neutral_light, logo_horizontal_path, logo_light_path, mark_square_path, legal_footer',
          )
          .is('business_unit_id', null)
          .order('company_id', { ascending: true, nullsFirst: false })

        const kits = (kitRows || []) as BrandKit[]
        const companyKit = kits.find((k) => k.company_id === pick)
        const tenantKit = kits.find((k) => k.company_id == null)
        setBrandKit(companyKit || tenantKit || REDREACH_DEFAULT_BRAND)
      } catch {
        if (!cancelled) {
          setCompanies([
            {
              id: REDREACH_COMPANY_ID,
              name: 'Red Reach Middle East FZE',
              legal_name: 'Red Reach Middle East FZE',
              is_default: true,
              active: true,
              currency: 'AED',
            },
          ])
          setActiveCompanyIdState(REDREACH_COMPANY_ID)
          setBrandKit(REDREACH_DEFAULT_BRAND)
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

  useEffect(() => {
    applyBrandCssVars(brandKit)
  }, [brandKit])

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) || companies[0] || null,
    [companies, activeCompanyId],
  )

  const value = useMemo(
    () => ({
      tenantId,
      companies,
      activeCompanyId: activeCompany?.id ?? null,
      activeCompany,
      setActiveCompanyId,
      brandKit,
      loading,
    }),
    [tenantId, companies, activeCompany, setActiveCompanyId, brandKit, loading],
  )

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant() {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant must be used within a TenantProvider')
  return ctx
}
