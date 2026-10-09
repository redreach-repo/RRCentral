-- Letterhead address: P.O. Box 7073, Umm Al Quwain (replaces legacy Dubai PO box).
update public.app_settings
set value = 'P.O. Box 7073, Umm Al Quwain, UAE'
where key = 'address'
  and (
    value is null
    or btrim(value) = ''
    or value in (
      'P.O. Box 6641, Dubai, UAE',
      'PO Box 6641, Dubai, UAE',
      'P.O. Box 6641, Dubai, U.A.E.'
    )
  );

insert into public.app_settings (key, value)
values ('address', 'P.O. Box 7073, Umm Al Quwain, UAE')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
