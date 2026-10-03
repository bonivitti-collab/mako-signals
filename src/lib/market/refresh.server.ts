import universe from "../../data/sp500.json";
import type { Bar, ScanResult, Series } from "@/lib/swing/types";

type Constituent = { symbol: string; name: string; sector: string };

const LIST = universe as Constituent[];
const CHUNK = 40;
const CONCURRENCY = 8;
const FROM = "2024-10-01";

let cached: ScanResult | null = null;

export function readCachedScan(): ScanResult | null {
  return cached;
}

export function rememberScan(scan: ScanResult): void {
  cached = scan;
}

export type QuoteChunk = {
  total: number;
  offset: number;
  next: number | null;
  series: Series[];
};

type NasdaqFile = {
  data?: {
    tradesTable?: {
      rows?: Array<{
        date?: string;
        open?: string;
        high?: string;
        low?: string;
        close?: string;
      }>;
    };
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePrice(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseWhen(value: string | undefined): number | null {
  if (!value) return null;
  const [m, d, y] = value.split("/").map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d, 20, 0, 0) / 1000;
}

function rowsToBars(rows: NonNullable<NonNullable<NasdaqFile["data"]>["tradesTable"]>["rows"]): Bar[] {
  const bars: Bar[] = [];
  for (const row of rows ?? []) {
    const t = parseWhen(row.date);
    const o = parsePrice(row.open);
    const h = parsePrice(row.high);
    const l = parsePrice(row.low);
    const c = parsePrice(row.close);
    if (t == null || o == null || h == null || l == null || c == null) continue;
    bars.push({ t, o, h, l, c });
  }
  bars.reverse();
  return bars;
}

async function fetchSymbol(row: Constituent, attempt = 0): Promise<Series> {
  const query = row.symbol.replace(/-/g, ".");
  const to = new Date().toISOString().slice(0, 10);
  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(query)}/historical?assetclass=stocks&fromdate=${FROM}&todate=${to}&limit=600`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    signal: AbortSignal.timeout(25_000),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 2) {
    await sleep(400 * (attempt + 1));
    return fetchSymbol(row, attempt + 1);
  }
  if (!res.ok) {
    return { symbol: row.symbol, name: row.name, sector: row.sector, bars: [] };
  }
  const json = (await res.json()) as NasdaqFile;
  return {
    symbol: row.symbol,
    name: row.name,
    sector: row.sector,
    bars: rowsToBars(json.data?.tradesTable?.rows),
  };
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

export async function fetchChunk(offset: number): Promise<QuoteChunk> {
  const start = Math.max(0, Math.min(offset, LIST.length));
  const slice = LIST.slice(start, start + CHUNK);
  const series = await mapPool(slice, CONCURRENCY, (row) => fetchSymbol(row));
  const next = start + CHUNK < LIST.length ? start + CHUNK : null;
  return {
    total: LIST.length,
    offset: start,
    next,
    series: series.filter((s) => s.bars.length > 0),
  };
}
