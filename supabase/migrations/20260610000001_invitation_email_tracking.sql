-- Track the last invitation-email delivery attempt. The send-notifications
-- Edge Function stamps email_sent_at on a successful Resend call and stores
-- the failure reason in email_send_error otherwise (cleared on success).
-- Lets the members page show "sent on X" / "never sent" per pending invite.

alter table public.invitations
  add column email_sent_at timestamptz,
  add column email_send_error text;
