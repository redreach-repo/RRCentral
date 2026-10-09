-- Company TRN from FTA VAT Registration Certificate (Red Reach Middle East FZE).
-- Tax Registration Number: 104605407600003
insert into public.app_settings (key, value)
values ('trn', '104605407600003')
on conflict (key) do update
set value = excluded.value
where btrim(coalesce(public.app_settings.value, '')) = '';

notify pgrst, 'reload schema';
