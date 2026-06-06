-- Notificar también cuando cambia el LUGAR de una sesión confirmada.
-- Cambio de hora → reinicia respuestas (PENDING); cambio solo de lugar → no.

create or replace function public.notify_session_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ntype text;
  time_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.status = 'CONFIRMED' then
      ntype := 'SESSION_CONFIRMED';
    else
      return new;
    end if;
  else
    time_changed := old.time_range != new.time_range;
    if old.status != 'CONFIRMED' and new.status = 'CONFIRMED' then
      ntype := 'SESSION_CONFIRMED';
    elsif old.status = 'CONFIRMED' and new.status = 'CANCELLED' then
      ntype := 'SESSION_CANCELLED';
    elsif new.status = 'CONFIRMED'
          and (time_changed or old.location is distinct from new.location) then
      ntype := 'SESSION_CHANGED';
      -- solo el cambio de hora invalida las respuestas
      if time_changed then
        update session_participants set response = 'PENDING' where session_id = new.id;
      end if;
    else
      return new;
    end if;
  end if;

  insert into notifications (user_id, group_id, type, payload)
  select
    sp.user_id,
    new.group_id,
    ntype,
    jsonb_build_object(
      'session_id', new.id,
      'title', new.title,
      'location', new.location,
      'starts_at', lower(new.time_range),
      'ends_at', upper(new.time_range),
      'required', sp.required,
      'old_starts_at', case when ntype = 'SESSION_CHANGED' and tg_op = 'UPDATE' and old.time_range != new.time_range then lower(old.time_range) end,
      'old_location', case when ntype = 'SESSION_CHANGED' and tg_op = 'UPDATE' and old.location is distinct from new.location then old.location end
    )
  from session_participants sp
  where sp.session_id = new.id;

  return new;
end;
$$;
