import type { Bar } from "./types";

export function sma(values: number[], len: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (len <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= len) sum -= values[i - len]!;
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

export function rsi(values: number[], len: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (values.length <= len) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= len; i++) {
    const d = values[i]! - values[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / len;
  let avgLoss = loss / len;
  out[len] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = len + 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (len - 1) + g) / len;
    avgLoss = (avgLoss * (len - 1) + l) / len;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function atr(bars: Bar[], len: number): Array<number | null> {
  const out: Array<number | null> = Array(bars.length).fill(null);
  if (bars.length === 0) return out;
  const tr: number[] = Array(bars.length).fill(0);
  tr[0] = bars[0]!.h - bars[0]!.l;
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1]!.c;
    const b = bars[i]!;
    tr[i] = Math.max(b.h - b.l, Math.abs(b.h - prev), Math.abs(b.l - prev));
  }
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += tr[i]!;
    if (i >= len) sum -= tr[i - len]!;
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

export function closes(bars: Bar[]): number[] {
  return bars.map((b) => b.c);
}
