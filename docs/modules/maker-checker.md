Status: built and tested (draft)
Owner: Claude
PR: see the PR titled "Maker-checker" (draft)
Stubbed / unverified: no existing screen calls it yet (Payroll will be the first user); rules are listed in the app but edited only by admins through SQL or a later settings form; Arabic labels need a native review.

# Maker-checker (four eyes)

Sensitive actions (a payroll run, a refund, a large expense) can require a second person. The person who asks is the **maker**; a manager or admin who is not the maker is the **checker**.

## What is enforced, and where

| Rule | Where |
|------|-------|
| Maker is always the signed in user; a new request is always `pending` | `before insert` trigger |
| The maker can never approve or reject their own request | `rr_approval_decide()` and a table CHECK (`checker_email <> maker_email`) |
| Only manager or admin decides | `rr_approval_decide()` |
| Rejecting needs a reason | function + CHECK |
| A decided request is final | function |
| Only the maker withdraws, only while pending | `rr_approval_cancel()` |
| No direct UPDATE/DELETE on requests | grants (decisions only through the functions) |
| Every change lands in `audit_log` | `rr_audit` trigger |
| Tenant isolation | RESTRICTIVE policy, like every M1 table |

## Who sees what

| Role | Requests | Raise | Decide | Rules (policies) |
|------|----------|-------|--------|------------------|
| admin | all in tenant | yes | yes (not own) | read + write |
| manager | all in tenant | yes | yes (not own) | read |
| sales | all in tenant | yes | no | read |
| staff | own only | yes | no | read |
| viewer | own only (none) | no | no | read |
| other tenant / anon | none | no | no | none |

## How other modules use it

```ts
import { approvalRequired } from '../lib/makerChecker/makerChecker'
import { raiseApprovalRequest } from '../lib/makerChecker/store'
// or in SQL: select public.rr_approval_required('payroll.run', 42000);
```

Seeded rules for Red Reach (change any time): `payroll.run` (always), `payment.refund` (always), `expense.large` (from AED 10,000).

## Setup for Alfred (nothing is applied yet)
1. Merge PR #414 first, then this PR.
2. SQL copy page: run `supabase/migrations/20261220090000_maker_checker.sql`. Safe to run twice.
3. Open **Approvals → Approval queue** in the app.

No secrets, no functions to deploy.

## Tests
- `supabase/tests/modules/maker_checker_test.sql`: 35 checks (every role, four eyes, reasons, cancel, cross tenant, anon, audit).
- `app/src/lib/makerChecker/makerChecker.test.ts`: policy thresholds, who can decide or cancel, queue order.
