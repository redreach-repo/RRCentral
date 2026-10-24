# worshiphub-manage

Accept, reject, verify or delete a church on WorshipHub from RR Central, the
same as the WorshipHub App admin buttons. Spec:
[docs/worshiphub-integration.md](../../../docs/worshiphub-integration.md).

* Only active RR Central admins (`rr_is_admin()`) can call it.
* Every attempt goes to the audit log as `worshiphub_review`, with who did it
  and whether WorshipHub accepted it.
* Uses the same secrets as `worshiphub-read`: `WORSHIPHUB_API_URL`,
  `WORSHIPHUB_API_TOKEN`, optional `WORSHIPHUB_API_KEY`. No new secrets.
* Deploy with Verify JWT on (Actions > Deploy Edge Functions > worshiphub-manage).
