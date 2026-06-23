import { describe, it, expect } from 'vitest'
import { visibleParticipants } from './participants'
import type { Profile } from './types'

const prof = (id: string): Profile => ({ id, name: id } as Profile)

// Regression guard for the session-detail crash: a participant whose profile is
// hidden by RLS arrives with profiles === null and must never reach rendering.
describe('visibleParticipants', () => {
  it('drops participants whose profile is null (RLS-hidden ex-member)', () => {
    const list = [
      { user_id: 'a', profiles: prof('a') },
      { user_id: 'b', profiles: null },
      { user_id: 'c', profiles: prof('c') },
    ]
    expect(visibleParticipants(list).map((p) => p.user_id)).toEqual(['a', 'c'])
  })

  it('keeps everyone when all profiles are visible', () => {
    const list = [{ profiles: prof('a') }, { profiles: prof('b') }]
    expect(visibleParticipants(list)).toHaveLength(2)
  })

  it('returns empty for empty input', () => {
    expect(visibleParticipants([])).toHaveLength(0)
  })
})
