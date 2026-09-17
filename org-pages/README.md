# Fix `redreach-repo.github.io` 404

GitHub Pages for **RRCentral** lives at:

**https://redreach-repo.github.io/RRCentral/**

The bare org URL (`https://redreach-repo.github.io/`) is a *different* site. It stays empty (404) until you publish an **organization Pages** repo.

## One-time setup (2 minutes)

1. Create a new public repo named exactly: **`redreach-repo.github.io`**
2. Upload (or push) the `index.html` from this folder as the repo root
3. Settings → Pages → Source: **Deploy from a branch** → `main` / root
4. Wait ~1 minute, then open https://redreach-repo.github.io/ — it should redirect into Central

## Bookmark the real CRM

| What | URL |
|------|-----|
| Home / marketing | https://redreach-repo.github.io/RRCentral/ |
| Sign in | https://redreach-repo.github.io/RRCentral/login |
| Dashboard | https://redreach-repo.github.io/RRCentral/app |

Optional later: point `crm.redreach.ae` (or `app.redreach.ae`) at GitHub Pages and set Vite `base` + router `basename` to `/`.
