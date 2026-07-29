# RED REACH Central

Mobile-first Apps Script CRM + quotations + invoices for **Red Reach Middle East FZE**.

**Live web app:** use your `/exec` deployment URL (currently `@13`).

## What’s included

- Responsive UI for iPhone, iPad, Android, Mac, Windows
- Bottom nav on phones; sidebar on desktop
- Global search (CRM, quotes, invoices, expenses)
- CRM with follow-ups
- Quotations: draft autosave, finalize, revise, duplicate, templates, MOQ warnings
- Invoices: create, duplicate, mark paid, print/PDF
- Division branding + WhatsApp share on printable docs
- Dashboard: month totals, by division, open quotes, unpaid, follow-ups
- Zoho Mail send: not included yet (by request)

## Deploy

```bash
cd appscript
npx clasp push
npx clasp deploy -i YOUR_DEPLOYMENT_ID -d "update"
```

Hard-refresh the web app after deploy.
