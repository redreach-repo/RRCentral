# RED REACH Central

CRM + quotations + invoices for **Red Reach Middle East FZE**.

## Architecture

| Layer | Hosts | Role |
|-------|--------|------|
| **Frontend** | **GitHub Pages** (`web/`) | UI your team opens in the browser |
| **Backend** | Google Apps Script (`appscript/`) | Sheets, Calendar, auth, PDFs |
| **Data** | Google Sheet | Source of truth |

Company email `info@redreach.ae` (Zoho) is only printed on documents. Team login uses **Gmail**.

## Live Apps Script API

Deployment ID: `AKfycbzpBkL38S4dXfUk90yLg3uiKRCWi7Sey5TbnOfyi8ERbApKUeHEU1HPxYjSXvVdz1t0ig`

```
https://script.google.com/macros/s/AKfycbzpBkL38S4dXfUk90yLg3uiKRCWi7Sey5TbnOfyi8ERbApKUeHEU1HPxYjSXvVdz1t0ig/exec
```

## GitHub Pages setup

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → GitHub Actions** (workflow already in `.github/workflows/pages.yml`).
3. Edit `web/config.js`:
   - `scriptUrl` — Apps Script `/exec` URL above
   - `apiToken` — must match Apps Script **App Settings → apiToken** (default `rr-central-2026-change-me`)
4. After Pages deploys, open `https://<user>.github.io/<repo>/`
5. Optional: point `crm.redreach.ae` CNAME to GitHub Pages.

## Apps Script deploy (backend)

```bash
cd appscript
npm i
npx clasp push --force
npx clasp deploy -i AKfycbzpBkL38S4dXfUk90yLg3uiKRCWi7Sey5TbnOfyi8ERbApKUeHEU1HPxYjSXvVdz1t0ig -d "message"
```

See [`appscript/README.md`](./appscript/README.md).

## Local preview of the web UI

```bash
cd web
python3 -m http.server 8080
# open http://localhost:8080
```

## Admins

- `alfredsv@gmail.com`
- `redreachdxb@gmail.com`
