# Setup status: database updates

The System check page (Admin, System check) now starts with **Database updates**.

- For every file in `supabase/migrations` it looks for one table or column that file adds, with a read only select of zero rows. It never inserts, updates or deletes, and never reads CRM rows.
- Red "To run" means that update is not on live yet. Run those in the Supabase SQL editor, oldest first, then press Check again.
- Rows with a yellow "Wait" note must not go on live yet (HR feature slices until the HR and payroll permission fix; A1 money and encryption until tried on staging).
- "Not visible" rows only change rules, functions or seed rows. `supabase/scripts` and the project's `check-what-is-applied.sql` cover those.
- Server functions and secrets are checked in the table below it, as before.

## Adding a migration

`app/src/lib/dbSetup/dbSetupCheck.test.ts` fails when a migration has no row in `app/src/lib/dbSetup/probes.ts`. Add one row: the file name, a few words, and a table (plus column if the file only adds a column). Leave `table` out when the file only changes rules or functions.
