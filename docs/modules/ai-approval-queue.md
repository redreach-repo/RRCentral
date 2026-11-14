# AI approval queue

Status: **built and tested in CI-equivalent local runs; not live.** Draft PR, not merged, SQL not applied, no secret set, never called against the real Anthropic API.

## What it does

AI never writes CRM data. A person asks for suggestions on one account; Claude (Haiku 5.5, same key and settings as AI help) answers with up to 5 proposed actions; each lands in `ai_action_proposals` as **pending**. Someone then approves (as is or edited), rejects, or the asker cancels. Only an approved proposal runs, and it runs **as the approving user** under their own row level security.

Allowed actions (an allow list in the database; anything else is refused):

| Action | What approving does |
| --- | --- |
| `add_timeline_note` | Adds one note / call / email / meeting row to the account timeline (`account_activities`, `external_source = 'ai_proposal'`) |
| `update_account_fields` | Changes only `industry`, `country`, `city`, `website`, `notes` on the account |

No delete, no email, no money, no owner/stage/amount changes. Adding an action means a new migration, a test, and a new branch in `rr_ai_proposal_decide`.

## How it is enforced

- `ai_action_proposals` has RLS. Read: the proposer, or anyone who can edit the account. Insert: people who can edit the account. Delete: admins. **No UPDATE for anyone signed in.** Restrictive tenant isolation.
- Insert trigger forces `status = pending`, stamps the proposer and the account's tenant, clears every decision field, and validates the payload.
- `rr_ai_proposal_decide(id, 'approve'|'reject'|'cancel', edited_payload, note)` is SECURITY INVOKER: the timeline insert / account update is a normal write by the approver. If their RLS refuses it, nothing happens.
- `rr_ai_proposal_record` (SECURITY DEFINER) is the only thing that changes a proposal. It refuses to mark one **executed** unless the data really shows it (the timeline row with this proposal id by this user, or the account fields equal the approved values), so a status cannot be forged.
- Decisions are final; the asker, prompt, model and original suggestion can never be changed. When a proposal is edited, both the AI's version (`original_payload`) and the approved version are kept.
- Every insert and decision goes to `audit_log`. The proposing call's cost goes to `ai_usage_log` (new feature name `ai_propose`) and is also split across the proposals.
- Setting `ai.approvals.require_manager = true` (app_settings) limits approving to managers and admins. Off by default: anyone who can edit the account can approve, including the person who asked.
- The prompt puts account data in an `<account>` block and tells the model it is data, not instructions. A prompt injection in account notes can at worst produce a bad **suggestion**, which still needs a human.

## Files

- `supabase/migrations/20261223090000_ai_approval_queue.sql`
- `supabase/tests/modules/ai_approval_queue_test.sql` (36 checks: each role, tenant B, forged status, edits, require_manager, audit, finality)
- `supabase/functions/hm-ai-propose/` (`index.ts`, `proposals.ts`) and `supabase/tests/functions/ai_propose_test.ts`
- `app/src/lib/aiApprovals/` (helpers, store, tests)
- `app/src/modules/extensions/ai-approvals/` (page at `/ai-approvals`, EN + AR labels)

## Setup (Alfred, after merge; nothing here is done yet)

1. Run `20261223090000_ai_approval_queue.sql` on the SQL copy page.
2. Deploy: Actions, Deploy Edge Functions, Function = `other`, name `hm-ai-propose`.
3. `ANTHROPIC_API_KEY` is the same secret AI help uses. If AI help works, nothing else to set.
4. Optional: add app setting `ai.approvals.require_manager` = `true`.

## Not done / unverified

- Never run against the real Claude API (no key in the build session). The structured output schema follows the same pattern as ai-assist, which works live, but the first real call is the real test.
- Not wired into other screens yet (e.g. a "Suggest with AI" button on the account page). The queue page has its own account picker.
- No bulk approve, no expiry of old pending proposals.
- Accessibility check (axe) covers the page only once CI's a11y job visits `/ai-approvals`; it has not been added to that job.
