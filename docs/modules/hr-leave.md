Status: built and tested (draft PR)
Owner: Cursor (M4–M7 batch)

# HR leave (M6 deepen)

Leave requests for employees already on `hr_employees`.

## Table
- `hr_leave_requests` — annual/sick/unpaid/other, pending→approved/rejected/canceled

## Function
- `rr_hr_leave_decide(id, decision, note)` — manager/admin for approve/reject

## UI
- `/hr/leave` (HR module flag, manager+)

## Setup
Apply `20261230130000_hr_leave.sql`. Enable HR module flag.

## Tests
- `app/src/lib/hrLeave.test.ts`
- `supabase/tests/modules/hr_leave_test.sql`
