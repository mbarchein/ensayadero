-- Notify a member when they are promoted to INSTRUCTOR (manual promotion on
-- the members page or automatic successor handoff when the last director
-- leaves). Email on by default (no preference row means BOTH); the profile
-- page groups it with the other membership emails for the opt-out.

create or replace function public.notify_member_promoted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  promoter text;
begin
  if old.role = 'INSTRUCTOR' or new.role <> 'INSTRUCTOR' then
    return new;
  end if;
  -- who promoted, when the change comes from a logged-in user (null for
  -- server-side handoffs, e.g. the leave-group successor trigger)
  select coalesce(nullif(name, ''), email) into promoter
  from profiles where id = auth.uid();

  insert into notifications (user_id, group_id, type, payload)
  values (
    new.user_id,
    new.group_id,
    'MEMBER_PROMOTED',
    jsonb_strip_nulls(jsonb_build_object('promoted_by', promoter))
  );
  return new;
end;
$$;

create trigger trg_notify_member_promoted
  after update of role on memberships
  for each row execute function public.notify_member_promoted();
