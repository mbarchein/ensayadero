-- Optional phone on the profile (group contact).
alter table public.profiles add column if not exists phone text;
