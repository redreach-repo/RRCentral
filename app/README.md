# RED REACH Central (GitHub + Supabase)

Modern React CRM for Red Reach Middle East FZE. Frontend on GitHub Pages, backend on Supabase (Postgres + Auth).

## Setup

### 1. Create a Supabase project
1. Go to https://supabase.com → New project
2. Open **SQL Editor** → paste and run `app/supabase-schema.sql`
3. **Authentication → Providers → Google** → enable and add your Google OAuth Client ID/Secret
4. **Authentication → URL Configuration** → add redirect URLs:
   - `http://localhost:5173/RRCentral/`
   - `https://redreach-repo.github.io/RRCentral/`
5. **Settings → API** → copy Project URL and anon key

### 2. Local env
```bash
cd app
cp .env.example .env
# Edit .env with your Supabase URL + anon key
npm install
npm run dev
```
Open http://localhost:5173/RRCentral/

### 3. GitHub Pages secrets
In the GitHub repo → Settings → Secrets and variables → Actions, add:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Push to `main` (or run the **Deploy GitHub Pages** workflow). Site: https://redreach-repo.github.io/RRCentral/

## Google OAuth
Create credentials at https://console.cloud.google.com/apis/credentials
- Application type: Web
- Authorized JavaScript origins: your Supabase Auth callback domain (`https://<project-ref>.supabase.co`)
- Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
Paste Client ID + Secret into Supabase Google provider settings.

## Features
Dashboard, CRM, Follow-ups, Quotations (draft/finalize/revise), Invoices + payments, Catalog, Templates, Reports, Expenses, Settings, PDF export, WhatsApp share.

## Roles
Admins (seeded in schema): `alfredsv@gmail.com`, `redreachdxb@gmail.com`, `alfred@redreach.ae`, `jacob@redreach.ae`
Other signed-in users default to `sales`.
