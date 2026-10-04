-- Calendar import: the scheduled sync's progress. Each run takes the calendars
-- in order of their last finished attempt (ok or failed) and goes on until it
-- finishes or the runtime kills it; the next run continues from there, the
-- ones cut off mid-download first. A feed that fails (or times out) moves to
-- the back of the queue instead of blocking the others. Server-only: not
-- granted to clients.

alter table public.calendar_sources add column last_attempt_at timestamptz;

drop index public.calendar_sources_sync;
create index calendar_sources_sync on public.calendar_sources (last_attempt_at nulls first);
