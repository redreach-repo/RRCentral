-- Reminder flag: admins confirm Zoho client secret + refresh token were rotated after RLS hardening.
insert into public.app_settings (key, value)
values ('zohoPostHardeningRotationAck', 'no')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
