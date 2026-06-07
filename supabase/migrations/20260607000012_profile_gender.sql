-- Optional gender to adapt the role (actor/actress, director).
alter table public.profiles add column if not exists gender text check (gender in ('F','M'));
