/** Local-time date key, e.g. "2026-09-28". */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight at the start of the next day (DST-safe). */
export function startOfNextLocalDay(ts: number): number {
  const d = new Date(startOfLocalDay(ts));
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Same local clock time on the previous calendar day (DST-safe). */
export function previousDay(ts: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() - 1);
  return d.getTime();
}
