import { describe, it, expect } from 'vitest'
import { fuzzyRank, normalizeText } from './fuzzy'

describe('normalizeText', () => {
  it('lowercases and strips diacritics', () => {
    expect(normalizeText('MÚSICA')).toBe('musica')
    expect(normalizeText('Coreógrafo')).toBe('coreografo')
  })
})

describe('fuzzyRank', () => {
  it('empty query matches everything (rank 2)', () => {
    expect(fuzzyRank('', 'Teatro')).toBe(2)
    expect(fuzzyRank('   ', 'Teatro')).toBe(2)
  })

  it('substring beats subsequence', () => {
    expect(fuzzyRank('tro', 'Teatro Real')).toBe(2) // "Tea[tro]"
    expect(fuzzyRank('tea', 'Tertulia santa')).toBe(1) // T..e..a in order
  })

  it('is accent and case insensitive both ways', () => {
    expect(fuzzyRank('musica', 'Grupo de Música')).toBe(2)
    expect(fuzzyRank('MÚSICA', 'musica y danza')).toBe(2)
  })

  it('matches subsequences across words', () => {
    expect(fuzzyRank('dnya', 'despedida Naya')).toBe(1)
  })

  it('rejects out-of-order and missing characters', () => {
    expect(fuzzyRank('ort', 'tro')).toBe(0)
    expect(fuzzyRank('xyz', 'Teatro')).toBe(0)
  })
})
