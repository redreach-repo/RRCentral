# worshiphub-read

Read only window into WorshipHub for the RR Central Products page. Full field
spec and setup: [docs/worshiphub-integration.md](../../../docs/worshiphub-integration.md).

* `worshiphub.bundle.js` is generated from `app/src/lib/worshiphub.ts`.
  Regenerate with `npm run build:support-fn` in `app/`. CI fails if it is stale.
* Secrets: `WORSHIPHUB_API_URL`, `WORSHIPHUB_API_TOKEN`, optional `WORSHIPHUB_API_KEY`.
* Deploy with Verify JWT on. Without the secrets it answers "not connected",
  and the app shows the details entered by hand.
