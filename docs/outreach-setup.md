# Prospect outreach: email setup checklist (Phase 0)

For Alfred, before the first outreach email goes out from **alfred@redreach.ae**
(Zoho Mail, main domain **redreach.ae**). Tick each box in order. Nothing here
is done by the app; these are settings in Zoho Mail and in the DNS for redreach.ae.

What we saw in DNS on 28 Nov 2026:

| Record | Now | Target |
|---|---|---|
| SPF (TXT on `redreach.ae`) | `v=spf1 include:zohomail.com ~all` | keep (fine) |
| DKIM | none found at the `zoho` or `zmail` selectors | a Zoho DKIM key, verified |
| DMARC (TXT on `_dmarc.redreach.ae`) | `p=none`, no `rua` | `p=none` with `rua` first, then `p=quarantine` |

Why it matters: Gmail and Outlook now expect SPF, DKIM and DMARC from anyone
emailing their users. Without DKIM, cold emails are far more likely to land in
spam, and `p=none` without `rua` means nobody sees the reports.

---

## 1. Turn on DKIM in Zoho for redreach.ae

- [ ] Sign in to the Zoho Mail **Admin Console** (mailadmin.zoho.com, or the Zoho region your account uses) as a Zoho admin.
- [ ] Go to **Domains**, pick **redreach.ae**, then **Email Configuration**, then **DKIM**.
- [ ] Press **Add** to make a new selector. Use the name `zmail` (any short word works; it only has to match DNS). Zoho shows a **TXT record name** like `zmail._domainkey.redreach.ae` and a long **TXT value** that starts `v=DKIM1; k=rsa; p=...`.
- [ ] In the DNS for redreach.ae (wherever the domain's DNS is managed), add a **TXT** record:
  - Name / host: `zmail._domainkey` (some DNS panels want the full `zmail._domainkey.redreach.ae`)
  - Value: paste Zoho's value exactly, in one piece
  - TTL: the default (or 1 hour)
- [ ] Wait 15 to 60 minutes, go back to Zoho's DKIM page and press **Verify**. When it shows **Verified**, press **Set as default** (or switch it **On**) so Zoho signs every email from redreach.ae.
- [ ] Check it: send an email from alfred@redreach.ae to a Gmail address, open it in Gmail, **Show original**. You want `SPF: PASS`, `DKIM: PASS` with domain `redreach.ae`, and `DMARC: PASS`.

If Zoho will not verify: the most common causes are the DNS panel adding
`.redreach.ae` twice (`zmail._domainkey.redreach.ae.redreach.ae`), or the long
value being split or cut. Look the record up with any online "DKIM lookup"
tool using selector `zmail`.

## 2. Add a DMARC report mailbox (rua)

- [ ] Pick a mailbox for the daily reports, e.g. **dmarc@redreach.ae** (a Zoho alias or group to Alfred is fine). A free DMARC report service mailbox also works and gives readable charts.
- [ ] Change the **TXT** record on `_dmarc.redreach.ae` to:

  ```
  v=DMARC1; p=none; rua=mailto:dmarc@redreach.ae; fo=1; adkim=r; aspf=r
  ```

- [ ] After a few days, the reports show which services send as redreach.ae. Every real sender (Zoho, and anything else such as the website, invoicing or newsletters) must pass SPF or DKIM before the next step.

## 3. Move DMARC to quarantine after 2 to 4 weeks

Only when the reports have been clean for at least two weeks (every real sender passing):

- [ ] Change `_dmarc.redreach.ae` to:

  ```
  v=DMARC1; p=quarantine; pct=25; rua=mailto:dmarc@redreach.ae; fo=1; adkim=r; aspf=r
  ```

- [ ] After another week with no surprises, raise `pct=25` to `pct=100`.
- [ ] Optional, later: once quarantine has been calm for a month, consider `p=reject`. Not needed for outreach.

## 4. Warm-up plan (the app's daily cap enforces it)

The daily cap is in **Sales > Prospect outreach > Settings** (default 10). The
app refuses the next send once the cap is reached for the day (Dubai time).

| When | Cap to set | Notes |
|---|---|---|
| Week 1 | **10 a day** | Only the best-fit prospects, named people, no info@ addresses. |
| Week 2 onwards | **20 to 25 a day** | Only if week 1 had no bounces above 2 to 3%, no spam complaints, and some replies. |
| Any week | back to 10 | If bounces rise, replies drop to zero, or Zoho warns about sending. |

Good habits that protect the mailbox:

- [ ] Keep sending by hand from the app, one at a time, spread through the day rather than in one burst.
- [ ] Keep the emails short and plain: no images, no attachments, at most one link (the app adds only the unsubscribe link).
- [ ] Reply to replies quickly; replies are the best signal to Gmail and Outlook that the mail is wanted.
- [ ] Add anyone who asks not to be contacted to **Never email** in Outreach settings (the unsubscribe link does this on its own).

## 5. Zoho sending limits

From Zoho's published "Zoho Mail limits and policies" page (checked 28 Nov 2026):

- Emails to **outside** addresses: a **dynamic limit of 50 to 500 emails an hour**, based on sender reputation, recipient engagement and contact quality. A new or cold-emailing mailbox can sit near the low end.
- Emails **inside** the organisation: 1,000 an hour.
- Recipients per email: **150** on paid plans (100 on free), counting To, Cc and Bcc. The app sends each outreach email to exactly **one** person.
- When a limit is hit, Zoho blocks sending from that mailbox for **up to an hour**. Zoho's page does not list a fixed daily number per plan.
- Free accounts have lower limits than paid ones.

What this means for us: 10 to 25 outreach emails a day is far below every
Zoho limit, so the limit that matters is **reputation**, not Zoho's cap. The
app also stops any one person at 20 sends in 10 minutes.

- [ ] Check which Zoho plan redreach.ae is on (Admin Console, **Subscription**). If it is the free plan, upgrade before outreach starts.
- [ ] Ask Zoho support (support@zohomail.com) if you need a written daily limit for your plan.

## 6. Before the first send (in RR Central)

- [ ] SQL: run `supabase-sql/outreach-pipeline.sql` on the SQL copy page (same as migration `20261338090000_outreach_pipeline.sql`).
- [ ] Deploy **mail-inbox** and **outreach-unsubscribe**: Actions, **Deploy Edge Functions**, pick each one.
- [ ] Open **Mail** and make sure alfred@redreach.ae is connected with **sending** allowed.
- [ ] Open **Sales > Prospect outreach > Settings**: set the legal name (Red Reach Middle East FZE), the real postal address (from the trade licence; the app never makes one up), check the opt-out line, and check your signature.
- [ ] Load the CompMan and CTRM Next company lists (CSV) so those companies are skipped on import.
- [ ] Send the first email to your own Gmail address first and check SPF, DKIM, DMARC and the unsubscribe link.
