-- ============================================================
-- Esquema inicial: planificador de ensayos de teatro
-- Decisiones: D1 disponibilidad global + ocupaciones cruzadas,
--             D2 superadmin solo estructura,
--             D3 rol por membresía, D4 aislamiento entre grupos,
--             D5 registro solo por invitación.
-- ============================================================

create extension if not exists btree_gist;

-- ── Enums ───────────────────────────────────────────────────
create type platform_role as enum ('USER', 'SUPERADMIN');
create type group_role as enum ('INSTRUCTOR', 'ACTOR');
create type availability_kind as enum ('AVAILABLE', 'PREFERRED');
create type session_status as enum ('DRAFT', 'CONFIRMED', 'CANCELLED');
create type participant_response as enum ('PENDING', 'ACCEPTED', 'DECLINED');
create type notification_channel as enum ('PUSH', 'EMAIL', 'BOTH', 'NONE');

-- ── Perfiles (espejo de auth.users) ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null default '',
  avatar_url text,
  platform_role platform_role not null default 'USER',
  created_at timestamptz not null default now()
);

-- ── Grupos y membresías ─────────────────────────────────────
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.memberships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  role group_role not null default 'ACTOR',
  joined_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  email text not null,
  role group_role not null default 'ACTOR',
  token uuid not null unique default gen_random_uuid(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ── Disponibilidad GLOBAL por usuario (D1) ──────────────────
create table public.availabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  time_range tstzrange not null,
  kind availability_kind not null default 'AVAILABLE',
  rrule text,              -- regla de recurrencia iCal (RFC 5545); null = puntual
  exception_dates date[],  -- excepciones a la recurrencia
  created_at timestamptz not null default now(),
  constraint valid_range check (not isempty(time_range))
);

create index availabilities_user_range on public.availabilities
  using gist (user_id, time_range);

-- ── Subgrupos ("elenco escena 3") ───────────────────────────
create table public.subgroups (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.subgroup_members (
  subgroup_id uuid not null references public.subgroups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (subgroup_id, user_id)
);

-- ── Sesiones de ensayo ──────────────────────────────────────
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null,
  scene text,
  location text,
  time_range tstzrange not null,
  status session_status not null default 'DRAFT',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_range check (not isempty(time_range))
);

create index sessions_group_range on public.sessions using gist (group_id, time_range);

create table public.session_participants (
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  required boolean not null default true,
  response participant_response not null default 'PENDING',
  primary key (session_id, user_id)
);

-- ── Notificaciones ──────────────────────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  type text not null, -- SESSION_CONFIRMED | SESSION_CANCELLED | SESSION_CHANGED | REMINDER | INVITATION
  payload jsonb not null default '{}',
  read_at timestamptz,
  sent_email_at timestamptz,
  sent_push_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_unread on public.notifications (user_id) where read_at is null;

create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,
  channel notification_channel not null default 'BOTH',
  primary key (user_id, event_type)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null, -- {p256dh, auth}
  created_at timestamptz not null default now()
);

-- ── Auditoría superadmin (RF29) ─────────────────────────────
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles (id),
  action text not null,
  target_type text not null,
  target_id text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Funciones helper de autorización
-- ============================================================

create or replace function public.is_superadmin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = uid and platform_role = 'SUPERADMIN'
  );
$$;

create or replace function public.is_member(uid uuid, gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships where user_id = uid and group_id = gid
  );
$$;

create or replace function public.is_instructor(uid uuid, gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where user_id = uid and group_id = gid and role = 'INSTRUCTOR'
  );
$$;

-- ============================================================
-- Trigger: crear perfil al registrarse + gate de invitación (D5)
-- Solo se permite signup si existe invitación pendiente para el email
-- o si el email es el superadmin seed.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  has_invite boolean;
begin
  select exists (
    select 1 from invitations
    where lower(email) = lower(new.email)
      and accepted_at is null
      and expires_at > now()
  ) into has_invite;

  if not has_invite and not exists (select 1 from profiles where platform_role = 'SUPERADMIN') then
    -- bootstrap: primer usuario sin superadmins existentes → ver seed.sql
    has_invite := true;
  end if;

  if not has_invite then
    raise exception 'SIGNUP_REQUIRES_INVITATION';
  end if;

  insert into profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  -- aceptar invitaciones pendientes → crear membresías
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Vista de disponibilidad efectiva (D1):
-- disponibilidad pintada MENOS sesiones confirmadas en CUALQUIER grupo.
-- No expone grupo ni motivo de la ocupación (D2/D4).
-- ============================================================

create or replace function public.busy_ranges(uid uuid, search tstzrange)
returns table (busy tstzrange)
language sql stable security definer set search_path = public as $$
  select s.time_range
  from sessions s
  join session_participants sp on sp.session_id = s.id
  where sp.user_id = uid
    and s.status = 'CONFIRMED'
    and s.time_range && search;
$$;

-- ============================================================
-- RLS
-- ============================================================

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.availabilities enable row level security;
alter table public.subgroups enable row level security;
alter table public.subgroup_members enable row level security;
alter table public.sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.audit_log enable row level security;

-- profiles: el propio, compañeros de grupo, superadmin (estructura)
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or is_superadmin(auth.uid())
  or exists (
    select 1 from memberships m1
    join memberships m2 on m1.group_id = m2.group_id
    where m1.user_id = auth.uid() and m2.user_id = profiles.id
  )
);
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and platform_role = 'USER' or is_superadmin(auth.uid()));

-- groups: miembros y superadmin ven; superadmin crea/archiva
create policy groups_select on public.groups for select using (
  is_member(auth.uid(), id) or is_superadmin(auth.uid())
);
create policy groups_admin on public.groups for all using (is_superadmin(auth.uid()));

-- memberships: visibles dentro del grupo + superadmin; instructor gestiona
create policy memberships_select on public.memberships for select using (
  is_member(auth.uid(), group_id) or is_superadmin(auth.uid())
);
create policy memberships_manage on public.memberships for all using (
  is_instructor(auth.uid(), group_id) or is_superadmin(auth.uid())
);

-- invitations: instructor del grupo + superadmin
create policy invitations_manage on public.invitations for all using (
  is_instructor(auth.uid(), group_id) or is_superadmin(auth.uid())
);

-- availabilities (D1+D2): dueño CRUD; instructores de grupos compartidos SOLO lectura.
-- Superadmin NO tiene política → no ve disponibilidades.
create policy availabilities_own on public.availabilities for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy availabilities_instructor_read on public.availabilities for select using (
  exists (
    select 1 from memberships m_inst
    join memberships m_actor on m_actor.group_id = m_inst.group_id
    where m_inst.user_id = auth.uid()
      and m_inst.role = 'INSTRUCTOR'
      and m_actor.user_id = availabilities.user_id
  )
);

-- subgroups: miembros leen, instructor gestiona
create policy subgroups_select on public.subgroups for select using (
  is_member(auth.uid(), group_id) or is_superadmin(auth.uid())
);
create policy subgroups_manage on public.subgroups for all using (
  is_instructor(auth.uid(), group_id)
);
create policy subgroup_members_select on public.subgroup_members for select using (
  exists (select 1 from subgroups sg where sg.id = subgroup_id
          and (is_member(auth.uid(), sg.group_id) or is_superadmin(auth.uid())))
);
create policy subgroup_members_manage on public.subgroup_members for all using (
  exists (select 1 from subgroups sg where sg.id = subgroup_id
          and is_instructor(auth.uid(), sg.group_id))
);

-- sessions: miembros del grupo leen, instructor gestiona, superadmin lee (estructura)
create policy sessions_select on public.sessions for select using (
  is_member(auth.uid(), group_id) or is_superadmin(auth.uid())
);
create policy sessions_manage on public.sessions for all using (
  is_instructor(auth.uid(), group_id)
);

-- session_participants: visibles en el grupo; instructor gestiona; participante actualiza su response
create policy sp_select on public.session_participants for select using (
  exists (select 1 from sessions s where s.id = session_id
          and (is_member(auth.uid(), s.group_id) or is_superadmin(auth.uid())))
);
create policy sp_manage on public.session_participants for all using (
  exists (select 1 from sessions s where s.id = session_id
          and is_instructor(auth.uid(), s.group_id))
);
create policy sp_respond on public.session_participants for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notifications: solo el destinatario
create policy notifications_own on public.notifications for select using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- preferences y push: solo el dueño
create policy prefs_own on public.notification_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_own on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit_log: solo superadmin lee; escritura desde service role
create policy audit_select on public.audit_log for select using (is_superadmin(auth.uid()));
