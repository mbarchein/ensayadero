import type { TFunction } from 'i18next'
import type { GroupRole, GroupType } from './types'

// Role wording adapts to the group type (director/coach/coordinator…). Each
// per-type override falls back to the THEATRE base, so a type that doesn't
// redefine a key (e.g. MUSIC keeps "Director") still resolves.
function rolesKey(k: string, type?: GroupType): string | string[] {
  return type && type !== 'THEATRE' ? [`roles.${type}.${k}`, `roles.${k}`] : `roles.${k}`
}

/** Role label adapted to gender (F/M) and group type; neutral if none given. */
export function roleLabel(
  t: TFunction,
  role: GroupRole,
  gender?: 'F' | 'M' | null,
  type?: GroupType,
): string {
  return t(rolesKey(gender ? `${role}_${gender}` : role, type))
}

/** Label for the action that switches a member to the opposite role. */
export function roleActionLabel(t: TFunction, currentRole: GroupRole, type?: GroupType): string {
  return t(rolesKey(currentRole === 'INSTRUCTOR' ? 'toActor' : 'toInstructor', type))
}
