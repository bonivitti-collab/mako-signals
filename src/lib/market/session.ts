const NY = "America/New_York";

function nyCalendar(now: Date): { y: number; m: number; d: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day"), hour: get("hour"), minute: get("minute") };
}

function isoUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** Last NYSE session that has already closed (16:15 America/New_York). Weekends roll back to Friday. */
export function lastCompletedSession(now = new Date()): string {
  const ny = nyCalendar(now);
  const cursor = new Date(Date.UTC(ny.y, ny.m - 1, ny.d));
  const afterClose = ny.hour > 16 || (ny.hour === 16 && ny.minute >= 15);
  if (isWeekend(cursor) || !afterClose) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (isWeekend(cursor)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  return isoUTC(cursor);
}

export function isScanStale(asOf: string, now = new Date()): boolean {
  if (!asOf) return true;
  return asOf < lastCompletedSession(now);
}
