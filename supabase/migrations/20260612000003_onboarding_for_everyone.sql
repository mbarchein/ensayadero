-- Product decision: EVERY existing user goes through the onboarding wizard,
-- not just new accounts — it doubles as the announcement of the new pronoun
-- and email-preference settings. Reverses the conservative backfill from
-- 20260612000002 (users who already completed the wizard between both
-- migrations redo it; acceptable one-time cost).

update public.profiles set onboarded_at = null;
