# Monthly recurring revenue (Tier 4)

**MRR** in the menu (managers and admins) shows what clients pay each month
for their AI CRM, in AED before VAT, from their contracts. No SQL or setup
needed.

- **MRR this month**, paying clients and the average per client.
- **New this month**: new clients plus upgrades. **Lost this month**: clients
  who left plus downgrades.
- **MRR with a churn warning**: this month's MRR from clients the Client
  health page warns about.
- **Next 3 months**: contracted MRR (running and signed contracts, with
  discounts ending as planned) plus open AI CRM sales deals, weighted by
  stage: lead 10%, discovery call 25%, quote sent 50% of the quoted monthly
  fee, from the deal's agreed start date or the first of next month. It also
  shows how many terms end each month.
- **Last 12 months**: MRR, client count, new, upgrades, downgrades and lost,
  with who joined or left.

How it is counted:

- A month counts a contract that runs to the end of that month. A contract
  cancelled in the middle of a month counts as lost that month.
- Active contracts keep counting after their term ends (month to month).
  Ended and cancelled contracts stop at the term end, or the day they were
  closed if earlier. Drafts never count.
- Annual prepay contracts count their monthly fee. Setup fees are one off, so
  they are not MRR.
- Past months use today's fee and discount, since RR Central does not keep a
  history of fee changes.
