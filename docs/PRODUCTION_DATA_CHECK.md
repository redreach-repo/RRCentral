# Production data check (23 Oct 2026 catch-up)

On 23 Oct 2026 the catch-up SQL brought the live database up to date but left
out six changes on purpose, because they edit or delete existing data.
[`supabase/scripts/check-catch-up-skipped.sql`](../supabase/scripts/check-catch-up-skipped.sql)
shows, for each one, what that SQL would have made it (**expected**) next to what
the live database has (**actual**). It is read only and changes nothing.

Only the Supabase project owner can run it (it reads `auth.users`), so it is
an SQL file rather than a page in the app.

## How to run it

1. Open the SQL copy page and copy the section **Production data check**
   (or copy the whole file from GitHub).
2. Supabase → **SQL Editor** → **New query** → paste → **Run**.
3. Go down the six rows. Tick each one off below once its status is OK, or once
   you have decided to leave it as it is.

`status`: **OK** matches. **DIFFERENT** decide, using `what_to_do`. **URGENT** act now.
**CHECK** the database alone cannot tell.

## The six items

| # | Item | Left-out migration | What it would have done | Tick |
|---|------|--------------------|-------------------------|------|
| 1 | Email login only | `20261006150000_redreach_email_login_only` | turn off every team login that is not `@redreach.ae` | ☐ |
| 2 | Default admin | `20261006170000_default_admin_info` | make `info@redreach.ae` an admin with a password that is in the public repo. **Never run it.** Add info@ in Settings → Users instead. | ☐ |
| 3 | Attachments | `20261009150000_attachments_no_data_urls` | delete files stored inside the database, then allow only https links | ☐ |
| 4 | Company address | `20261009180000_company_address_uaq` | change the letterhead address to P.O. Box 7073, Umm Al Quwain | ☐ |
| 5 | Mass Allied Freighters | `20261009200000_mass_allied_freighters_client` | fill in the client and CRM record (full name, TRN, office, address) and rename short names on its invoices and quotes | ☐ |
| 6 | Quote RR-01-26003 | part of `20260924180942_offset_vat` | set offset VAT on, discount 0, amount 4535 | ☐ |

Fix each one in the app where you can (Settings → Users, Settings → Company,
the client, the quote). For item 3, save any file you need to Google Drive and remove
it from its record, then run the copy page's **Attachments clean-up** section. That
section deletes nothing: it turns on the link-only rules, and stops with a message
if a file is still stored in the database.
Run the check again afterwards: every row should be OK.

The test `supabase/tests/catch_up_check_test.sh` (CI) proves each status is
reported correctly, and that the check changes nothing.
