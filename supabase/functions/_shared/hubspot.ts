// HubSpot for RR Central: what each RR Central row looks like in HubSpot, and
// a small client for the HubSpot CRM API. Used by the hubspot-sync function.
// One way only: RR Central is the master, HubSpot mirrors it.
//
// Auth is a HubSpot private app token (HUBSPOT_ACCESS_TOKEN), scopes:
// crm.objects.companies.read/write, crm.objects.contacts.read/write,
// crm.objects.deals.read/write.

export const HUBSPOT_API = "https://api.hubapi.com"

/** The dirham is pegged to the US dollar. HubSpot's company currency is USD. */
export const AED_PER_USD = 3.6725

export type Account = {
  id: string
  type: string
  name: string
  reference: string
  industry: string
  country: string
  city: string
  website: string
  status: string
}

export type AccountContact = {
  id: string
  account_id: string
  name: string
  role: string
  email: string
  phone: string
  whatsapp: string
}

export type SalesDeal = {
  id: string
  account_id: string
  stage: string
  monthly_fee: number | string
  setup_fee: number | string
  discount_percent: number | string
  discount_months: number | string
  quote_reference: string
  next_action: string
  next_action_date: string | null
  signed_at: string | null
  updated_at: string
}

export type Props = Record<string, string>

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  ai_crm_client: "AI CRM client",
  worship_church: "WorshipHub church",
  ctrm_prospect: "CTRM Next",
}

/** HubSpot's default Sales Pipeline stages. */
export const DEAL_STAGE: Record<string, string> = {
  lead: "appointmentscheduled",
  discovery_call: "qualifiedtobuy",
  quote_sent: "contractsent",
  signed: "closedwon",
  lost: "closedlost",
}

const clean = (v: unknown) => String(v ?? "").trim()
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** The bare domain of a website ("https://www.acme.ae/about" -> "acme.ae"), or "". */
export function websiteDomain(website: string): string {
  let raw = clean(website).toLowerCase()
  if (!raw) return ""
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(raw)) raw = `https://${raw}`
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "").replace(/\.$/, "")
    return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(host) ? host : ""
  } catch {
    return ""
  }
}

/** "Sara Al Mansoori" -> first "Sara", last "Al Mansoori". */
export function splitName(name: string): { firstname: string; lastname: string } {
  const parts = clean(name).split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstname: "", lastname: "" }
  return { firstname: parts[0], lastname: parts.slice(1).join(" ") }
}

export function normalEmail(email: string): string {
  const e = clean(email).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ""
}

export function companyProps(a: Account): Props {
  const domain = websiteDomain(a.website)
  const kind = ACCOUNT_TYPE_LABEL[a.type] || a.type
  const about = [`RR Central: ${kind}`, a.reference, a.status && `status ${a.status}`, a.industry]
    .map(clean)
    .filter(Boolean)
    .join(" · ")
  const props: Props = { name: clean(a.name) || "Unnamed account", description: about }
  if (domain) props.domain = domain
  if (clean(a.website)) props.website = clean(a.website)
  if (clean(a.city)) props.city = clean(a.city)
  if (clean(a.country)) props.country = clean(a.country)
  return props
}

export function contactProps(c: AccountContact, accountName: string): Props {
  const props: Props = { ...splitName(c.name) }
  const email = normalEmail(c.email)
  if (email) props.email = email
  if (clean(c.phone)) props.phone = clean(c.phone)
  if (clean(c.whatsapp)) props.mobilephone = clean(c.whatsapp)
  if (clean(c.role)) props.jobtitle = clean(c.role)
  if (clean(accountName)) props.company = clean(accountName)
  // HubSpot needs at least one of these.
  if (!props.firstname && !props.lastname && !props.email) props.firstname = "Contact"
  return props
}

/** First year value in AED excluding VAT. Same rule as quoteFirstYear in app/src/lib/salesPipeline.ts. */
export function dealFirstYearAed(d: Pick<SalesDeal, "monthly_fee" | "setup_fee" | "discount_percent" | "discount_months">): number {
  const monthly = Number(d.monthly_fee) || 0
  const discounted = Math.min(12, Math.max(0, Math.round(Number(d.discount_months) || 0)))
  const share = Math.min(100, Math.max(0, Number(d.discount_percent) || 0)) / 100
  return round2((Number(d.setup_fee) || 0) + monthly * 12 - monthly * share * discounted)
}

/** Midnight UTC of a date or timestamp, as HubSpot wants for date-time properties. */
function hubspotDate(value: string | null | undefined): string {
  const v = clean(value)
  if (!v) return ""
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v)
  if (Number.isNaN(d.getTime())) return ""
  return `${d.toISOString().slice(0, 10)}T00:00:00.000Z`
}

export function dealProps(d: SalesDeal, accountName: string): Props {
  const aed = dealFirstYearAed(d)
  const closed = d.stage === "signed" ? d.signed_at || d.updated_at : d.stage === "lost" ? d.updated_at : d.next_action_date
  const about = [
    "RR Central AI CRM deal",
    aed ? `first year AED ${aed.toFixed(2)} excl. VAT` : "",
    clean(d.quote_reference) && `quote ${clean(d.quote_reference)}`,
    !["signed", "lost"].includes(d.stage) && clean(d.next_action) ? `next: ${clean(d.next_action)}` : "",
  ]
    .filter(Boolean)
    .join(" · ")
  const props: Props = {
    dealname: `${clean(accountName) || "Account"} – AI CRM`,
    pipeline: "default",
    dealstage: DEAL_STAGE[d.stage] || DEAL_STAGE.lead,
    amount: aed ? String(round2(aed / AED_PER_USD)) : "",
    description: about,
  }
  const close = hubspotDate(closed)
  if (close) props.closedate = close
  return props
}

/** Fingerprint of what we send, so a row that did not change is not sent again. */
export async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const hash = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("")
}

export class HubSpotError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

type Fetch = typeof fetch

/** A thin HubSpot client that waits out rate limits (429) and keeps under 10 calls a second. */
export function hubspotClient(token: string, doFetch: Fetch = fetch, pauseMs = 110) {
  let last = 0
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const wait = last + pauseMs - Date.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      last = Date.now()
      const res = await doFetch(`${HUBSPOT_API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      })
      if (res.status === 429 && attempt < 3) {
        await res.body?.cancel()
        const after = Math.min(10, Number(res.headers.get("Retry-After") ?? 2) || 0)
        await new Promise((r) => setTimeout(r, after * 1000))
        continue
      }
      const text = await res.text()
      if (!res.ok) {
        let message = text.slice(0, 300)
        try {
          message = String((JSON.parse(text) as { message?: string }).message || message)
        } catch {
          // keep the raw text
        }
        throw new HubSpotError(res.status, `HubSpot ${res.status}: ${message}`)
      }
      return (text ? JSON.parse(text) : {}) as T
    }
  }

  return {
    async create(type: string, properties: Props): Promise<string> {
      const out = await call<{ id: string }>("POST", `/crm/v3/objects/${type}`, { properties })
      return String(out.id)
    },
    async update(type: string, id: string, properties: Props): Promise<void> {
      await call("PATCH", `/crm/v3/objects/${type}/${encodeURIComponent(id)}`, { properties })
    },
    /** Contacts by email: creates or updates, returns the HubSpot id. */
    async upsertContactByEmail(properties: Props): Promise<string> {
      const out = await call<{ results: { id: string }[] }>("POST", "/crm/v3/objects/contacts/batch/upsert", {
        inputs: [{ idProperty: "email", id: properties.email, properties }],
      })
      const id = out.results?.[0]?.id
      if (!id) throw new HubSpotError(500, "HubSpot gave no contact id")
      return String(id)
    },
    /** HubSpot companies already using these domains: domain -> id. */
    async companiesByDomain(domains: string[]): Promise<Map<string, string>> {
      const found = new Map<string, string>()
      for (let i = 0; i < domains.length; i += 100) {
        const out = await call<{ results: { id: string; properties: { domain?: string } }[] }>(
          "POST",
          "/crm/v3/objects/companies/search",
          {
            filterGroups: [{ filters: [{ propertyName: "domain", operator: "IN", values: domains.slice(i, i + 100) }] }],
            properties: ["domain"],
            limit: 100,
          },
        )
        for (const r of out.results || []) {
          const d = clean(r.properties?.domain).toLowerCase()
          if (d && !found.has(d)) found.set(d, String(r.id))
        }
      }
      return found
    },
    /** Default association (contact or deal to company). Safe to repeat. */
    async associate(fromType: string, fromId: string, toType: string, toId: string): Promise<void> {
      await call(
        "PUT",
        `/crm/v4/objects/${fromType}/${encodeURIComponent(fromId)}/associations/default/${toType}/${encodeURIComponent(toId)}`,
      )
    },
  }
}

export type HubSpotClient = ReturnType<typeof hubspotClient>
