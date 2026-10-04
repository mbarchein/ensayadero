-- Calendar import: a connected calendar can be edited, name and link. The link
-- stays write-only (still not readable back). A new link means a possibly
-- different calendar: its synced events are dropped at once and it goes to the
-- front of the sync queue. Ignored events are kept: a regenerated secret link
-- is the same calendar with the same event UIDs.

grant update (url) on public.calendar_sources to authenticated;

-- same as before, plus: a new link also clears the sync progress
create or replace function public.calendar_source_prepare()
returns trigger language plpgsql set search_path = public as $$
begin
  new.url := regexp_replace(btrim(new.url), '^webcal://', 'https://', 'i');
  new.url_hint := substring(new.url from '^[a-zA-Z]+://([^/?#]+)') || '…' || right(new.url, 10);
  if tg_op = 'INSERT' then
    if (select count(*) from calendar_sources where user_id = new.user_id) >= 5 then
      raise exception 'TOO_MANY_CALENDARS' using errcode = 'check_violation';
    end if;
  elsif new.url is distinct from old.url then
    new.last_synced_at := null;
    new.last_error := null;
    new.last_attempt_at := null;
  end if;
  return new;
end;
$$;

-- the old link's events: users can't delete busy blocks, hence definer
create or replace function public.calendar_source_url_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from external_busy where source_id = new.id;
  return null;
end;
$$;

create trigger calendar_source_url_changed
  after update of url on public.calendar_sources
  for each row when (old.url is distinct from new.url)
  execute function public.calendar_source_url_changed();
