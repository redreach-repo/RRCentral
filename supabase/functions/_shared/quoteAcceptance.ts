// Accepting a quote, shared by the quote-accept link and the client portal
// (Wave 4, PR P), so both do exactly the same thing: the quote moves to
// Accepted, the AI CRM deal with this quote to Signed with a DRAFT contract,
// and an open CRM lead for the client to Won. Nothing is invoiced or billed:
// a person finalises. Rules in app/src/lib/quoteAccept.ts (bundled).
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { dealForQuote, draftContractFromAcceptedDeal } from "../quote-accept/quoteAccept.bundle.js"

export type AcceptLink = { id: string }
export type AcceptQuote = {
  id: string
  account_id: string | null
  client: string
  reference_number: string
  base_reference: string
}

/**
 * Claims the link and records the acceptance. Returns false when the link was
 * already accepted or turned off (a second press or a second tab changes nothing).
 */
export async function acceptQuote(
  sb: SupabaseClient,
  input: {
    link: AcceptLink
    quote: AcceptQuote
    name: string
    date: string
    ip: string
    userAgent: string
    /** Who did it, for the logs: "quote-accept" or "client-portal". */
    source: string
    now: Date
  },
): Promise<boolean> {
  const { link, quote, name, date, ip, now, source } = input
  const { data: claimed } = await sb
    .from("quote_accept_links")
    .update({ accepted_at: now.toISOString(), accepted_name: name.slice(0, 200) })
    .eq("id", link.id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select("id")
  if (!claimed || (claimed as unknown[]).length === 0) return false
  const who = `${source} (${name.slice(0, 200)})`
  await sb.from("quotations").update({ status: "Accepted", updated_by: who }).eq("id", quote.id).in("status", ["Finalized", "Sent"])

  // The AI CRM deal with this quote: Signed, with a draft contract.
  let salesDealId: string | null = null
  let dealAccountId: string | null = null
  let contractId: string | null = null
  const refs = [quote.reference_number, quote.base_reference].filter(Boolean)
  if (refs.length) {
    const { data: deals } = await sb
      .from("sales_deals")
      .select("*")
      .in("quote_reference", refs)
      .is("contract_id", null)
    const deal = dealForQuote((deals || []) as never[], quote) as Record<string, unknown> | undefined
    if (deal) {
      const draft = draftContractFromAcceptedDeal(deal as never, name, now)
      const { data: contract, error: cErr } = await sb
        .from("contracts")
        .insert({ ...draft, account_id: deal.account_id })
        .select("id")
        .single()
      if (cErr) throw new Error(`Could not make the draft contract: ${cErr.message}`)
      contractId = (contract as { id: string }).id
      const { data: signed } = await sb
        .from("sales_deals")
        .update({ stage: "signed", contract_id: contractId, signed_at: now.toISOString(), last_touch_at: now.toISOString(), updated_at: now.toISOString() })
        .eq("id", deal.id as string)
        .is("contract_id", null)
        .select("id")
      if (!signed || (signed as unknown[]).length === 0) {
        await sb.from("contracts").delete().eq("id", contractId)
        contractId = null
      } else {
        salesDealId = deal.id as string
        dealAccountId = deal.account_id as string
      }
    }
  }

  // An open CRM lead for the client: Won.
  let crmId = ""
  if (quote.client.trim()) {
    const { data: crm } = await sb
      .from("crm")
      .select("id, pipeline_stage")
      .ilike("company_name", quote.client.trim().replace(/[%_]/g, ""))
      .limit(5)
    const open = ((crm || []) as { id: string; pipeline_stage: string }[]).find((r) => r.pipeline_stage !== "Won" && r.pipeline_stage !== "Lost")
    if (open) {
      crmId = open.id
      await sb
        .from("crm")
        .update({ pipeline_stage: "Won", outcome_reason: `Quote ${quote.reference_number} accepted online by ${name}`.slice(0, 500), quote_ref: quote.reference_number, updated_at: now.toISOString(), updated_by: who })
        .eq("id", open.id)
    }
  }

  await sb.from("quote_acceptances").insert({
    link_id: link.id,
    quotation_id: quote.id,
    accepted_name: name.slice(0, 200),
    accepted_date: date,
    accepted_at: now.toISOString(),
    ip: ip.slice(0, 100),
    user_agent: input.userAgent.slice(0, 500),
    sales_deal_id: salesDealId,
    contract_id: contractId,
    crm_id: crmId,
  })
  const accountId = quote.account_id || dealAccountId
  const where = source === "client-portal" ? "in the client portal" : "online"
  if (accountId) {
    await sb.from("account_activities").insert({
      account_id: accountId,
      kind: "system",
      body: `Quote ${quote.reference_number} accepted ${where} by ${name} on ${date}.${contractId ? " A draft contract was made: check and activate it." : ""} Mark the quote Awarded to invoice it.`,
      user_email: source,
    })
  }
  await sb.from("activity_log").insert({
    action: "quote_accepted",
    entity: "quotation",
    reference: quote.reference_number,
    details: `Accepted ${where} by ${name}`,
    user_email: source,
    ...(crmId ? { crm_id: crmId } : {}),
  })
  return true
}
