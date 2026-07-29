# RED REACH Central

CRM + quotations + invoices for **Red Reach Middle East FZE**.

## Apps

| App | Path | Stack |
|-----|------|--------|
| **React app (current)** | [`app/`](./app/) | Vite + React + Supabase → GitHub Pages |
| Legacy UI | [`web/`](./web/) | Static Pages launcher for Apps Script |
| Legacy backend | [`appscript/`](./appscript/) | Google Apps Script + Sheets |

Prefer the React app in `app/` for new work.

## React app quick start

1. Create a Supabase project and run [`app/supabase-schema.sql`](./app/supabase-schema.sql).
2. Enable **Google** auth in Supabase.
3. Copy `app/.env.example` → `app/.env` and set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
4. Local:

```bash
cd app
npm install
npm run dev
```

5. Deploy: push to `main` (workflow builds `app/` and publishes to GitHub Pages). Add the same Vite env vars as GitHub Actions secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

Full setup notes: [`app/README.md`](./app/README.md).

## Legacy Apps Script API

Deployment ID: `AKfycbzpBkL38S4dXfUk90yLg3uiKRCWi7Sey5TbnOfyi8ERbApKUeHEU1HPxYjSXvVdz1t0ig`

```
https://script.google.com/macros/s/AKfycbzpBkL38S4dXfUk90yLg3uiKRCWi7Sey5TbnOfyi8ERbApKUeHEU1HPxYjSXvVdz1t0ig/exec
```

See [`appscript/README.md`](./appscript/README.md) and [`web/README.md`](./web/README.md).

## Admins

- `alfredsv@gmail.com`
- `redreachdxb@gmail.com`
- `alfred@redreach.ae`
- `jacob@redreach.ae`
