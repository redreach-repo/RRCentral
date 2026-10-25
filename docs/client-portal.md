# Client portal

AI CRM clients open a private link and see, for their own account only:

- Their open requests (tickets) with a plain reply status, and requests done recently
- Build progress: each stage and how far along it is
- Usage against plan for this month and last month (WhatsApp, AI, lead credits, any charge above plan)
- The monthly report for any of the last 6 months, with a Print button

They do not see fees, internal costs, notes, team names or other clients.

## How links work

On an AI CRM account, the **Client portal** card makes a link for a contact
(or for the whole team). The link looks like
`https://redreach-repo.github.io/RRCentral/portal#<token>`.

- The token is random and sits after `#`, so it is never sent to a server log.
- Only its hash is stored in `portal_access`. The link is shown once, when it
  is made. If a client loses it, make a new one and turn off the old one.
- Links work for 12 months. **Turn off** stops a link straight away.
- The card shows when each link was last opened.

## Setup

1. Run `supabase/migrations/20261103090000_client_portal.sql`.
2. Deploy the function:

   GitHub → RRCentral → **Actions** → **Deploy Edge Functions** → **Run workflow** → pick `client-portal` → **Run workflow**.
   Verify JWT is off for it in `supabase/config.toml`; the function checks the caller itself.

No secrets to add. The function uses the project's own service key, which
Supabase provides. If the app runs on a domain other than
`redreach-repo.github.io` or `redreach.ae`, add it to the `ALLOWED_ORIGINS`
secret (comma separated).

The fields the portal returns are chosen in `app/src/lib/clientPortal.ts`,
which is bundled into the function by `npm run build:support-fn`.
