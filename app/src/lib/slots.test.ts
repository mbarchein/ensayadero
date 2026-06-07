import { describe, expect, it } from 'vitest'
import { formatRange } from './ranges'
import {
  expandAvailability,
  fullCoverageRanges,
  heatmap,
  weekGrid,
  weekStart,
  SLOTS_PER_DAY,
  DAY_START_HOUR,
} from './slots'
import type { Availability } from './types'

// reference week: Monday 2026-06-08 (local)
const MONDAY = weekStart(new Date(2026, 5, 10)) // Wednesday Jun 10 → Monday Jun 8

function av(partial: Partial<Availability> & { time_range: string }): Availability {
  return {
    id: crypto.randomUUID(),
    user_id: 'u1',
    kind: 'AVAILABLE',
    rrule: null,
    exception_dates: null,
    ...partial,
  }
}

function localRange(day: number, hStart: number, hEnd: number): string {
  const s = new Date(MONDAY)
  s.setDate(s.getDate() + day)
  s.setHours(hStart, 0, 0, 0)
  const e = new Date(s)
  e.setHours(hEnd)
  return formatRange(s, e)
}

describe('expandAvailability', () => {
  it('one-off within the window → 1 interval', () => {
    const a = av({ time_range: localRange(1, 18, 21) })
    const out = expandAvailability(a, MONDAY, addDays(MONDAY, 7))
    expect(out).toHaveLength(1)
  })

  it('weekly recurrence appears in future weeks', () => {
    const a = av({ time_range: localRange(1, 18, 21), rrule: 'FREQ=WEEKLY' })
    const nextWeek = addDays(MONDAY, 7)
    const out = expandAvailability(a, nextWeek, addDays(nextWeek, 7))
    expect(out).toHaveLength(1)
    expect(out[0].start.getDay()).toBe(2) // Tuesday
  })

  it('respects exceptions', () => {
    const a = av({ time_range: localRange(1, 18, 21), rrule: 'FREQ=WEEKLY' })
    const occurrence = expandAvailability(a, MONDAY, addDays(MONDAY, 7))[0]
    const exDate = isoDay(occurrence.start)
    const withEx = av({ ...a, exception_dates: [exDate] })
    expect(expandAvailability(withEx, MONDAY, addDays(MONDAY, 7))).toHaveLength(0)
  })
})

describe('weekGrid', () => {
  it('marks the correct slots', () => {
    const grid = weekGrid([av({ time_range: localRange(0, 18, 20) })], MONDAY)
    const slot18 = (18 - DAY_START_HOUR) * 2
    expect(grid[0][slot18]).toBe('AVAILABLE')
    expect(grid[0][slot18 + 3]).toBe('AVAILABLE') // 19:30
    expect(grid[0][slot18 + 4]).toBe('NONE') // 20:00
    expect(grid[1][slot18]).toBe('NONE') // another day
  })

  it('PREFERRED overrides AVAILABLE', () => {
    const grid = weekGrid(
      [
        av({ time_range: localRange(0, 18, 20) }),
        av({ time_range: localRange(0, 18, 19), kind: 'PREFERRED' }),
      ],
      MONDAY,
    )
    const slot18 = (18 - DAY_START_HOUR) * 2
    expect(grid[0][slot18]).toBe('PREFERRED')
    expect(grid[0][slot18 + 2]).toBe('AVAILABLE')
  })
})

describe('heatmap (D1: busy-time discount)', () => {
  it('a user busy with a confirmed session does not count as available', () => {
    const busyStart = new Date(MONDAY)
    busyStart.setDate(busyStart.getDate())
    busyStart.setHours(18, 0, 0, 0)
    const busyEnd = new Date(busyStart)
    busyEnd.setHours(20)

    const grid = heatmap(
      [
        { userId: 'a', availabilities: [av({ user_id: 'a', time_range: localRange(0, 18, 22) })], busy: [] },
        {
          userId: 'b',
          availabilities: [av({ user_id: 'b', time_range: localRange(0, 18, 22) })],
          busy: [{ start: busyStart, end: busyEnd }],
        },
      ],
      MONDAY,
    )
    const slot18 = (18 - DAY_START_HOUR) * 2
    const slot20 = (20 - DAY_START_HOUR) * 2
    expect(grid[0][slot18].available).toEqual(['a'])
    expect(grid[0][slot18].busy).toEqual(['b']) // painted but busy
    expect(grid[0][slot20].available.sort()).toEqual(['a', 'b']) // after the session, free
  })
})

describe('fullCoverageRanges', () => {
  it('finds a slot where all required participants overlap', () => {
    const grid = heatmap(
      [
        { userId: 'a', availabilities: [av({ user_id: 'a', time_range: localRange(2, 17, 21) })], busy: [] },
        { userId: 'b', availabilities: [av({ user_id: 'b', time_range: localRange(2, 18, 22) })], busy: [] },
      ],
      MONDAY,
    )
    const ranges = fullCoverageRanges(grid, ['a', 'b'], MONDAY)
    expect(ranges).toHaveLength(1)
    expect(ranges[0].start.getHours()).toBe(18)
    expect(ranges[0].end.getHours()).toBe(21)
  })

  it('no intersection → empty', () => {
    const grid = heatmap(
      [
        { userId: 'a', availabilities: [av({ user_id: 'a', time_range: localRange(2, 10, 12) })], busy: [] },
        { userId: 'b', availabilities: [av({ user_id: 'b', time_range: localRange(2, 18, 22) })], busy: [] },
      ],
      MONDAY,
    )
    expect(fullCoverageRanges(grid, ['a', 'b'], MONDAY)).toHaveLength(0)
  })
})

it('SLOTS_PER_DAY is consistent', () => {
  expect(SLOTS_PER_DAY).toBe(30)
})

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
