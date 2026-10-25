-- Wave 4, PR S: the before the call brief asks AI help for three questions.
-- Its cost is logged against the account like every other AI help request,
-- under the new feature name call_brief. Nothing else is stored: the brief is
-- read only unless a person saves it as a timeline note.
-- Safe to run more than once.

alter table public.ai_usage_log drop constraint if exists ai_usage_log_feature_check;
alter table public.ai_usage_log
  add constraint ai_usage_log_feature_check
  check (feature in ('ticket_summary', 'ticket_reply', 'report_summary', 'call_notes', 'call_brief'));

notify pgrst, 'reload schema';
