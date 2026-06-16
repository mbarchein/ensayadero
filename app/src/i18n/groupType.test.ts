// Guards the group-type wording across every type and both languages: no base
// string that adapts to the type may leak a glossary placeholder once resolved,
// and the es/en key trees must stay aligned. This is the automated stand-in for
// "walk every screen per type and check for weird/misaligned strings": every
// activity/role placeholder is exercised through the real tg/tByType/roleLabel
// resolution path against the real locale files.

import { describe, it, expect } from 'vitest'
import { createInstance, type i18n as I18n } from 'i18next'
import es from './es.json'
import en from './en.json'
import { tg, tByType } from '../lib/glossary'
import { roleLabel, roleActionLabel } from '../lib/roleLabel'
import type { GroupType, GroupRole } from '../lib/types'

const TYPES: GroupType[] = ['THEATRE', 'MUSIC', 'DANCE', 'SPORTS', 'OTHER']
const LANGS = ['es', 'en'] as const
// The only placeholders our feature injects; {{count}}/{{name}}/{{group}} are
// legitimately left for the caller and must NOT be flagged.
const GLOSSARY_TOKENS = /\{\{(act|actPl|Act|ActPl|leader|member)\}\}/

function makeI18n(lng: string): I18n {
  const inst = createInstance()
  inst.init({
    lng,
    resources: { es: { translation: es }, en: { translation: en } },
    fallbackLng: 'es',
    interpolation: { escapeValue: false },
  })
  return inst
}

// Collect every leaf key whose value contains a glossary placeholder, except
// the glossary/byType definitions themselves.
function placeholderKeys(obj: unknown, prefix = ''): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') {
      if (GLOSSARY_TOKENS.test(v)) out.push(path)
    } else if (v && typeof v === 'object') {
      out.push(...placeholderKeys(v, path))
    }
  }
  return out
}

function keyTree(obj: unknown, prefix = ''): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') out.push(...keyTree(v, path))
    else out.push(path)
  }
  return out.sort()
}

describe('group-type wording', () => {
  it('es and en have identical key trees', () => {
    expect(keyTree(es)).toEqual(keyTree(en))
  })

  it('glossary defines every form for all types in both languages', () => {
    for (const lang of LANGS) {
      const g = (lang === 'es' ? es : en).glossary as Record<string, Record<string, string>>
      for (const type of TYPES) {
        for (const form of ['act', 'actPl', 'Act', 'ActPl', 'leader', 'member']) {
          expect(g[type]?.[form], `glossary.${type}.${form} (${lang})`).toBeTruthy()
        }
      }
    }
  })

  for (const lang of LANGS) {
    const t = makeI18n(lang).t.bind(makeI18n(lang))
    const keys = placeholderKeys(lang === 'es' ? es : en).filter(
      (k) => !k.startsWith('glossary.') && !k.startsWith('byType.'),
    )

    it(`[${lang}] resolves all activity placeholders for every type`, () => {
      expect(keys.length).toBeGreaterThan(40) // sanity: we are actually scanning
      for (const type of TYPES) {
        for (const key of keys) {
          const out = tg(t, key, type, { count: 1, name: 'X', group: 'G' })
          expect(GLOSSARY_TOKENS.test(out), `${key} @ ${type} (${lang}) → "${out}"`).toBe(false)
          expect(out.length).toBeGreaterThan(0)
        }
      }
    })

    it(`[${lang}] resolves welcome copy for every type`, () => {
      const welcomeKeys = ['title0', 'sub0', 'pronounHint', 'title1', 'title2', 'sub2']
      for (const type of TYPES) {
        for (const k of welcomeKeys) {
          const out = tByType(t, `welcome.${k}`, type)
          expect(GLOSSARY_TOKENS.test(out), `welcome.${k} @ ${type} (${lang})`).toBe(false)
          expect(out.length).toBeGreaterThan(0)
        }
      }
    })

    it(`[${lang}] resolves role labels for every type, role and gender`, () => {
      const roles: GroupRole[] = ['INSTRUCTOR', 'ACTOR']
      const genders: (('F' | 'M') | null)[] = ['F', 'M', null]
      for (const type of TYPES) {
        for (const role of roles) {
          for (const gender of genders) {
            const label = roleLabel(t, role, gender, type)
            expect(label.length, `roleLabel ${role}/${gender} @ ${type} (${lang})`).toBeGreaterThan(0)
            expect(label.startsWith('roles.')).toBe(false) // not an unresolved key
          }
          const action = roleActionLabel(t, role, type)
          expect(action.startsWith('roles.')).toBe(false)
          expect(action.length).toBeGreaterThan(0)
        }
      }
    })
  }
})
