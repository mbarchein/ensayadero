-- Archived notifications: swiped away in the UI — hidden from the list and
-- the unread badge, but kept in the table (history, debugging).

alter table public.notifications
  add column archived_at timestamptz;
