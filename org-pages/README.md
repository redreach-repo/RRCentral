# Fix bare `redreach-repo.github.io` 404 + optional custom domain

## A. Org redirect (fixes empty github.io root)

1. Create a **new public repo** named exactly: `redreach-repo.github.io`
2. Upload this folder’s `index.html` as the repo root (or push this folder’s contents to `main`)
3. Repo → **Settings → Pages** → Source: Deploy from branch → `main` / `/ (root)`
4. Wait ~1 minute → open https://redreach-repo.github.io/ — it should redirect to Central

## B. Custom domain `crm.redreach.ae` (optional)

### DNS (Hostinger or your DNS host)
Add a **CNAME** record:

| Type | Name | Target |
|------|------|--------|
| CNAME | `crm` | `redreach-repo.github.io` |

### GitHub (RRCentral project Pages)
1. https://github.com/redreach-repo/RRCentral/settings/pages  
2. **Custom domain:** `crm.redreach.ae` → Save  
3. Wait for DNS check → enable **Enforce HTTPS**

### App base path
Today the app is built with base `/RRCentral/`. After a custom domain points at the **same** Pages site, URLs become:

`https://crm.redreach.ae/RRCentral/login`

To serve at domain root (`https://crm.redreach.ae/login`) you must change Vite `base` + React `basename` to `/` and redeploy — ask the team when ready.

## Bookmark URLs (until custom domain)

| What | URL |
|------|-----|
| Central home | https://redreach-repo.github.io/RRCentral/ |
| Login | https://redreach-repo.github.io/RRCentral/login |
| Dashboard | https://redreach-repo.github.io/RRCentral/app |
