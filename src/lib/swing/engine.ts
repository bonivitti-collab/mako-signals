import { atr, closes, rsi, sma } from "./indicators";
import { isoFromUnix } from "./format";
import type {
  BacktestReport,
  Bar,
  EquityPoint,
  Opportunity,
  ScanResult,
  Series,
  SetupConfig,
  Trade,
} from "./types";

export const SETUP: SetupConfig = {
  id: "rsi2-bounce-2r",
  name: "RSI(2) Bounce · 2R",
  smaTrend: 200,
  rsiLen: 2,
  rsiHi: 5,
  atrLen: 14,
  slAtr: 1.5,
  tpAtr: 3,
  timeStop: 6,
  minAtrPct: 0.008,
  capital: 100,
};

const SPARK_LEN = 42;
const CHART_BARS = 90;
const NEAR_RSI = 20;

type Indicators = {
  sma200: Array<number | null>;
  sma50: Array<number | null>;
  sma20: Array<number | null>;
  rsi: Array<number | null>;
  atr: Array<number | null>;
};

function indicatorsFor(bars: Bar[], cfg: SetupConfig): Indicators {
  const c = closes(bars);
  return {
    sma200: sma(c, cfg.smaTrend),
    sma50: sma(c, 50),
    sma20: sma(c, 20),
    rsi: rsi(c, cfg.rsiLen),
    atr: atr(bars, cfg.atrLen),
  };
}

function evaluateAt(
  bars: Bar[],
  ind: Indicators,
  i: number,
  cfg: SetupConfig,
): { ok: boolean; reasons: string[]; missing: string[]; score: number } {
  const reasons: string[] = [];
  const missing: string[] = [];
  const bar = bars[i]!;
  const s200 = ind.sma200[i];
  const r = ind.rsi[i];
  const a = ind.atr[i];

  if (s200 == null || r == null || a == null) {
    return { ok: false, reasons, missing: ["Histórico insuficiente"], score: 0 };
  }

  let score = 0;
  if (bar.c > s200) {
    reasons.push("Fechamento acima da SMA 200 — tendência de alta");
    score += 1;
  } else {
    missing.push("Abaixo da SMA 200");
  }

  if (r <= cfg.rsiHi) {
    reasons.push(`RSI(2) em ${r.toFixed(1)} — sobrevenda extrema`);
    score += 2;
  } else if (r <= 15) {
    missing.push(`RSI(2) em ${r.toFixed(1)} — perto, ainda não < ${cfg.rsiHi}`);
    score += 1;
  } else {
    missing.push(`RSI(2) em ${r.toFixed(1)} — não sobrevendido`);
  }

  const atrPct = a / bar.c;
  if (atrPct >= cfg.minAtrPct) {
    reasons.push(`ATR de ${(atrPct * 100).toFixed(1)}% — range negociável`);
    score += 0.5;
  } else {
    missing.push("Volatilidade baixa");
  }

  return { ok: missing.length === 0, reasons, missing, score };
}

function sizePosition(entry: number, sl: number, tp: number, capital: number) {
  const shares = capital / entry;
  const risk = (entry - sl) * shares;
  const reward = (tp - entry) * shares;
  return { shares, risk, reward, rr: risk > 0 ? reward / risk : 0 };
}

function toOpportunity(
  series: Series,
  bars: Bar[],
  ind: Indicators,
  i: number,
  cfg: SetupConfig,
  evaled: { ok: boolean; reasons: string[]; missing: string[]; score: number },
): Opportunity {
  const bar = bars[i]!;
  const prev = bars[i - 1];
  const a = ind.atr[i]!;
  const entry = bar.c;
  const sl = entry - cfg.slAtr * a;
  const tp = entry + cfg.tpAtr * a;
  const sized = sizePosition(entry, sl, tp, cfg.capital);
  const changePct = prev ? (bar.c - prev.c) / prev.c : 0;
  return {
    symbol: series.symbol,
    name: series.name,
    sector: series.sector,
    date: isoFromUnix(bar.t),
    kind: evaled.ok ? "setup" : "near",
    entry,
    sl,
    tp,
    atr: a,
    shares: sized.shares,
    capital: cfg.capital,
    risk: sized.risk,
    reward: sized.reward,
    rr: sized.rr,
    rsi: ind.rsi[i] ?? 0,
    sma20: ind.sma20[i] ?? 0,
    sma50: ind.sma50[i] ?? 0,
    sma200: ind.sma200[i] ?? 0,
    close: bar.c,
    changePct,
    spark: bars.slice(Math.max(0, i - SPARK_LEN + 1), i + 1).map((b) => b.c),
    bars: bars.slice(Math.max(0, i - CHART_BARS + 1), i + 1),
    reasons: evaled.reasons,
    missing: evaled.missing,
    score: evaled.score,
  };
}

function simulateTrade(
  series: Series,
  bars: Bar[],
  signalIndex: number,
  atrValue: number,
  cfg: SetupConfig,
): Trade | null {
  const entryIndex = signalIndex + 1;
  if (entryIndex >= bars.length) return null;
  const entry = bars[entryIndex]!.o;
  if (entry <= 0) return null;
  const sl = entry - cfg.slAtr * atrValue;
  const tp = entry + cfg.tpAtr * atrValue;
  if (sl <= 0) return null;

  const lastIndex = Math.min(bars.length - 1, entryIndex + cfg.timeStop - 1);
  let exit = bars[lastIndex]!.c;
  let reason: Trade["reason"] = "time";
  let exitIndex = lastIndex;

  for (let k = entryIndex; k <= lastIndex; k++) {
    const bar = bars[k]!;
    if (k === entryIndex && entry <= sl) {
      exit = entry;
      reason = "sl";
      exitIndex = k;
      break;
    }
    if (k === entryIndex && entry >= tp) {
      exit = entry;
      reason = "tp";
      exitIndex = k;
      break;
    }
    const hitSl = bar.l <= sl;
    const hitTp = bar.h >= tp;
    if (hitSl && hitTp) {
      exit = sl;
      reason = "sl";
      exitIndex = k;
      break;
    }
    if (hitSl) {
      exit = sl;
      reason = "sl";
      exitIndex = k;
      break;
    }
    if (hitTp) {
      exit = tp;
      reason = "tp";
      exitIndex = k;
      break;
    }
  }

  const shares = cfg.capital / entry;
  const pnl = (exit - entry) * shares;
  const barsHeld = exitIndex - entryIndex + 1;
  return {
    symbol: series.symbol,
    name: series.name,
    sector: series.sector,
    entryDate: isoFromUnix(bars[entryIndex]!.t),
    exitDate: isoFromUnix(bars[exitIndex]!.t),
    entry,
    exit,
    sl,
    tp,
    shares,
    pnl,
    pnlPct: (exit - entry) / entry,
    reason,
    barsHeld,
  };
}

export function backtestSeries(series: Series, cfg: SetupConfig = SETUP): Trade[] {
  const bars = series.bars;
  const ind = indicatorsFor(bars, cfg);
  const start = Math.max(cfg.smaTrend, cfg.atrLen, cfg.rsiLen) + 2;
  const trades: Trade[] = [];
  let i = start;
  while (i < bars.length - 1) {
    const evaled = evaluateAt(bars, ind, i, cfg);
    if (!evaled.ok) {
      i += 1;
      continue;
    }
    const a = ind.atr[i];
    if (a == null) {
      i += 1;
      continue;
    }
    const trade = simulateTrade(series, bars, i, a, cfg);
    if (!trade) {
      i += 1;
      continue;
    }
    trades.push(trade);
    i += Math.max(trade.barsHeld, 1) + 1;
  }
  return trades;
}

function maxDrawdown(equity: EquityPoint[]): number {
  let peak = -Infinity;
  let dd = 0;
  for (const p of equity) {
    if (p.v > peak) peak = p.v;
    const cur = peak - p.v;
    if (cur > dd) dd = cur;
  }
  return dd;
}

export function summarizeTrades(
  trades: Trade[],
  tickersTested: number,
  barsFrom: string,
  barsTo: string,
): BacktestReport {
  const sorted = [...trades].sort((a, b) => a.exitDate.localeCompare(b.exitDate));
  const winsList = sorted.filter((t) => t.pnl > 0);
  const lossList = sorted.filter((t) => t.pnl <= 0);
  const grossProfit = winsList.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = -lossList.reduce((s, t) => s + t.pnl, 0);
  const netPnl = grossProfit - grossLoss;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const avgWin = winsList.length ? grossProfit / winsList.length : 0;
  const avgLoss = lossList.length ? grossLoss / lossList.length : 0;
  const expectancy = sorted.length ? netPnl / sorted.length : 0;
  const avgBarsHeld = sorted.length
    ? sorted.reduce((s, t) => s + t.barsHeld, 0) / sorted.length
    : 0;
  const timeStopRate = sorted.length
    ? sorted.filter((t) => t.reason === "time").length / sorted.length
    : 0;

  let running = 0;
  const equity: EquityPoint[] = [{ t: 0, v: 0 }];
  for (const t of sorted) {
    running += t.pnl;
    const parts = t.exitDate.split("-").map(Number);
    const ts = Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!) / 1000;
    equity.push({ t: ts, v: running });
  }

  return {
    profitFactor,
    winRate: sorted.length ? winsList.length / sorted.length : 0,
    trades: sorted.length,
    wins: winsList.length,
    losses: lossList.length,
    avgWin,
    avgLoss,
    expectancy,
    maxDrawdown: maxDrawdown(equity),
    netPnl,
    grossProfit,
    grossLoss,
    avgBarsHeld,
    timeStopRate,
    equity,
    recentTrades: sorted.slice(-16).reverse(),
    tickersTested,
    barsFrom,
    barsTo,
  };
}

export function scanUniverse(seriesList: Series[], cfg: SetupConfig = SETUP): ScanResult {
  const tradable = seriesList.filter((s) => s.symbol !== "SPY" && s.bars.length >= 220);
  const allTrades: Trade[] = [];
  const opportunities: Opportunity[] = [];
  const near: Opportunity[] = [];

  let minTs = Number.POSITIVE_INFINITY;
  let maxTs = 0;

  for (const series of tradable) {
    const first = series.bars[0];
    const last = series.bars[series.bars.length - 1];
    if (first) minTs = Math.min(minTs, first.t);
    if (last) maxTs = Math.max(maxTs, last.t);

    allTrades.push(...backtestSeries(series, cfg));

    const i = series.bars.length - 1;
    const ind = indicatorsFor(series.bars, cfg);
    const evaled = evaluateAt(series.bars, ind, i, cfg);
    const r = ind.rsi[i] ?? 100;
    const s200 = ind.sma200[i];
    if (evaled.ok) {
      opportunities.push(toOpportunity(series, series.bars, ind, i, cfg, evaled));
    } else if (s200 != null && series.bars[i]!.c > s200 && r <= NEAR_RSI && evaled.score >= 1.5) {
      near.push(toOpportunity(series, series.bars, ind, i, cfg, evaled));
    }
  }

  opportunities.sort((a, b) => a.rsi - b.rsi || b.score - a.score);
  near.sort((a, b) => a.rsi - b.rsi || b.score - a.score);

  const asOfTs = maxTs || 0;
  return {
    asOf: asOfTs ? isoFromUnix(asOfTs) : "",
    asOfTs,
    setup: cfg,
    opportunities,
    near: near.slice(0, 18),
    backtest: summarizeTrades(
      allTrades,
      tradable.length,
      minTs === Number.POSITIVE_INFINITY ? "" : isoFromUnix(minTs),
      asOfTs ? isoFromUnix(asOfTs) : "",
    ),
    universe: tradable.length,
    fetched: seriesList.length,
  };
}
