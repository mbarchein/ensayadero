-- Add PARTY to the group_type enum: a party/celebration group. Its wording
-- (host / guest, "festejo") lives in the app locale; only the enum value is
-- persisted. Adding a value is signature-preserving, so update_group_meta and
-- the other functions typed on group_type need no change.
alter type group_type add value if not exists 'PARTY' after 'SPORTS';
