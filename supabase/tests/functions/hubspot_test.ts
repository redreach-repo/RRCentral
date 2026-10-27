// HubSpot sync rules (hubspot-sync function), run against a fake HubSpot.
// Run: deno test --allow-env --allow-read --allow-net supabase/tests/functions/
import { assert, assertEquals } from "jsr:@std/assert@1"
import {
  type Account,
  type AccountContact,
  companyProps,
  contactProps,
  dealFirstYearAed,
  dealProps,
  HubSpotError,
  hubspotClient,
  type Props,
  type SalesDeal,
  splitName,
  websiteDomain,
} from "../../functions/_shared/hubspot.ts"
import { type HubSpotLink, syncToHubSpot } from "../../functions/_shared/hubspotSync.ts"

const account = (over: Partial<Account> = {}): Account => ({
  id: "a1",
  type: "ai_crm_client",
  name: "Acme Trading",
  reference: "AC-07-26001",
  industry: "Logistics",
  country: "UAE",
  city: "Dubai",
  website: "https://www.acme.ae/about",
  status: "active",
  ...over,
})

const contact = (over: Partial<AccountContact> = {}): AccountContact => ({
  id: "c1",
  account_id: "a1",
  name: "Sara Al Mansoori",
  role: "Operations",
  email: "Sara@Acme.ae ",
  phone: "+971 4 000 0000",
  whatsapp: "971500000000",
  ...over,
})

const deal = (over: Partial<SalesDeal> = {}): SalesDeal => ({
  id: "d1",
  account_id: "a1",
  stage: "quote_sent",
  monthly_fee: 1000,
  setup_fee: 5000,
  discount_percent: 50,
  discount_months: 2,
  quote_reference: "RR-07-26003",
  next_action: "Chase signature",
  next_action_date: "2026-11-05",
  signed_at: null,
  updated_at: "2026-10-27T08:00:00Z",
  ...over,
})

Deno.test("website becomes a bare domain, nonsense becomes nothing", () => {
  assertEquals(websiteDomain("https://www.acme.ae/about"), "acme.ae")
  assertEquals(websiteDomain("acme.co.uk"), "acme.co.uk")
  assertEquals(websiteDomain("WWW.Acme.AE"), "acme.ae")
  assertEquals(websiteDomain("not a site"), "")
  assertEquals(websiteDomain(""), "")
})

Deno.test("names split into first and last", () => {
  assertEquals(splitName("Sara Al Mansoori"), { firstname: "Sara", lastname: "Al Mansoori" })
  assertEquals(splitName("  Sara "), { firstname: "Sara", lastname: "" })
  assertEquals(splitName(""), { firstname: "", lastname: "" })
})

Deno.test("an account becomes a company with only standard HubSpot fields", () => {
  const p = companyProps(account())
  assertEquals(p.name, "Acme Trading")
  assertEquals(p.domain, "acme.ae")
  assertEquals(p.city, "Dubai")
  assertEquals(p.country, "UAE")
  assert(p.description.includes("AI CRM client") && p.description.includes("AC-07-26001"))
  assertEquals("industry" in p, false, "HubSpot's industry is a fixed list, so free text goes in the description")
  assertEquals("domain" in companyProps(account({ website: "" })), false)
})

Deno.test("a contact keeps a clean email and needs some name", () => {
  const p = contactProps(contact(), "Acme Trading")
  assertEquals(p.email, "sara@acme.ae")
  assertEquals(p.firstname, "Sara")
  assertEquals(p.mobilephone, "971500000000")
  assertEquals(p.jobtitle, "Operations")
  assertEquals(p.company, "Acme Trading")
  const bare = contactProps(contact({ name: "", email: "not-an-email" }), "")
  assertEquals(bare.email, undefined)
  assertEquals(bare.firstname, "Contact")
})

Deno.test("deal value is the first year in AED, sent in US dollars at the peg", () => {
  // 5000 + 12 x 1000 - 1000 x 50% x 2 = 16000
  assertEquals(dealFirstYearAed(deal()), 16000)
  const p = dealProps(deal(), "Acme Trading")
  assertEquals(p.amount, "4356.71")
  assertEquals(p.dealstage, "contractsent")
  assertEquals(p.pipeline, "default")
  assertEquals(p.dealname, "Acme Trading – AI CRM")
  assertEquals(p.closedate, "2026-11-05T00:00:00.000Z")
  assert(p.description.includes("AED 16000.00") && p.description.includes("Chase signature"))
})

Deno.test("deal stages follow HubSpot's default pipeline", () => {
  assertEquals(dealProps(deal({ stage: "lead" }), "A").dealstage, "appointmentscheduled")
  assertEquals(dealProps(deal({ stage: "discovery_call" }), "A").dealstage, "qualifiedtobuy")
  const won = dealProps(deal({ stage: "signed", signed_at: "2026-10-20T10:00:00Z" }), "A")
  assertEquals(won.dealstage, "closedwon")
  assertEquals(won.closedate, "2026-10-20T00:00:00.000Z")
  assertEquals(dealProps(deal({ stage: "lost" }), "A").dealstage, "closedlost")
})

// ---- The sync, against a fake HubSpot ---------------------------------------

function fakeHubSpot(existingDomains: Record<string, string> = {}) {
  const records = new Map<string, { type: string; props: Props }>()
  const calls: string[] = []
  const associations: string[] = []
  let next = 100
  const byEmail = new Map<string, string>()
  return {
    records,
    calls,
    associations,
    client: {
      create: (type: string, props: Props) => {
        calls.push(`create ${type}`)
        const id = String(next++)
        records.set(id, { type, props })
        return Promise.resolve(id)
      },
      update: (type: string, id: string, props: Props) => {
        calls.push(`update ${type} ${id}`)
        if (!records.has(id) && !Object.values(existingDomains).includes(id)) {
          return Promise.reject(new HubSpotError(404, "HubSpot 404: gone"))
        }
        records.set(id, { type, props })
        return Promise.resolve()
      },
      upsertContactByEmail: (props: Props) => {
        calls.push("upsert contacts")
        const id = byEmail.get(props.email) || String(next++)
        byEmail.set(props.email, id)
        records.set(id, { type: "contacts", props })
        return Promise.resolve(id)
      },
      companiesByDomain: (domains: string[]) => {
        calls.push("search companies")
        return Promise.resolve(new Map(domains.filter((d) => existingDomains[d]).map((d) => [d, existingDomains[d]])))
      },
      associate: (from: string, fromId: string, to: string, toId: string) => {
        associations.push(`${from}:${fromId}->${to}:${toId}`)
        return Promise.resolve()
      },
    },
  }
}

async function run(hs: ReturnType<typeof fakeHubSpot>, input: { accounts: Account[]; contacts: AccountContact[]; deals: SalesDeal[] }, links: HubSpotLink[] = [], deadline = Infinity) {
  const saved = new Map(links.map((l) => [`${l.rr_table}:${l.rr_id}`, l]))
  const result = await syncToHubSpot(hs.client as never, { ...input, links }, {
    deadline,
    saveLink: (l) => {
      saved.set(`${l.rr_table}:${l.rr_id}`, l)
      return Promise.resolve()
    },
  })
  return { result, links: [...saved.values()] }
}

Deno.test("first sync makes the company, contact and deal and links them", async () => {
  const hs = fakeHubSpot()
  const { result, links } = await run(hs, { accounts: [account()], contacts: [contact()], deals: [deal()] })
  assertEquals([result.companies_created, result.contacts_created, result.deals_created, result.failed], [1, 1, 1, 0])
  assertEquals(links.length, 3)
  const company = links.find((l) => l.rr_table === "accounts")!.hubspot_id
  assert(hs.associations.some((a) => a.endsWith(`companies:${company}`) && a.startsWith("contacts:")))
  assert(hs.associations.some((a) => a.endsWith(`companies:${company}`) && a.startsWith("deals:")))
})

Deno.test("a second sync with nothing changed sends nothing", async () => {
  const hs = fakeHubSpot()
  const input = { accounts: [account()], contacts: [contact()], deals: [deal()] }
  const first = await run(hs, input)
  hs.calls.length = 0
  const second = await run(hs, input, first.links)
  assertEquals(hs.calls, [])
  assertEquals(second.result.companies_updated + second.result.contacts_updated + second.result.deals_updated, 0)
})

Deno.test("a change updates the same HubSpot record", async () => {
  const hs = fakeHubSpot()
  const first = await run(hs, { accounts: [account()], contacts: [], deals: [deal()] })
  const dealId = first.links.find((l) => l.rr_table === "sales_deals")!.hubspot_id
  const second = await run(hs, { accounts: [account()], contacts: [], deals: [deal({ stage: "signed", signed_at: "2026-10-28T00:00:00Z" })] }, first.links)
  assertEquals(second.result.deals_updated, 1)
  assertEquals(second.result.deals_created, 0)
  assertEquals(hs.records.get(dealId)!.props.dealstage, "closedwon")
})

Deno.test("an existing HubSpot company with the same website is reused, not doubled", async () => {
  const hs = fakeHubSpot({ "acme.ae": "555" })
  const { result, links } = await run(hs, { accounts: [account()], contacts: [], deals: [] })
  assertEquals(result.companies_created, 0)
  assertEquals(result.companies_updated, 1)
  assertEquals(links[0].hubspot_id, "555")
})

Deno.test("a record deleted in HubSpot is made again", async () => {
  const hs = fakeHubSpot()
  const stale: HubSpotLink = { rr_table: "accounts", rr_id: "a1", hubspot_type: "companies", hubspot_id: "999", synced_hash: "old" }
  const { result, links } = await run(hs, { accounts: [account()], contacts: [], deals: [] }, [stale])
  assertEquals(result.companies_created, 1)
  assert(links[0].hubspot_id !== "999")
})

Deno.test("the same email on two accounts is one HubSpot contact", async () => {
  const hs = fakeHubSpot()
  const { result, links } = await run(hs, {
    accounts: [account(), account({ id: "a2", name: "Acme Two", website: "" })],
    contacts: [contact(), contact({ id: "c2", account_id: "a2", email: "sara@acme.ae" })],
    deals: [],
  })
  const ids = links.filter((l) => l.rr_table === "account_contacts").map((l) => l.hubspot_id)
  assertEquals(ids.length, 2)
  assertEquals(ids[0], ids[1])
  assertEquals(result.contacts_created, 1)
  assertEquals(hs.associations.filter((a) => a.startsWith(`contacts:${ids[0]}`)).length, 2)
})

Deno.test("one bad row is reported and the rest still go", async () => {
  const hs = fakeHubSpot()
  const realCreate = hs.client.create
  hs.client.create = (type: string, props: Props) =>
    props.name === "Broken" ? Promise.reject(new HubSpotError(400, "HubSpot 400: bad")) : realCreate(type, props)
  const { result } = await run(hs, { accounts: [account({ id: "a0", name: "Broken", website: "" }), account()], contacts: [], deals: [] })
  assertEquals(result.failed, 1)
  assertEquals(result.companies_created, 1)
  assert(result.errors[0].startsWith("Company Broken"))
})

Deno.test("out of time: stops and says there is more to do", async () => {
  const hs = fakeHubSpot()
  const { result } = await run(hs, { accounts: [account()], contacts: [contact()], deals: [deal()] }, [], 0)
  assertEquals(result.more_to_do, true)
  assertEquals(hs.calls.filter((c) => c.startsWith("create")).length, 0)
})

Deno.test("the client waits out HubSpot's rate limit and sends the token", async () => {
  let n = 0
  const seen: string[] = []
  const fakeFetch = ((url: string, init: RequestInit) => {
    seen.push(`${init.method} ${url} ${(init.headers as Record<string, string>).Authorization}`)
    n++
    if (n === 1) return Promise.resolve(new Response("slow down", { status: 429, headers: { "Retry-After": "0" } }))
    return Promise.resolve(new Response(JSON.stringify({ id: "42" }), { status: 201 }))
  }) as typeof fetch
  const id = await hubspotClient("pat-token", fakeFetch, 0).create("companies", { name: "A" })
  assertEquals(id, "42")
  assertEquals(seen.length, 2)
  assertEquals(seen[0], "POST https://api.hubapi.com/crm/v3/objects/companies Bearer pat-token")
})
