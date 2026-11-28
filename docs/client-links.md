# Documents linked to a real client (HighMast brief fix 3, part 1)

Quotes, invoices, delivery notes, payments, company pipeline deals, support
tickets and website enquiries now carry `client_id` (a link to `clients`)
next to the client name typed on them. The typed name, document numbers,
totals and PDFs are never changed.

## How a document gets its client

1. The app or a manager sets it.
2. On save, the database looks for exactly one client of the same company
   (tenant): by the linked account, the exact name, the normalized name
   ("Al Noor Trading L.L.C." = "al noor"), then the contact email. A payment
   takes the client of the invoice it pays. Two possible clients, or none:
   no link (never guessed).
3. When a client is added or renamed, unlinked documents with that name link
   to it, if it is the only match.

An existing link is only redone when the document's client name changes.

## Existing records

`20261339090000_client_links.sql` (copy: `supabase-sql/client-links.sql`)
links every one-match document once and logs the batch in `client_link_log`.
The rest are listed on **Duplicates > Documents to link** (managers and
admins): pick the client once per typed name and every document in the group
links to it. Admins can also link any new one-match documents there, and undo
that batch.

SQL editor:

```sql
select * from public.rr_link_clients();          -- what would link, what needs review
select * from public.rr_link_clients(true);      -- link one-match documents (admins)
select public.rr_unlink_clients('<batch id>');   -- undo one batch
```

## Access

- Reading and setting `client_id` follows each table's existing rules.
- Review list and manual link: managers and admins. Link-all and undo: admins.
- The AI connector cannot call the link functions.
- Sales: a document linked to one of their own clients counts as theirs (as a
  matching name did before). They still see no other client's documents.
