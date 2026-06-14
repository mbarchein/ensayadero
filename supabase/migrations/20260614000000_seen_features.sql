-- Per-user feature-discovery flags, decoupled from the one-time onboarding gate
-- (profiles.onboarded_at). A jsonb array of feature keys the user has already
-- seen/dismissed; the app shows a "what's new" callout for any key not yet
-- present and appends it on dismiss. Cross-device and reinstall-proof, unlike
-- the localStorage-based Tip. Lets us surface features added after a user
-- finished onboarding without ever resetting onboarded_at.

alter table public.profiles
  add column if not exists seen_features jsonb not null default '[]'::jsonb;

-- Atomic, idempotent append: two devices dismissing different callouts at once
-- can't clobber each other (a plain update would overwrite the whole array).
-- Scoped to the caller's own row; no-op when the key is already present.
create or replace function public.mark_feature_seen(feature text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set seen_features = seen_features || to_jsonb(feature)
   where id = auth.uid()
     and not (seen_features ? feature);
$$;

grant execute on function public.mark_feature_seen(text) to authenticated;
