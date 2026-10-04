-- Calendar import: a user subscribes to their own calendars by secret iCal
-- link. The sync-calendars Edge Function fetches each feed, expands its events
-- for the coming weeks and stores them as busy blocks. group_busy_ranges
-- subtracts them from availability like confirmed rehearsals, without
-- revealing where they come from (D1). Nothing here touches availabilities:
-- removing a calendar leaves the painted availability intact.

-- ── Subscriptions ───────────────────────────────────────────
create table public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  -- the feed link is a secret: clients can write it but never read it back
  url text not null check (url ~* '^(https?|webcal)://[^/]+'),
  url_hint text,              -- host + tail of the link, safe to show
  include_all_day boolean not null default false,
  include_free boolean not null default false, -- events marked "free" (TRANSP)
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index calendar_sources_user on public.calendar_sources (user_id);
create index calendar_sources_sync on public.calendar_sources (last_synced_at nulls first);

-- webcal:// is just https; keep a readable hint; a new link re-syncs from
-- scratch; at most 5 calendars per user (each one is fetched every hour)
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
  end if;
  return new;
end;
$$;

create trigger calendar_source_prepare
  before insert or update of url on public.calendar_sources
  for each row execute function public.calendar_source_prepare();

alter table public.calendar_sources enable row level security;
-- Superadmin has NO policy → cannot see anyone's calendars (D2).
create policy calendar_sources_own on public.calendar_sources for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- column-level grants: url is write-only; sync state is server-only
revoke all on public.calendar_sources from anon, authenticated;
grant select (id, user_id, name, url_hint, include_all_day, include_free, last_synced_at, last_error, created_at)
  on public.calendar_sources to authenticated;
grant insert (name, url, include_all_day, include_free) on public.calendar_sources to authenticated;
grant update (name, include_all_day, include_free) on public.calendar_sources to authenticated;
grant delete on public.calendar_sources to authenticated;

-- ── Imported busy blocks (written only by the sync) ─────────
create table public.external_busy (
  id bigint generated always as identity primary key,
  source_id uuid not null references public.calendar_sources (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  uid text not null,          -- iCal UID of the event (series)
  time_range tstzrange not null check (not isempty(time_range)),
  summary text,               -- event title: only its owner can read it
  all_day boolean not null default false,
  recurring boolean not null default false
);
create index external_busy_user_range on public.external_busy using gist (user_id, time_range);
create index external_busy_source on public.external_busy (source_id);

alter table public.external_busy enable row level security;
create policy external_busy_own_read on public.external_busy for select
  using (user_id = auth.uid());
revoke insert, update, delete on public.external_busy from anon, authenticated;

-- ── Events the user chose to ignore ("I can skip the gym") ──
create table public.external_busy_ignores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  source_id uuid not null references public.calendar_sources (id) on delete cascade,
  uid text not null,
  occurrence timestamptz,     -- start of one occurrence; null = the whole series
  summary text,               -- label for the "ignored" list
  created_at timestamptz not null default now(),
  unique nulls not distinct (source_id, uid, occurrence)
);

alter table public.external_busy_ignores enable row level security;
create policy external_busy_ignores_own on public.external_busy_ignores for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from calendar_sources s where s.id = source_id and s.user_id = auth.uid())
  );

-- ── Sync write path (service role only) ─────────────────────
-- Atomically replaces a source's blocks with the freshly expanded events.
create or replace function public.replace_external_busy(sid uuid, events jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  select user_id into owner from calendar_sources where id = sid;
  if owner is null then
    return; -- removed while syncing
  end if;
  delete from external_busy where source_id = sid;
  insert into external_busy (source_id, user_id, uid, time_range, summary, all_day, recurring)
  select sid, owner, e.uid, tstzrange(e.starts_at, e.ends_at), left(e.summary, 200),
         coalesce(e.all_day, false), coalesce(e.recurring, false)
  from jsonb_to_recordset(events)
    as e(uid text, starts_at timestamptz, ends_at timestamptz, summary text, all_day boolean, recurring boolean)
  where e.uid is not null and e.ends_at > e.starts_at;
  update calendar_sources set last_synced_at = now(), last_error = null where id = sid;
end;
$$;

revoke execute on function public.replace_external_busy(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_external_busy(uuid, jsonb) to service_role;

-- ── Busy times now include the members' imported calendars ──
-- Still no origin: a calendar event and a rehearsal in another group look
-- the same to the group.
create or replace function public.group_busy_ranges(gid uuid, search tstzrange)
returns table (user_id uuid, busy tstzrange)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_instructor(auth.uid(), gid) and not is_member(auth.uid(), gid) then
    raise exception 'FORBIDDEN';
  end if;
  return query
  select sp.user_id, s.time_range
  from sessions s
  join session_participants sp on sp.session_id = s.id
  join memberships m on m.user_id = sp.user_id and m.group_id = gid
  where s.status = 'CONFIRMED'
    and s.time_range && search
  union all
  select eb.user_id, eb.time_range
  from external_busy eb
  join memberships m on m.user_id = eb.user_id and m.group_id = gid
  where eb.time_range && search
    and not exists (
      select 1 from external_busy_ignores i
      where i.source_id = eb.source_id and i.uid = eb.uid
        and (i.occurrence is null or i.occurrence = lower(eb.time_range))
    );
end;
$$;
