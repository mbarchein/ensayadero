import type { TFunction } from 'i18next'
import type { GroupRole } from './types'

/** Etiqueta de rol adaptada al género (F/M); neutra si no hay género. */
export function roleLabel(t: TFunction, role: GroupRole, gender?: 'F' | 'M' | null): string {
  return t(gender ? `roles.${role}_${gender}` : `roles.${role}`)
}
