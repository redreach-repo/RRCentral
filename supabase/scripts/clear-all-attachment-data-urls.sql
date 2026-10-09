-- Delete every attachments row whose url is an inlined data: blob.
-- Prefer WorkDrive https links going forward (see migration 20261009150000).
-- Safe to re-run. Count first:
--   select entity_type, count(*) from attachments where url like 'data:%' group by 1;

delete from attachments
where url like 'data:%';
