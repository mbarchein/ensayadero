-- Género opcional para adaptar el rol (actor/actriz, director/directora).
alter table public.profiles add column if not exists gender text check (gender in ('F','M'));
