-- Invitations no longer carry a role: everyone joins as ACTOR (directors are
-- promoted afterwards from the members page). Redefine handle_new_user so it
-- stops reading invitations.role, then drop the column. Membership role falls
-- back to its 'ACTOR' default.

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

  -- accept pending email invitations → memberships (always as ACTOR)
  insert into memberships (user_id, group_id)
  select new.id, i.group_id
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

alter table public.invitations drop column role;
