-- New accounts start with reminder EMAILS off (opt-in): seed a REMINDER
-- preference with channel PUSH at signup. In-app/device alerts unaffected;
-- existing users keep their current behavior (no row → BOTH).
-- Function body otherwise identical to 20260607000005_join_codes.sql.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  -- reminder emails are opt-in for new accounts
  insert into notification_preferences (user_id, event_type, channel)
  values (new.id, 'REMINDER', 'PUSH')
  on conflict do nothing;

  -- accept pending email invitations → memberships
  insert into memberships (user_id, group_id, role)
  select new.id, i.group_id, i.role
  from invitations i
  where lower(i.email) = lower(new.email)
    and i.accepted_at is null
    and i.expires_at > now()
  on conflict do nothing;

  update invitations
  set accepted_at = now()
  where lower(email) = lower(new.email)
    and accepted_at is null
    and expires_at > now();

  return new;
end;
$$;
