# Staging copy (roadmap item 13)

A second copy of RR Central with its own, separate database, for trying
changes and new features without touching live clients' data. It lives at:

https://redreach-repo.github.io/RRCentral/staging/

Every page shows a purple **STAGING** bar at the top. Search engines are told
not to list it.

## One time setup (about 15 minutes)

1. **Make the staging database.** In Supabase, press **New project**. Name it
   `rr-central-staging`, pick the same region as live, and save the database
   password in your password manager. The free plan is enough.
2. **Give GitHub its addresses.** In GitHub, open RRCentral, then Settings,
   Secrets and variables, Actions, and add three repository secrets from the
   new project (not the live one):
   - `STAGING_SUPABASE_URL`: Project Settings, API, Project URL.
   - `STAGING_SUPABASE_ANON_KEY`: Project Settings, API, the **anon public**
     key. Never the service_role key.
   - `STAGING_DB_URL`: Project Settings, Database, Connection string, URI
     (session pooler), with the password filled in.
3. **Create the tables.** In GitHub, open Actions, **Update staging
   database**, Run workflow, type `staging`, and run it. It applies every
   migration in order. It refuses to run against the live database.
4. **Change the starter password.** The migrations create the
   `info@redreach.ae` admin with a starter password. In the staging project
   open Authentication, Users, and reset that user's password straight away.
5. **Publish it.** Open Actions, **Deploy GitHub Pages**, Run workflow. From
   now on every deploy publishes both the live app and the staging copy.

## Day to day

- Try new things on staging first. Its clients, invoices and tickets are
  test data you add there; live data is never copied across.
- After merging a PR that adds SQL, run **Update staging database** first,
  check the new feature on staging, then run the SQL on live from the SQL
  page.
- Edge Functions (emails, WhatsApp, AI help, portal) are not deployed to
  staging unless you deploy them there too, so those buttons will say they
  are not set up.

## How it works

The Pages workflow builds the app a second time with the staging project's
URL and key and `VITE_APP_ENV=staging`, under `/RRCentral/staging/`. If the
staging URL is the same as live, the deploy stops with an error. A link to a
staging page that GitHub Pages does not know (for example a refreshed client
page) opens the live app's fallback page, which passes it straight on to the
staging app.
