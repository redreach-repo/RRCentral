-- M12 deepen: logistics pack + templates for logistics and events_tours.

insert into public.industry_packs (pack_key, name, description, version, manifest, active)
values (
  'logistics',
  'Logistics',
  'Master Spec §M12 starter: lanes, carriers, delivery windows (full pack later).',
  '0.1.0',
  jsonb_build_object(
    'modules', jsonb_build_array('sales', 'ops', 'delivery'),
    'objects', jsonb_build_array('deal', 'product'),
    'templates', jsonb_build_object(
      'custom_fields', jsonb_build_array(
        jsonb_build_object('object_type', 'deal', 'field_key', 'lane_code', 'label', 'Lane code', 'field_type', 'text'),
        jsonb_build_object('object_type', 'deal', 'field_key', 'carrier', 'label', 'Carrier', 'field_type', 'text'),
        jsonb_build_object('object_type', 'deal', 'field_key', 'incoterm_logistics', 'label', 'Incoterm', 'field_type', 'select',
          'options', jsonb_build_array('EXW', 'FOB', 'CIF', 'DAP', 'DDP'))
      ),
      'pipelines', jsonb_build_array(
        jsonb_build_object('name', 'Logistics lane', 'object_type', 'deal',
          'stages', jsonb_build_array('Inquiry', 'Quote', 'Booked', 'In transit', 'Delivered', 'Lost'))
      )
    )
  ),
  true
)
on conflict (pack_key) do update
set
  name = excluded.name,
  description = excluded.description,
  version = '0.2.0',
  manifest = coalesce(public.industry_packs.manifest, '{}'::jsonb) || excluded.manifest,
  active = true;

update public.industry_packs
set manifest = coalesce(manifest, '{}'::jsonb) || jsonb_build_object(
  'templates', jsonb_build_object(
    'custom_fields', jsonb_build_array(
      jsonb_build_object('object_type', 'deal', 'field_key', 'event_date', 'label', 'Event / tour start', 'field_type', 'date'),
      jsonb_build_object('object_type', 'deal', 'field_key', 'pax_count', 'label', 'Pax count', 'field_type', 'number'),
      jsonb_build_object('object_type', 'deal', 'field_key', 'tour_code', 'label', 'Tour code', 'field_type', 'text')
    ),
    'pipelines', jsonb_build_array(
      jsonb_build_object('name', 'Events & tours', 'object_type', 'deal',
        'stages', jsonb_build_array('Lead', 'Proposal', 'Deposit', 'Confirmed', 'Completed', 'Lost'))
    )
  )
),
version = '0.2.0'
where pack_key = 'events_tours';
