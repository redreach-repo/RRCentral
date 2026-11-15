-- M12: seed object/field/pipeline templates into industry_packs.manifest.

update public.industry_packs
set manifest = coalesce(manifest, '{}'::jsonb) || jsonb_build_object(
  'templates', jsonb_build_object(
    'custom_fields', jsonb_build_array(
      jsonb_build_object('object_type', 'deal', 'field_key', 'eng_discipline', 'label', 'Discipline', 'field_type', 'select',
        'options', jsonb_build_array('civil', 'mech', 'elec', 'other')),
      jsonb_build_object('object_type', 'deal', 'field_key', 'eng_claim_ref', 'label', 'Claim reference', 'field_type', 'text')
    ),
    'pipelines', jsonb_build_array(
      jsonb_build_object('name', 'Engineering pursuit', 'object_type', 'deal',
        'stages', jsonb_build_array('Qualify', 'Propose', 'Negotiate', 'Won', 'Lost'))
    )
  )
),
version = '0.2.0'
where pack_key = 'engineering';

update public.industry_packs
set manifest = coalesce(manifest, '{}'::jsonb) || jsonb_build_object(
  'templates', jsonb_build_object(
    'custom_fields', jsonb_build_array(
      jsonb_build_object('object_type', 'deal', 'field_key', 'site_code', 'label', 'Site code', 'field_type', 'text'),
      jsonb_build_object('object_type', 'deal', 'field_key', 'workforce_band', 'label', 'Workforce band', 'field_type', 'select',
        'options', jsonb_build_array('small', 'medium', 'large'))
    ),
    'pipelines', jsonb_build_array(
      jsonb_build_object('name', 'Construction bid', 'object_type', 'deal',
        'stages', jsonb_build_array('Tender', 'Estimate', 'Submit', 'Award', 'Lost'))
    )
  )
),
version = '0.2.0'
where pack_key = 'construction';

update public.industry_packs
set manifest = coalesce(manifest, '{}'::jsonb) || jsonb_build_object(
  'templates', jsonb_build_object(
    'custom_fields', jsonb_build_array(
      jsonb_build_object('object_type', 'product', 'field_key', 'hs_code', 'label', 'HS code', 'field_type', 'text'),
      jsonb_build_object('object_type', 'deal', 'field_key', 'incoterm', 'label', 'Incoterm', 'field_type', 'select',
        'options', jsonb_build_array('EXW', 'FOB', 'CIF', 'DDP'))
    )
  )
),
version = '0.2.0'
where pack_key = 'trading_import';

comment on table public.industry_packs is 'M12: pack catalog; manifest.templates applied on activate.';
