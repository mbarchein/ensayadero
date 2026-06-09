export type PlatformRole = 'USER' | 'SUPERADMIN'
export type GroupRole = 'INSTRUCTOR' | 'ACTOR'
export type AvailabilityKind = 'AVAILABLE' | 'PREFERRED'
export type SessionStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED'
export type ParticipantResponse = 'PENDING' | 'ACCEPTED' | 'DECLINED'

export interface Profile {
  id: string
  email: string
  name: string
  phone: string | null
  gender: 'F' | 'M' | null
  avatar_url: string | null
  platform_role: PlatformRole
}

export interface Group {
  id: string
  name: string
  archived_at: string | null
  created_at: string
  join_code: string
  join_enabled: boolean
  avatar_seed: string | null
  avatar_image: string | null
}

export interface Membership {
  user_id: string
  group_id: string
  role: GroupRole
  joined_at: string
}

export interface MembershipWithGroup extends Membership {
  groups: Group
}

export interface MembershipWithProfile extends Membership {
  profiles: Profile
}

export interface Invitation {
  id: string
  group_id: string
  email: string
  role: GroupRole
  token: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

export interface Availability {
  id: string
  user_id: string
  time_range: string // literal tstzrange de Postgres
  kind: AvailabilityKind
  rrule: string | null
  exception_dates: string[] | null
}

export interface Subgroup {
  id: string
  group_id: string
  name: string
}

export interface Session {
  id: string
  group_id: string
  short_code: string
  comments: string | null
  location: string | null
  time_range: string
  status: SessionStatus
  created_by: string
  created_at: string
}

export interface SessionParticipant {
  session_id: string
  user_id: string
  required: boolean
  response: ParticipantResponse
}

export interface SessionWithParticipants extends Session {
  session_participants: (SessionParticipant & { profiles: Profile })[]
}

export interface Notification {
  id: string
  user_id: string
  group_id: string | null
  type: string
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}
