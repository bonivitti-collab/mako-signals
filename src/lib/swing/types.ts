export type Bar = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
};

export type Series = {
  symbol: string;
  name: string;
  sector: string;
  bars: Bar[];
};

export type SetupConfig = {
  id: string;
  name: string;
  smaTrend: number;
  rsiLen: number;
  rsiHi: number;
  atrLen: number;
  slAtr: number;
  tpAtr: number;
  timeStop: number;
  minAtrPct: number;
  capital: number;
};

export type SignalKind = "setup" | "near";

export type Opportunity = {
  symbol: string;
  name: string;
  sector: string;
  date: string;
  kind: SignalKind;
  entry: number;
  sl: number;
  tp: number;
  atr: number;
  shares: number;
  capital: number;
  risk: number;
  reward: number;
  rr: number;
  rsi: number;
  sma20: number;
  sma50: number;
  sma200: number;
  close: number;
  changePct: number;
  spark: number[];
  bars: Bar[];
  reasons: string[];
  missing: string[];
  score: number;
};

export type TradeExit = "tp" | "sl" | "time";

export type Trade = {
  symbol: string;
  name: string;
  sector: string;
  entryDate: string;
  exitDate: string;
  entry: number;
  exit: number;
  sl: number;
  tp: number;
  shares: number;
  pnl: number;
  pnlPct: number;
  reason: TradeExit;
  barsHeld: number;
};

export type EquityPoint = {
  t: number;
  v: number;
};

export type BacktestReport = {
  profitFactor: number;
  winRate: number;
  trades: number;
  wins: number;
  losses: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  maxDrawdown: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  avgBarsHeld: number;
  timeStopRate: number;
  equity: EquityPoint[];
  recentTrades: Trade[];
  tickersTested: number;
  barsFrom: string;
  barsTo: string;
};

export type ScanResult = {
  asOf: string;
  asOfTs: number;
  setup: SetupConfig;
  opportunities: Opportunity[];
  near: Opportunity[];
  backtest: BacktestReport;
  universe: number;
  fetched: number;
  updatedAt?: string;
};
