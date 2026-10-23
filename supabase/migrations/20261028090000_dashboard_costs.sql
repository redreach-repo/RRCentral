-- RR Central modules, Phase 6: fixed monthly cost estimate for the dashboard.
--
-- The dashboard compares this month's client and church revenue with the
-- variable costs (tools and hours, from the delivery rates) and this fixed
-- estimate (salaries, rent, subscriptions). Admin only to change, like the
-- other delivery rates. Adds one setting and changes no existing data.
-- Safe to re-run.
--
-- To reverse:
--   delete from public.app_settings where key = 'deliveryFixedMonthlyCostAed';
--   then re-run 20261025090000_support_desk.sql section 3 to restore rr_is_protected_setting.

insert into public.app_settings (key, value) values ('deliveryFixedMonthlyCostAed', '0')
on conflict (key) do nothing;

create or replace function public.rr_is_protected_setting(setting_key text)
returns boolean
language sql
immutable
as $$
  select setting_key in (
      'companyName', 'accountName', 'bankName', 'bankAccount', 'iban', 'swift',
      'trn', 'vatRate', 'currency', 'email', 'address', 'apiToken'
    )
    or public.rr_is_secret_setting(setting_key)
    or setting_key ilike 'zoho%'
    or setting_key in (
      'deliveryMarketingRateAed', 'deliveryServiceRateAed', 'deliveryAiMarkupPercent',
      'deliveryLeadMarkupPercent', 'deliveryInternalHourlyRateAed', 'deliveryUsdToAed',
      'deliveryFixedMonthlyCostAed',
      'supportWorkingDays', 'supportDayStart', 'supportDayEnd'
    )
$$;

notify pgrst, 'reload schema';
