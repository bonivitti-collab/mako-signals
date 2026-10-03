const TZ = "America/Sao_Paulo";
const HOUR = 20;

export const UPDATE_SLOT_KEY = "mako-update-slot";

type Civil = {
  y: number;
  m: number;
  d: number;
  hour: number;
  minute: number;
  second: number;
};

function civil(now: Date): Civil {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    y: get("year"),
    m: get("month"),
    d: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function weekday(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function isBusinessDay(y: number, m: number, d: number): boolean {
  const day = weekday(y, m, d);
  return day !== 0 && day !== 6;
}

function addDays(y: number, m: number, d: number, n: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function zonedToUtc(y: number, m: number, d: number, hour: number, minute: number): Date {
  const utcGuess = Date.UTC(y, m - 1, d, hour, minute, 0);
  const offsetAt = (ms: number) => {
    const c = civil(new Date(ms));
    const asUtc = Date.UTC(c.y, c.m - 1, c.d, c.hour, c.minute, c.second);
    return asUtc - ms;
  };
  let utc = utcGuess - offsetAt(utcGuess);
  utc = utcGuess - offsetAt(utc);
  return new Date(utc);
}

/** Next weekday 20:00 America/Sao_Paulo. At the exact second, this is now; a second later it rolls forward. */
export function nextUpdateAt(now = new Date()): Date {
  const c = civil(now);
  let cursor = { y: c.y, m: c.m, d: c.d };
  const stillToday =
    isBusinessDay(c.y, c.m, c.d) &&
    (c.hour < HOUR || (c.hour === HOUR && c.minute === 0 && c.second === 0));
  if (!stillToday) cursor = addDays(cursor.y, cursor.m, cursor.d, 1);
  while (!isBusinessDay(cursor.y, cursor.m, cursor.d)) {
    cursor = addDays(cursor.y, cursor.m, cursor.d, 1);
  }
  return zonedToUtc(cursor.y, cursor.m, cursor.d, HOUR, 0);
}

/** Today's 20:00 slot once that instant has been reached on a weekday. */
export function dueSlot(now = new Date()): Date | null {
  const c = civil(now);
  if (!isBusinessDay(c.y, c.m, c.d)) return null;
  const slot = zonedToUtc(c.y, c.m, c.d, HOUR, 0);
  if (now.getTime() + 250 < slot.getTime()) return null;
  return slot;
}

export function countdownLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

export function formatUpdateWhen(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(date);
}
