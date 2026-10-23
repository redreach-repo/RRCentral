# Service agreements (roadmap item 10)

RR Central makes each client's service agreement PDF from their contract
record, so the fees, term, usage caps, overage prices, early exit fee and
data protection terms always match what is on file.

## One time setup

1. Run the Item 10 SQL (`supabase/migrations/20261107100000_agreement_templates.sql`).
2. Open **Agreement template** in the menu. It shows the starter wording and a
   preview with a sample client.
3. Press **Sample PDF** and send it to your lawyer.
4. Make the lawyer's changes in the wording box and press **Save as a draft**.
5. When the lawyer is happy, press **Mark approved by lawyer**, type their
   name and the date, and approve.

That version is now locked and used for every agreement. To change the
wording later, press **Start a new draft from this**, edit, and have the
lawyer approve the new version. The old one is kept as a record.

## Making an agreement

On a client, open Delivery, and on the Contract card press **Service
agreement**. The PDF downloads and a note is added to the client's
activity. If no version is approved yet, the PDF says DRAFT at the top and
should not be sent for signature.

What is filled in comes from:

- **Contract**: option, monthly fee, discount, setup fee and paid amount,
  term dates, yearly billing.
- **Package**: name, WhatsApp conversations included, AI cap, lead data
  credits, support response.
- **Packages and rates**: overage prices and markups.
- **Settings**: company name, address, TRN.
- **Client**: name, reference, city and country, and the primary contact as
  the signatory.

The early exit fee is the unpaid setup fee plus two months of the monthly
fee, the same figure shown on the Contract card.

## Editing the wording

A line starting with `#` is the title, `##` a heading and `-` a bullet. A
line that says `[signatures]` adds signature boxes for both parties. Words in
double curly brackets, such as `{{exit_fee}}`, are filled in; the list under
**Things that can be filled in** adds them for you. The page warns about any
it does not recognise, and if the wording leaves out the usage caps or exit
fee.

The starter wording is a starting point for your lawyer, not legal advice.
