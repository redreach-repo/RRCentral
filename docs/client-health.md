# Client health score (Tier 4)

**Client health** in the menu lists every AI CRM client with a running
contract, lowest score first. Each client's Delivery tab has a **Health**
card with the same score.

## How the score works

Four parts, 25 points each, 100 in total:

| Part | Full points | Fewer points |
|---|---|---|
| Usage | Used half or more of the WhatsApp allowance last month | Under a half: 15, under a quarter: 8, under a tenth: 0. Down by more than half on the month before: 5 off |
| Support | 2 or fewer tickets in the last 30 days | 3 to 5: 18, 6 to 9: 10, 10 or more: 3. Any open ticket past its promised reply time: 5 off |
| Report calls | Joined every monthly report call recorded in the last 3 months | The share attended. Calls marked Moved are left out |
| Payments | Nothing overdue | Oldest overdue invoice 1 to 7 days late: 18, up to 14: 10, up to 30: 5, more: 0 |

When there is no data for a part yet (no usage recorded, no report calls
marked), it scores 15, neither good nor bad.

- **Healthy**: 75 or more.
- **Keep an eye on**: 50 to 74.
- **At risk**: below 50.

## Churn warning

Shown when the client is at risk, or on any of these signs:

- Usage dropped by more than half last month.
- Hardly using the system (under a tenth of the allowance) two months running.
- 10 or more support tickets in 30 days.
- Missed the last two report calls.
- An invoice more than 30 days overdue.
- Renewal due within 60 days and not healthy.

## Recording report calls

On the Health card, mark this month's and last month's report call as
**Attended**, **Missed** or **Moved**. Run the Tier 4 health SQL
(`20261110090000_report_calls.sql`) first. Usage, tickets and invoices come
from what RR Central already has; invoices count once they are linked to
the client.
