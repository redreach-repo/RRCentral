// One HubSpot sync run: accounts -> companies, account contacts -> contacts,
// AI CRM deals -> deals. Rows already sent and unchanged are skipped. Kept
// apart from the function so the rules can be tested with a fake HubSpot.

import {
  type Account,
  type AccountContact,
  companyProps,
  contactProps,
  dealProps,
  fingerprint,
  type HubSpotClient,
  HubSpotError,
  normalEmail,
  type SalesDeal,
  websiteDomain,
} from "./hubspot.ts"

export type HubSpotLink = {
  rr_table: "accounts" | "account_contacts" | "sales_deals"
  rr_id: string
  hubspot_type: "companies" | "contacts" | "deals"
  hubspot_id: string
  synced_hash: string
}

export type SyncCounts = {
  companies_created: number
  companies_updated: number
  contacts_created: number
  contacts_updated: number
  deals_created: number
  deals_updated: number
  failed: number
}

export type SyncResult = SyncCounts & { more_to_do: boolean; errors: string[] }

export type SyncInput = {
  accounts: Account[]
  contacts: AccountContact[]
  deals: SalesDeal[]
  links: HubSpotLink[]
}

export type SyncOptions = {
  /** Stop starting new rows after this time (ms since epoch); the next run carries on. */
  deadline: number
  /** Called as soon as a row is in HubSpot, so a crash never loses a link. */
  saveLink: (link: HubSpotLink) => Promise<void>
  now?: () => number
}

const notFound = (e: unknown) => e instanceof HubSpotError && e.status === 404

export async function syncToHubSpot(hs: HubSpotClient, input: SyncInput, opts: SyncOptions): Promise<SyncResult> {
  const now = opts.now ?? Date.now
  const result: SyncResult = {
    companies_created: 0,
    companies_updated: 0,
    contacts_created: 0,
    contacts_updated: 0,
    deals_created: 0,
    deals_updated: 0,
    failed: 0,
    more_to_do: false,
    errors: [],
  }
  const links = new Map(input.links.map((l) => [`${l.rr_table}:${l.rr_id}`, l]))
  const linkOf = (table: HubSpotLink["rr_table"], id: string) => links.get(`${table}:${id}`)
  const keep = async (link: HubSpotLink) => {
    links.set(`${link.rr_table}:${link.rr_id}`, link)
    await opts.saveLink(link)
  }
  const fail = (what: string, e: unknown) => {
    result.failed++
    if (result.errors.length < 20) result.errors.push(`${what}: ${String((e as Error)?.message || e).slice(0, 200)}`)
  }
  const outOfTime = () => {
    if (now() < opts.deadline) return false
    result.more_to_do = true
    return true
  }

  /** Update the linked record, or make a new one when there is none (or it was deleted in HubSpot). */
  async function send(type: string, linkedId: string | undefined, props: Record<string, string>) {
    if (linkedId) {
      try {
        await hs.update(type, linkedId, props)
        return { id: linkedId, created: false }
      } catch (e) {
        if (!notFound(e)) throw e
      }
    }
    return { id: await hs.create(type, props), created: true }
  }

  // ---- Companies ------------------------------------------------------------
  const accountName = new Map(input.accounts.map((a) => [a.id, a.name]))
  const companyId = new Map<string, string>()
  for (const l of input.links) if (l.rr_table === "accounts") companyId.set(l.rr_id, l.hubspot_id)

  // An account not sent before may already be in HubSpot under its website's domain.
  const newDomains = [...new Set(
    input.accounts.filter((a) => !linkOf("accounts", a.id)).map((a) => websiteDomain(a.website)).filter(Boolean),
  )]
  let byDomain = new Map<string, string>()
  if (newDomains.length) {
    try {
      byDomain = await hs.companiesByDomain(newDomains)
    } catch (e) {
      fail("Looking up companies by website", e)
    }
  }

  for (const a of input.accounts) {
    if (outOfTime()) break
    const props = companyProps(a)
    const hash = await fingerprint(props)
    const link = linkOf("accounts", a.id)
    if (link && link.synced_hash === hash) continue
    try {
      const existing = link?.hubspot_id || byDomain.get(props.domain || "")
      const out = await send("companies", existing, props)
      if (out.created) result.companies_created++
      else result.companies_updated++
      companyId.set(a.id, out.id)
      await keep({ rr_table: "accounts", rr_id: a.id, hubspot_type: "companies", hubspot_id: out.id, synced_hash: hash })
    } catch (e) {
      fail(`Company ${a.name}`, e)
    }
  }

  // ---- Contacts -------------------------------------------------------------
  const contactByEmail = new Map<string, string>()
  for (const c of input.contacts) {
    if (outOfTime()) break
    const props = contactProps(c, accountName.get(c.account_id) || "")
    const company = companyId.get(c.account_id) || ""
    const hash = await fingerprint({ props, company })
    const link = linkOf("account_contacts", c.id)
    if (link && link.synced_hash === hash) {
      if (props.email) contactByEmail.set(props.email, link.hubspot_id)
      continue
    }
    try {
      const email = normalEmail(props.email || "")
      let id: string
      let created: boolean
      if (link) {
        try {
          await hs.update("contacts", link.hubspot_id, props)
          id = link.hubspot_id
          created = false
        } catch (e) {
          if (!notFound(e)) throw e
          id = email ? await hs.upsertContactByEmail(props) : await hs.create("contacts", props)
          created = true
        }
      } else if (email && contactByEmail.has(email)) {
        // The same person on two accounts: one HubSpot contact.
        id = contactByEmail.get(email) as string
        created = false
      } else if (email) {
        id = await hs.upsertContactByEmail(props)
        created = true
      } else {
        id = await hs.create("contacts", props)
        created = true
      }
      if (email) contactByEmail.set(email, id)
      if (company) await hs.associate("contacts", id, "companies", company)
      if (created) result.contacts_created++
      else result.contacts_updated++
      await keep({ rr_table: "account_contacts", rr_id: c.id, hubspot_type: "contacts", hubspot_id: id, synced_hash: hash })
    } catch (e) {
      fail(`Contact ${c.name || c.email || c.id}`, e)
    }
  }

  // ---- Deals ----------------------------------------------------------------
  for (const d of input.deals) {
    if (outOfTime()) break
    const props = dealProps(d, accountName.get(d.account_id) || "")
    const company = companyId.get(d.account_id) || ""
    const hash = await fingerprint({ props, company })
    const link = linkOf("sales_deals", d.id)
    if (link && link.synced_hash === hash) continue
    try {
      const out = await send("deals", link?.hubspot_id, props)
      if (company) await hs.associate("deals", out.id, "companies", company)
      if (out.created) result.deals_created++
      else result.deals_updated++
      await keep({ rr_table: "sales_deals", rr_id: d.id, hubspot_type: "deals", hubspot_id: out.id, synced_hash: hash })
    } catch (e) {
      fail(`Deal ${props.dealname}`, e)
    }
  }

  return result
}
