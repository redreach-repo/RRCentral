# Client page (HighMast brief fix 3, part 2)

**Sales > Client records** lists every client; each opens one page with
everything about that company. Also reached from the client name on
Quotations and Invoices (when the document is linked to a client) and from
**Client page** on an account.

## The page

- **Header**: legal name, short name, TRN, address, account reference, owner,
  status, credit limit and hold (from the linked account).
- **Totals** per currency: total quoted (latest revision of each quote that
  went out), awarded (Accepted or Awarded), invoiced, balance due (after
  logged payments) and overdue (balance past the due date).
- **Tabs**, newest first, with counts: Inquiries (company, AI CRM and CTRM
  Next deals, website enquiries), Quotations (revisions grouped under the base
  reference, with status, validity and margin), Purchase orders, Invoices and
  credit notes (balance, days overdue), Payments, Delivery notes, Contacts,
  Documents (customer files and PO files), Support tickets, Timeline (quote
  notes and status changes, chase notes, deal updates, account activities,
  linked emails, documents in date order).
- **Filters**: date range, status, division. **Export history (PDF)** prints
  every tab at once; pick "Save as PDF" in the print window.

## Who sees what

Everything is read as the signed-in person, so it follows the same rules as
the other pages:

- Admin, manager, viewer: every client and its money.
- Sales: only their own clients (Sales lock); money of those clients; margin
  only with the "quotes.margin" switch.
- Staff: no quotes, invoices, payments or totals.

## AI connector

`get_client_360` (read only) returns the same view: give `client_id`, or
`name` to search. Money follows the key's role; margin is shown to admin keys
only. Departments: sales, marketing, finance, operations, support, documents.

## SQL

`20261340090000_client_short_name.sql` (copy: `supabase-sql/client-short-name.sql`)
adds the short name. Needs `client-links.sql` first.
