# Client data export (roadmap item 12)

One click on a client's page downloads everything RR Central holds for that
client. No SQL or setup needed.

## How to use it

1. Open the client in Accounts.
2. Press **Export data** at the top.
3. Pick one:
   - **Copy for the client**: what to send when a client asks for their data
     or leaves. Client details, contacts, contracts, invoices, quotations,
     build progress and checklist, requirements, monthly usage, and support
     tickets with their messages. Internal notes, internal ticket notes,
     owner and source fields and costs are left out.
   - **Full copy for our records** (managers and admins): everything,
     including hours logged, activity notes, sales history, AI costs and
     usage import settings. Do not send this one to the client.
4. Press **Download**. A ZIP file downloads, and a note is added to the
   client's activity saying an export was made.

## What is in the ZIP

- `README.txt`: who it is for, when it was made and by whom, and a list of
  the files with row counts.
- One spreadsheet (`.csv`) per kind of record that has data. They open in
  Excel, Numbers or Google Sheets, with Arabic and accents shown correctly.
- `everything.json`: the same data in one file, for importing into another
  system.

Portal link secrets are never exported. The export uses the signed in
person's own access, so it only contains what they are allowed to see.

The client's own CRM system (their contacts, leads and WhatsApp messages) is
exported from that system, not from RR Central.
