import type { TFunction } from 'i18next'
import type { GroupType } from './types'

// Per-type activity vocabulary. Strings that name the scheduled activity use
// {{act}}/{{actPl}} (+ capitalized {{Act}}/{{ActPl}}); tg() injects the right
// nouns for the group type so one base string serves every type. All nouns are
// masculine in Spanish so articles/adjectives in the base strings still agree.
// THEATRE is the implicit default; cross-group/global copy passes 'OTHER' for
// the neutral wording ("evento" / "event").
export function tg(
  t: TFunction,
  key: string | string[],
  type: GroupType | null | undefined,
  opts?: Record<string, unknown>,
): string {
  const g = t(`glossary.${type ?? 'THEATRE'}`, { returnObjects: true }) as Record<string, string>
  return t(key, { ...g, ...opts }) as string
}
