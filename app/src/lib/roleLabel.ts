import type { TFunction } from 'i18next'
import type { GroupRole } from './types'

/** Role label adapted to gender (F/M); neutral if no gender is provided. */
export function roleLabel(t: TFunction, role: GroupRole, gender?: 'F' | 'M' | null): string {
  return t(gender ? `roles.${role}_${gender}` : `roles.${role}`)
}
