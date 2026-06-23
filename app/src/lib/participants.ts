import type { Profile } from './types'

// The profiles RLS policy only exposes users you currently share a group with.
// A session can still list a participant you no longer share a group with (e.g.
// someone removed from the group but kept on an older session); for those the
// embedded `profiles` comes back null. Such rows can't be rendered (no name,
// avatar…) and aren't actionable, so callers drop them with this helper.
export function visibleParticipants<T extends { profiles: Profile | null }>(list: T[]): T[] {
  return list.filter((p) => p.profiles != null)
}
