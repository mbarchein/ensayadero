import { describe, expect, it } from 'vitest'
import { formatRange, overlaps, parseRange, subtract } from './ranges'

describe('parseRange', () => {
  it('parsea formato Postgres con comillas', () => {
    const r = parseRange('["2026-06-07 10:00:00+00","2026-06-07 12:00:00+00")')
    expect(r.start.toISOString()).toBe('2026-06-07T10:00:00.000Z')
    expect(r.end.toISOString()).toBe('2026-06-07T12:00:00.000Z')
  })

  it('parsea formato ISO sin comillas (round-trip de formatRange)', () => {
    const literal = formatRange(new Date('2026-06-07T10:00:00Z'), new Date('2026-06-07T12:00:00Z'))
    const r = parseRange(literal)
    expect(r.start.toISOString()).toBe('2026-06-07T10:00:00.000Z')
    expect(r.end.toISOString()).toBe('2026-06-07T12:00:00.000Z')
  })

  it('lanza con literal inválido', () => {
    expect(() => parseRange('basura')).toThrow()
  })
})

describe('overlaps', () => {
  const base = { start: new Date('2026-06-07T10:00Z'), end: new Date('2026-06-07T12:00Z') }
  it('detecta solape parcial', () => {
    expect(overlaps(base, { start: new Date('2026-06-07T11:00Z'), end: new Date('2026-06-07T13:00Z') })).toBe(true)
  })
  it('rangos contiguos NO solapan (semiabierto)', () => {
    expect(overlaps(base, { start: new Date('2026-06-07T12:00Z'), end: new Date('2026-06-07T13:00Z') })).toBe(false)
  })
})

describe('subtract', () => {
  const base = { start: new Date('2026-06-07T10:00Z'), end: new Date('2026-06-07T14:00Z') }

  it('agujero en medio → dos fragmentos', () => {
    const out = subtract(base, [{ start: new Date('2026-06-07T11:00Z'), end: new Date('2026-06-07T12:00Z') }])
    expect(out).toHaveLength(2)
    expect(out[0].end.toISOString()).toBe('2026-06-07T11:00:00.000Z')
    expect(out[1].start.toISOString()).toBe('2026-06-07T12:00:00.000Z')
  })

  it('ocupación cubre todo → vacío', () => {
    const out = subtract(base, [{ start: new Date('2026-06-07T09:00Z'), end: new Date('2026-06-07T15:00Z') }])
    expect(out).toHaveLength(0)
  })

  it('sin solape → intacto', () => {
    const out = subtract(base, [{ start: new Date('2026-06-07T15:00Z'), end: new Date('2026-06-07T16:00Z') }])
    expect(out).toEqual([base])
  })
})
