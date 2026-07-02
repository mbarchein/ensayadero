// Tiny fuzzy matcher for quick client-side filters (no dependency): accent and
// case insensitive, VS Code-style subsequence matching. rank lets callers put
// literal substring hits before looser subsequence hits; indices point at the
// matched code points of the ORIGINAL target so the UI can highlight them.

/** Lowercase and strip diacritics: "Música" → "musica". */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

export interface FuzzyMatch {
  /** 2 = substring match, 1 = subsequence match ("dnya" ⊂ "despedida Naya"), 0 = none. */
  rank: 0 | 1 | 2
  /** Code-point positions (Array.from indexing) of the matched chars in `target`. */
  indices: number[]
}

export function fuzzyMatch(query: string, target: string): FuzzyMatch {
  const q = normalizeText(query.trim())
  if (!q) return { rank: 2, indices: [] }

  // Normalize per code point, keeping a map normalized-pos → original-pos so
  // accented originals ("Música") can be highlighted from a plain query.
  const chars = [...target]
  let norm = ''
  const map: number[] = []
  chars.forEach((ch, i) => {
    for (const c of normalizeText(ch)) {
      norm += c
      map.push(i)
    }
  })

  const at = norm.indexOf(q)
  if (at >= 0) return { rank: 2, indices: [...new Set(map.slice(at, at + q.length))] }

  const indices: number[] = []
  let qi = 0
  for (let ni = 0; ni < norm.length && qi < q.length; ni++) {
    if (norm[ni] === q[qi]) {
      indices.push(map[ni])
      qi++
    }
  }
  return qi === q.length ? { rank: 1, indices } : { rank: 0, indices: [] }
}

/** Rank only, for callers that don't highlight. */
export function fuzzyRank(query: string, target: string): 0 | 1 | 2 {
  return fuzzyMatch(query, target).rank
}
