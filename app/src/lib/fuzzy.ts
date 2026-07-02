// Tiny fuzzy matcher for quick client-side filters (no dependency): accent and
// case insensitive, VS Code-style subsequence matching. rank() lets callers
// put literal substring hits before looser subsequence hits.

/** Lowercase and strip diacritics: "Música" → "musica". */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

/** 2 = substring match, 1 = subsequence match ("dnya" ⊂ "despedida Naya"), 0 = none. */
export function fuzzyRank(query: string, target: string): 0 | 1 | 2 {
  const q = normalizeText(query.trim())
  if (!q) return 2
  const t = normalizeText(target)
  if (t.includes(q)) return 2
  let i = 0
  for (const ch of t) {
    if (ch === q[i]) i++
    if (i === q.length) return 1
  }
  return 0
}
