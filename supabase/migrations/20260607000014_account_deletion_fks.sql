-- Self-account deletion (delete_my_account) cascades auth.users → profiles.
-- Several created_by/actor_id FKs referenced profiles without an ON DELETE
-- rule, so deleting a profile raised a foreign-key violation. Relax them:
--  - invitations: drop the pending invites the user created
--  - sessions / audit_log / groups: keep the row, null out the creator/actor

-- invitations.created_by → cascade
alter table public.invitations drop constraint if exists invitations_created_by_fkey;
alter table public.invitations
  add constraint invitations_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete cascade;

-- sessions.created_by → keep the rehearsal, clear the creator
alter table public.sessions alter column created_by drop not null;
alter table public.sessions drop constraint if exists sessions_created_by_fkey;
alter table public.sessions
  add constraint sessions_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

-- audit_log.actor_id → keep the record, clear the actor
alter table public.audit_log alter column actor_id drop not null;
alter table public.audit_log drop constraint if exists audit_log_actor_id_fkey;
alter table public.audit_log
  add constraint audit_log_actor_id_fkey
  foreign key (actor_id) references public.profiles (id) on delete set null;

-- groups.created_by (already nullable) → clear the creator
alter table public.groups drop constraint if exists groups_created_by_fkey;
alter table public.groups
  add constraint groups_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;
