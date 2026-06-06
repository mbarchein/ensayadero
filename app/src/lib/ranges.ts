// Parseo y formateo de literales tstzrange de Postgres.
// Postgres devuelve: ["2026-06-07 10:00:00+00","2026-06-07 12:00:00+00")

export interface TimeRange {
  start: Date
  end: Date
}

export function parseRange(literal: string): TimeRange {
  const m = literal.match(/^[[(]"?([^",]+)"?,"?([^")]+)"?[)\]]$/)
  if (!m) throw new Error(`tstzrange inválido: ${literal}`)
  return { start: pgDate(m[1]), end: pgDate(m[2]) }
}

function pgDate(s: string): Date {
  // "2026-06-07 10:00:00+00" → ISO ("+00" → "+00:00", JS no acepta offset corto)
  let iso = s.trim().replace(' ', 'T')
  if (/[+-]\d{2}$/.test(iso)) iso += ':00'
  else if (!/[+-]\d{2}:\d{2}$|Z$/.test(iso)) iso += 'Z'
  const d = new Date(iso)
  if (isNaN(d.getTime())) throw new Error(`fecha inválida: ${s}`)
  return d
}

/** Formatea para insertar: '[ISO,ISO)' */
export function formatRange(start: Date, end: Date): string {
  return `[${start.toISOString()},${end.toISOString()})`
}

export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && b.start < a.end
}

export function contains(outer: TimeRange, inner: TimeRange): boolean {
  return outer.start <= inner.start && inner.end <= outer.end
}

/** Resta busy de base. Devuelve fragmentos restantes de base. */
export function subtract(base: TimeRange, busy: TimeRange[]): TimeRange[] {
  let fragments: TimeRange[] = [base]
  for (const b of busy) {
    const next: TimeRange[] = []
    for (const f of fragments) {
      if (!overlaps(f, b)) {
        next.push(f)
        continue
      }
      if (f.start < b.start) next.push({ start: f.start, end: b.start })
      if (b.end < f.end) next.push({ start: b.end, end: f.end })
    }
    fragments = next
  }
  return fragments
}
