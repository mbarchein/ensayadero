-- ============================================================
-- Opening up permissions + per-user archiving
--  - Any authenticated user can create groups (becomes INSTRUCTOR)
--  - Any member of a group can create rehearsals (its creator or the
--    director edits/cancels them)
--  - Co-members can read their group's availability (previously
--    only the director) — needed so anyone can plan
--  - Per-user archiving of cancelled/past rehearsals
-- ============================================================

-- ── Groups: creator and auto-membership ─────────────────────
alter table public.groups
  add column if not exists created_by uuid references public.profiles (id) default auth.uid();

create or replace function public.handle_new_group()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into public.memberships (user_id, group_id, role)
    values (new.created_by, new.id, 'INSTRUCTOR')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_group_created
  after insert on public.groups
  for each row execute function public.handle_new_group();

create policy groups_insert on public.groups for insert
  to authenticated with check (created_by = auth.uid());

-- ── Availability: read access for any co-member ─────────────
drop policy if exists availabilities_instructor_read on public.availabilities;
create policy availabilities_comember_read on public.availabilities for select using (
  exists (
    select 1 from memberships m_self
    join memberships m_other on m_other.group_id = m_self.group_id
    where m_self.user_id = auth.uid()
      and m_other.user_id = availabilities.user_id
  )
);

-- ── Sessions: any member creates; creator or director modifies ──
drop policy if exists sessions_manage on public.sessions;
create policy sessions_insert on public.sessions for insert
  with check (is_member(auth.uid(), group_id) and created_by = auth.uid());
create policy sessions_update on public.sessions for update
  using (is_instructor(auth.uid(), group_id) or created_by = auth.uid());
create policy sessions_delete on public.sessions for delete
  using (is_instructor(auth.uid(), group_id) or created_by = auth.uid());

drop policy if exists sp_manage on public.session_participants;
create policy sp_manage on public.session_participants for all using (
  exists (
    select 1 from sessions s
    where s.id = session_id
      and (is_instructor(auth.uid(), s.group_id) or s.created_by = auth.uid())
  )
);

-- ── Per-user archiving ──────────────────────────────────────
create table if not exists public.session_archives (
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  archived_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

alter table public.session_archives enable row level security;
create policy archives_own on public.session_archives for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
