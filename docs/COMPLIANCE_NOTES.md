# Compliance notes

Findings from official sources go here **before** shipping tax, payroll, e-sign, e-invoice, or Google restricted-scope features (Master Spec §0 rule 8).

| Topic | Status | Source checked | Date | Notes |
|-------|--------|----------------|------|-------|
| UAE electronic signatures / trust services | **concluded** | See § E-sign below | 13 Nov 2026 | Decree-Law 46/2021 + Cabinet Res. 28/2023. Today’s `/sign` canvas is **not** AdES/QES. Keep as operational evidence; QES only via TDRA-licensed QTSP (ask before paid vendor). |
| UAE WPS SIF format | not started | — | — | Required before M8 bank file |
| UAE end-of-service gratuity | not started | — | — | Required before M8 formula |
| UAE VAT rates / return layout | not started | — | — | Partial product VAT today; verify before M7 return |
| UAE corporate tax | not started | — | — | M7+ |
| UAE e-invoicing timeline / format | not started | — | — | Design invoice model for accredited provider |
| Google restricted Gmail scopes assessment | **concluded** | See § Gmail below | 13 Nov 2026 | Phase A **implemented** (`gmail.send` + `calendar.events` via `gmail-calendar` Edge Function). Phase B inbox (`gmail.readonly`) still blocked until restricted verification + CASA plan. |
| Microsoft 365 Graph mail/calendar assessment | **concluded** | See § M365 below | 13 Nov 2026 | Phase A+B **implemented** (`Mail.Send` + `Mail.Read` + `Calendars.ReadWrite` via `m365-mail-calendar`). Prefer delegated over application permissions. |
| IMAP / other mail hosts assessment | **concluded** | See § IMAP below | 13 Nov 2026 | Prefer Gmail API / Microsoft Graph over IMAP. Gmail IMAP needs restricted `mail.google.com`; M365 IMAP basic auth is dead. Generic IMAP deferred until a real non-Gmail/M365 customer need. |
| Data residency (UAE hosting options) | not started | — | — | Decide before first external customer / M13 |

Do not rely on model memory for legal or tax rules.

---

## Gmail / Google Calendar (M4) — assessment

**Purpose:** Decide which Google scopes RR Central may request for a future Gmail mail/calendar adapter, and what verification is required before shipping.

### Official sources (checked 13 Nov 2026, Asia/Dubai)

1. [Choose Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) — classifies `gmail.send` as **sensitive**; `gmail.readonly`, `gmail.compose`, `gmail.modify`, `gmail.metadata`, full `mail.google.com`, etc. as **restricted**. Restricted scopes that store/transmit data on servers require a **security assessment**.
2. [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) — restricted scopes need OAuth verification; server-side access to restricted data needs annual third-party security assessment (CASA / App Defense Alliance). Exceptions include personal use, Testing publishing status, internal Workspace apps, etc.
3. [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) — sensitive scopes need verification for production consumer access (Calendar event access cited as a sensitive example).
4. [Google Workspace user data and developer policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy) — approved Gmail use cases include CRM / productivity enhancers; disallows several non-CRM patterns (e.g. one-time email export tools, spam).
5. [Choose Google Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth) — Calendar scope list; core event scopes are treated as **sensitive** (not on Google’s restricted Gmail/Drive-style list).

### Scope matrix for RR Central (parity with today’s Zoho features)

| Feature today (Zoho) | Candidate Google scope | Classification | Verification bar |
|----------------------|------------------------|----------------|------------------|
| Send mail from CRM | `https://www.googleapis.com/auth/gmail.send` | Sensitive | Brand + sensitive OAuth verification (no CASA for this scope alone) |
| Inbox / Sent dashboard match | `https://www.googleapis.com/auth/gmail.readonly` | **Restricted** | Restricted verification; **CASA** if messages are stored or transmitted via our servers (likely with Supabase / edge proxy) |
| Compose drafts + send | `gmail.compose` | Restricted | Avoid — prefer `gmail.send` for send-only |
| Follow-up / team meetings | `https://www.googleapis.com/auth/calendar.events` (or `.owned`) | Sensitive | Sensitive verification |
| Calendar list / read board | `calendar.events.readonly` / `calendar.readonly` | Sensitive | Sensitive verification |

### Use-case fit

Workspace policy lists CRM / productivity enhancers as an **approved** Gmail scope use case. RR Central’s compose + follow-up calendar sync fits; bulk spam / one-shot mailbox export do **not**.

### Decision (binding for M4)

1. **Phase A (shipped in M4 slice 5):** Gmail **send** + Google Calendar via `gmail-calendar` Edge Function and `gmail_connection`. Scopes: `gmail.send` + `calendar.events` only. Production still needs Google sensitive-scope verification (or Testing / Internal while prototyping). **Do not** request `gmail.readonly` in Phase A.
2. **Phase B (later):** Inbox / Sent matching via `gmail.readonly` only after restricted-scope verification **and** a plan for CASA if any restricted Gmail data is stored or proxied through our backend. Until then keep inbox on Zoho (or omit).
3. **Least privilege:** Never request `https://mail.google.com/` or `gmail.modify` unless a documented need appears; prefer `gmail.send` over `gmail.compose` for send-only.
4. **Settings switcher:** Gmail is selectable; Connect card must succeed before APIs work.

### Explicit non-claims

- This note does **not** assert that RR Central is already verified, CASA-assessed, or cleared for public consumer Gmail access beyond Testing/Internal exceptions.

---

## Microsoft 365 / Graph mail & calendar (M4) — assessment

**Purpose:** Decide which Microsoft Graph permissions RR Central may request for an M365 mail/calendar adapter, and what consent / verification gates apply before shipping.

### Official sources (checked 13 Nov 2026, Asia/Dubai)

1. [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference) — `Mail.Send` (delegated: send as signed-in user; AdminConsentRequired **No** by default), `Mail.Read` (delegated: read signed-in mailbox; AdminConsentRequired **No** by default), `Calendars.ReadWrite` (delegated: full access to user calendars; AdminConsentRequired **No** by default). Application (daemon) variants of these permissions require **admin consent**.
2. [Scopes and permissions in the Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc) — some Graph permissions are admin-restricted; org users may be unable to consent even when the permission table says “No,” depending on tenant policy.
3. [Manage app consent policies](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-app-consent-policies) — Microsoft-managed / tenant consent policies can require admin approval for classified delegated permissions (calendar write is commonly treated as restricted by tenant defaults).
4. [Publisher verification overview](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview) — unverified publishers are marked risky; verification does **not** bypass admin-consent requirements for sensitive scopes.
5. [Developer’s guide to requesting permissions and consent](https://learn.microsoft.com/en-us/entra/identity-platform/consent-types-developer) — request least privilege via `scope`; use admin-consent endpoint when tenants block user consent.

### Scope matrix for RR Central (parity with Zoho / Gmail Phase A)

| Feature | Candidate Graph permission | Type | Notes |
|---------|----------------------------|------|-------|
| Send mail from CRM | `Mail.Send` | Delegated | Least privilege for send; saves to Sent Items without `Mail.ReadWrite` |
| Inbox / Sent dashboard match | `Mail.Read` | Delegated | Broader mailbox read — Phase B |
| Follow-up / team meetings | `Calendars.ReadWrite` | Delegated | Create/update/delete events on user calendars |
| Calendar read-only board | `Calendars.Read` | Delegated | Prefer if write is unnecessary for a read-only view |

Avoid **application** `Mail.Send` / `Mail.Read` / `Calendars.ReadWrite` for the interactive CRM app (admin consent + org-wide blast radius). Use application permissions only if a future daemon job is explicitly designed with mailbox access policies.

### Decision (binding for M4)

1. **Phase A (shipped in M4 slice 7):** Entra app + delegated OAuth via `m365-mail-calendar` Edge Function and `m365_connection`. Scopes: `Mail.Send` + `Calendars.ReadWrite` (+ `openid` / `offline_access` / `User.Read`).
2. **Phase B (shipped in M4 slice 9):** Delegated **`Mail.Read`** for inbox/sent via Graph `mailFolders/inbox|sentitems/messages`. Existing connections must **reconnect** (consent prompt) to pick up `Mail.Read`.
3. **Publisher verification:** Plan Entra publisher verification before asking external tenants to consent; internal/single-tenant Red Reach use can proceed under Testing / admin consent.
4. **Settings switcher:** M365 is selectable; Connect card must succeed before APIs work.
5. **IMAP:** Assessed separately — see § IMAP below (prefer Graph over IMAP for Microsoft mailboxes).

### Explicit non-claims

- This note does **not** assert that an Entra app is publisher-verified or consented in any external customer tenant.

---

## IMAP / other mail hosts (M4) — assessment

**Purpose:** Decide whether RR Central should ship a generic IMAP (+ SMTP) provider after Zoho / Gmail API / Microsoft Graph Phase A, and what auth model would be allowed.

### Official sources (checked 13 Nov 2026, Asia/Dubai)

1. [Transition from less secure apps to OAuth (Google Workspace)](https://knowledge.workspace.google.com/admin/sync/transition-from-less-secure-apps-to-oauth) — password / “less secure app” access to Gmail IMAP/SMTP turned off for Google Accounts (timeline through **14 Mar 2025** / Workspace LSA cutover). New connections must use OAuth (app passwords only in narrow device cases).
2. [Gmail XOAUTH2 for IMAP/POP/SMTP](https://developers.google.com/workspace/gmail/imap/xoauth2-protocol) — IMAP OAuth uses SASL `XOAUTH2`; required scope is **`https://mail.google.com/`**. Google directs apps that do not need full mail scope to **migrate to the Gmail API** with granular scopes instead.
3. [Deprecation of Basic authentication in Exchange Online](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/deprecation-of-basic-authentication-exchange-online) — Basic auth for IMAP/POP (and related protocols) is **disabled in all tenants** and cannot be re-enabled.
4. [Authenticate IMAP/POP/SMTP with OAuth (Exchange Online)](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth) — modern auth uses SASL XOAUTH2 with scopes such as `https://outlook.office.com/IMAP.AccessAsUser.All` and `SMTP.Send`.
5. [RFC 7628 — SASL OAUTHBEARER](https://datatracker.ietf.org/doc/html/rfc7628) — interoperable bearer auth for IMAP/SMTP on non-Google/Microsoft hosts (TLS required in practice).

### Matrix for RR Central

| Host class | Password / app-password IMAP | OAuth IMAP | Prefer instead |
|------------|------------------------------|------------|----------------|
| Gmail / Google Workspace | **Blocked** (LSA off) | Needs restricted `mail.google.com` (+ verification / CASA if proxied) | Existing **Gmail API** Phase A; Phase B `gmail.readonly` only after CASA plan |
| Microsoft 365 / Exchange Online | **Blocked** (basic auth off) | Possible via IMAP OAuth scopes | Existing **Microsoft Graph** Phase A; Phase B `Mail.Read` |
| Other hosts (cPanel, Yahoo, self-hosted, etc.) | Possible but stores secrets; MFA/app-password friction | OAUTHBEARER where the host supports it | Only if a paying workflow cannot use Zoho/Gmail/M365 |

### Decision (binding for M4)

1. **Do not ship an IMAP adapter in the next implementation slice.** Keep Settings **IMAP / other** unavailable.
2. **Prefer APIs over IMAP** for Gmail and Microsoft 365 — Graph/Gmail already cover send + calendar; inbox should come from Phase B API scopes, not IMAP.
3. **Never** request Gmail’s `https://mail.google.com/` solely to speak IMAP when Gmail API scopes suffice (aligns with § Gmail least-privilege).
4. **Generic IMAP** (password or OAUTHBEARER) stays **deferred** until a concrete customer mailbox cannot use Zoho, Gmail, or M365. If that need appears: Edge-held secrets only, TLS required, no browser-stored passwords, and a written threat model before coding.
5. **Next M4 implementation priority after this note:** Gmail/M365 **Phase B inbox** (when compliance gates allow) — not IMAP.

### Explicit non-claims

- This note does **not** assert that RR Central will never support IMAP; it only defers it.
- No IMAP client, connection table, or Edge Function ships in this assessment-only slice.

---

## UAE electronic signatures / trust services (M5) — assessment

**Purpose:** Decide what RR Central may claim for NDA / contract e-sign, and when a TDRA-licensed trust service provider is required before M5 “legal effect” language.

### Official sources (checked 13 Nov 2026, Asia/Dubai)

1. [Federal Decree-Law No. (46) of 2021 on Electronic Transactions and Trust Services](https://uaelegislation.gov.ae/en/legislations/1539) (TDRA English reference PDF) — defines Electronic Signature, Advanced E-Signature (AdES), Qualified E-Signature (QES); TDRA licenses Trust Service Providers (TSP) and Qualified Trust Service Providers (QTSP). **A Qualified E-Signature is deemed equally authentic to a handwritten signature** when Decree-Law conditions are met.
2. [Cabinet Resolution No. (28) of 2023](https://tdra.gov.ae/-/media/About/Trust-Services/Laws-and-Regulations/Cabinet-Resolution-No-28-of-2023-Regarding-the-Executive-Regulation-of-the-Federal-Decree-Law-EN.ashx) — executive regulation: licensing of TSP/QTSP, high-level requirements for (qualified) trust services.
3. [UAE Government overview — Electronic Transactions and Trust Services law](https://u.ae/en/about-the-uae/digital-uae/regulatory-framework/electronic-transactions-and-trust-services-law) — TDRA regulates; ICP issues controls for government-sector trust services.
4. [TDRA Trust Services FAQs](https://tdra.gov.ae/en/About/tdra-sectors/information-and-digital-government/policy-and-programs-department/trust-services/faqs) — licensing process; UAE Trusted List; mutual recognition does **not** by itself allow foreign (Q)TSPs to provide services in the UAE without local authorization / commercial registration.
5. [UAE Trusted List (machine-readable)](https://uri.trustservices.gov.ae/uae-trusted-list/UAE-TL.xml) — official list of licensed (qualified) trust services for validation.

### Levels (simplified for product decisions)

| Level | Rough meaning | Handwritten-equivalent claim? | Who provides it |
|-------|---------------|-------------------------------|-----------------|
| Simple / basic e-signature | Data in electronic form used as a signature (e.g. drawn PNG + identity fields) | **No** automatic QES equivalence | App can capture evidence |
| Advanced E-Signature (AdES) | Linked to signatory, capable of detecting changes, under signatory’s sole control (Decree-Law tests) | Legal effect when conditions met; not the QES “handwritten” presumption | Licensed TSP path |
| Qualified E-Signature (QES) | AdES + qualified certificate + qualified signature device + QTSP validation rules | **Yes** — Decree-Law treats as equal to handwritten when valid | **QTSP** on UAE Trusted List |

### What RR Central does today

- `/sign#…` NDA flow (`legal-sign` Edge Function): client reads PDF, draws a PNG signature, types name/date, records IP/time — sealed PDF + vault (`docs/legal-documents.md`).
- This is **operational evidence of assent**, useful for internal NDA tracking. It is **not** AdES or QES under Decree-Law 46/2021 and must **not** be marketed as a qualified / handwritten-equivalent signature.

### Decision (binding for M5)

1. **Phase A (product, no new paid vendor):** Keep the canvas `/sign` path for NDAs and similar internal docs. UI and docs must describe it as an **electronic signing record / assent capture**, not “qualified”, “AdES”, or “same as handwritten”. Clause library, obligations board, and vault UX may proceed without a QTSP.
2. **Phase B (when a contract type needs QES/AdES legal effect):** Integrate a **TDRA-licensed QTSP** (verify on the UAE Trusted List). Prefer embedding / API of a licensed provider over building TSP/QTSP capabilities in-house. **Ask Alfred before any paid QTSP subscription** (Master Spec §0 paid-services rule).
3. **Do not** register RR Central as a TSP/QTSP in M5 unless explicitly decided later.
4. **Government / high-stakes filings:** Assume QES (or entity-required level) until legal counsel says otherwise; route those through Phase B.
5. **Counsel:** Have Red Reach’s lawyer review NDA template approval process and which document types may stay on Phase A evidence vs require Phase B QTSP — product does not substitute legal advice.

### Explicit non-claims

- This note is **not** legal advice and does **not** certify any RR Central signature as AdES or QES.
- No QTSP integration, new Edge Function, or paid vendor ships in this assessment-only slice.
