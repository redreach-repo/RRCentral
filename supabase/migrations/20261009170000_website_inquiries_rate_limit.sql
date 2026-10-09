-- Crude global rate limit for anonymous contact-form inserts (no CAPTCHA yet).
-- Blocks bursts that would fill website_inquiries; staff inserts are exempt.

create or replace function public.rr_website_inquiry_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent integer;
begin
  if auth.role() is distinct from 'anon' then
    return new;
  end if;

  select count(*)::integer into recent
  from public.website_inquiries
  where created_at > now() - interval '1 minute';

  if recent >= 20 then
    raise exception 'Too many contact submissions — try again shortly'
      using errcode = '54000';
  end if;

  return new;
end;
$$;

drop trigger if exists rr_website_inquiry_rate_limit on public.website_inquiries;
create trigger rr_website_inquiry_rate_limit
  before insert on public.website_inquiries
  for each row execute function public.rr_website_inquiry_rate_limit();
