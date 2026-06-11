-- First-login onboarding: the /welcome wizard (name, pronoun, email
-- preferences, availability pitch) shows until profiles.onboarded_at is set.
-- Timestamp instead of a boolean: when it was completed is free metadata and
-- allows re-running the wizard later by nulling it. Backfill existing users
-- so only genuinely new accounts see the wizard.

alter table public.profiles
  add column if not exists onboarded_at timestamptz;

update public.profiles set onboarded_at = now() where onboarded_at is null;
