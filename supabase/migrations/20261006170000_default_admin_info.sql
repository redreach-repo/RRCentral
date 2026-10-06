-- Default Central admin: info@redreach.ae (password set in auth.users below).
-- After apply, sign in with info@redreach.ae / RedReach2026# and change the password.

insert into public.app_users (email, name, role, active)
values ('info@redreach.ae', 'Red Reach', 'admin', true)
on conflict (email) do update
set
  role = 'admin',
  active = true,
  name = case
    when coalesce(public.app_users.name, '') = '' then excluded.name
    else public.app_users.name
  end;

-- Create or reset Auth login for info@redreach.ae (bcrypt via pgcrypto).
do $$
declare
  v_user_id uuid;
  v_encrypted text;
  v_email text := 'info@redreach.ae';
  v_password text := 'RedReach2026#';
begin
  create extension if not exists pgcrypto;

  v_encrypted := crypt(v_password, gen_salt('bf'));

  select id into v_user_id from auth.users where lower(email) = v_email limit 1;

  if v_user_id is null then
    v_user_id := gen_random_uuid();
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      v_encrypted,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Red Reach"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  else
    update auth.users
    set
      encrypted_password = v_encrypted,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now(),
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"provider":"email","providers":["email"]}'::jsonb
    where id = v_user_id;
  end if;

  if not exists (
    select 1 from auth.identities
    where user_id = v_user_id and provider = 'email'
  ) then
    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    );
  end if;
end $$;
