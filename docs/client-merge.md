# Merge duplicate client records

HighMast brief fix 4, part 1. SQL: `supabase/migrations/20261341090000_client_merge.sql`
(copy in `supabase-sql/client-merge.sql`). Needs `client-links.sql` first.

## Where

Duplicates > **Merge clients** (admins only).

1. Pick a suggested group (same name after removing LLC, L.L.C, SP, Co, Company...,
   "Ready Mix" = "ReadyMix", one name starting the other, or the same TRN), or add
   clients by name or TRN.
2. Choose the record to keep.
3. **Preview merge** shows: every quote, invoice, PO, delivery note, payment, deal,
   ticket, enquiry and uniform staff row that will move; unlinked documents typed with
   one of the names (optional); each field where the records differ, with a pick;
   the combined contacts (no repeated email or phone). A preview changes nothing.
4. Type MERGE (and a reason if you like) and merge.

## What a merge does

- One transaction: all rows of the duplicates point at the client kept.
- The duplicates are soft deleted with `merged_into` set. Old links to them open the
  client kept. They are never matched again when documents are linked.
- Quote and invoice numbers, typed client names, totals and PDFs are never changed.
- `client_merges` logs who, when, why, the values before and every moved row (and the
  audit log gets an entry).

## Undo

Recent merges > **Undo**: duplicates come back with their account, the kept client gets
its own fields and contacts back, and every moved row returns to its old client. Rows
added to the kept client after the merge stay there. A later merge involving the same
clients must be undone first.

## Access

Admins only, people only (the AI connector is refused). Own company only.
