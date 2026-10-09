# Fix bare `redreach-repo.github.io` 404 + optional custom domain

## A. Org redirect (fixes empty github.io root)

Owner one-time (cannot be done from a normal RRCentral PR):

```bash
# from a machine with repo-create rights on the redreach-repo org
gh repo create redreach-repo/redreach-repo.github.io --public --description "Redirect bare github.io to RR Central"
git clone https://github.com/redreach-repo/redreach-repo.github.io.git
cp org-pages/index.html redreach-repo.github.io/
cd redreach-repo.github.io
git add index.html && git commit -m "Redirect bare github.io to RR Central" && git push -u origin main
```

Then: repo → **Settings → Pages** → Source: Deploy from branch → `main` / `/ (root)`.

Wait ~1 minute → https://redreach-repo.github.io/ should redirect to Central login.

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
| Login (Central entry) | https://redreach-repo.github.io/RRCentral/login |
| Dashboard | https://redreach-repo.github.io/RRCentral/app |
| CRM | https://redreach-repo.github.io/RRCentral/crm |
| Public marketing site | https://www.redreach.ae |
