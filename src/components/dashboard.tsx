import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Clipboard,
  RefreshCw,
  TrendingUp,
  X,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EquityChart, PriceChart } from "@/components/charts";
import { Sparkline } from "@/components/sparkline";
import { formatDate, formatNum, formatPct, formatUsd } from "@/lib/swing/format";
import { fetchQuoteChunk, rememberScan } from "@/lib/market/get-scan";
import { isScanStale } from "@/lib/market/session";
import {
  UPDATE_SLOT_KEY,
  countdownLabel,
  dueSlot,
  formatUpdateWhen,
  nextUpdateAt,
} from "@/lib/market/schedule";
import { scanUniverse } from "@/lib/swing/engine";
import type { Opportunity, ScanResult, Series, Trade, TradeExit } from "@/lib/swing/types";
import { cn, copyText } from "@/lib/utils";

type Tab = "ops" | "near" | "backtest" | "rules";

function ticketText(op: Opportunity): string {
  return [
    `MAKO SIGNALS · ${op.symbol} · ${op.name}`,
    `Setup RSI(2) Bounce · 2R`,
    `Capital ${formatUsd(op.capital)}`,
    `Entrada ${formatUsd(op.entry, true)}`,
    `Stop ${formatUsd(op.sl, true)}`,
    `Alvo ${formatUsd(op.tp, true)}`,
    `Quantidade ${formatNum(op.shares, true)}`,
    `Risco ${formatUsd(op.risk)} · Alvo ${formatUsd(op.reward)} · ${formatNum(op.rr)}R`,
    `Sinal ${formatDate(op.date)} · entrar na abertura`,
  ].join("\n");
}

function KpiValue({ value, className }: { value: string; className?: string }) {
  const money = value.match(/^(US\$)\s+(.+)$/);
  return (
    <span className={cn("kpi-figure", className)}>
      {money ? (
        <>
          <span>{money[1]}</span>
          <span>{money[2]}</span>
        </>
      ) : (
        value
      )}
    </span>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "long" | "short" | "plain";
}) {
  return (
    <div className="flex min-w-36 flex-1 flex-col items-center rounded-lg bg-surface px-4 py-3 text-center shadow-[0_0_0_1px_var(--color-border)]">
      <p className="w-full text-xs font-medium tracking-wide text-fg-subtle uppercase">{label}</p>
      <div className="mt-1 flex w-full justify-center">
        <KpiValue
          value={value}
          className={cn(
            "text-lg font-semibold leading-none sm:text-xl",
            tone === "long" ? "text-long" : tone === "short" ? "text-short" : "text-fg",
          )}
        />
      </div>
      {hint ? <p className="mt-1 w-full text-xs text-fg-muted">{hint}</p> : null}
    </div>
  );
}

function RangeBar({ op }: { op: Opportunity }) {
  const min = op.sl;
  const max = op.tp;
  const span = max - min || 1;
  const entryPct = ((op.entry - min) / span) * 100;
  return (
    <div className="mt-4">
      <div className="relative h-1.5 rounded-full bg-surface-2">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-short/70"
          style={{ width: `${entryPct}%` }}
        />
        <div
          className="absolute inset-y-0 rounded-full bg-long/70"
          style={{ left: `${entryPct}%`, right: 0 }}
        />
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
          style={{ left: `${entryPct}%` }}
        />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-xs tabular">
        <div>
          <p className="text-fg-subtle">Stop</p>
          <p className="text-short">{formatUsd(op.sl, true)}</p>
        </div>
        <div className="text-center">
          <p className="text-fg-subtle">Entrada</p>
          <p className="text-fg">{formatUsd(op.entry, true)}</p>
        </div>
        <div className="text-right">
          <p className="text-fg-subtle">Alvo</p>
          <p className="text-long">{formatUsd(op.tp, true)}</p>
        </div>
      </div>
    </div>
  );
}

function OpportunityCard({
  op,
  selected,
  onSelect,
}: {
  op: Opportunity;
  selected: boolean;
  onSelect: () => void;
}) {
  const sparkTone = op.changePct >= 0 ? "long" : "short";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl bg-surface p-4 text-left shadow-[0_0_0_1px_var(--color-border)] transition-[box-shadow,transform] duration-150 ease-out",
        "hover:shadow-[0_0_0_1px_var(--color-border-strong)]",
        selected && "shadow-[0_0_0_1px_var(--color-accent)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-base font-medium tracking-tight">{op.symbol}</p>
            <Badge tone={op.kind === "setup" ? "long" : "neutral"}>
              {op.kind === "setup" ? "Sinal" : "Quase"}
            </Badge>
          </div>
          <p className="mt-0.5 max-w-56 truncate text-sm text-fg-muted">{op.name}</p>
        </div>
        <Sparkline values={op.spark} tone={sparkTone} />
      </div>
      <RangeBar op={op} />
      <div className="mt-3 flex items-center justify-between text-xs text-fg-muted">
        <span className="font-mono tabular">{formatNum(op.shares, true)} papéis</span>
        <span>
          risco {formatUsd(op.risk)} · alvo {formatUsd(op.reward)}
        </span>
      </div>
    </button>
  );
}

function Detail({ op }: { op: Opportunity }) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    try {
      await copyText(ticketText(op));
      setCopied(true);
      toast("Ticket copiado");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("Não foi possível copiar");
    }
  }
  return (
    <section className="rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--color-border)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm text-fg-subtle">{op.sector || "S&P 500"}</p>
          <h2 className="font-display text-3xl leading-tight tracking-tight">
            {op.symbol}
            <span className="ml-2 text-xl text-fg-muted">{op.name}</span>
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Sinal em {formatDate(op.date)} · entrar na abertura do próximo pregão · capital{" "}
            {formatUsd(op.capital)}
          </p>
        </div>
        <Button variant="secondary" onClick={onCopy}>
          {copied ? <Check /> : <Clipboard />}
          Copiar ticket
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-sm bg-bg-elevated px-3 py-3">
          <p className="text-xs text-fg-subtle">Entrada</p>
          <p className="font-mono text-lg tabular">{formatUsd(op.entry, true)}</p>
        </div>
        <div className="rounded-sm bg-bg-elevated px-3 py-3">
          <p className="text-xs text-fg-subtle">Stop</p>
          <p className="font-mono text-lg tabular text-short">{formatUsd(op.sl, true)}</p>
        </div>
        <div className="rounded-sm bg-bg-elevated px-3 py-3">
          <p className="text-xs text-fg-subtle">Alvo</p>
          <p className="font-mono text-lg tabular text-long">{formatUsd(op.tp, true)}</p>
        </div>
        <div className="rounded-sm bg-bg-elevated px-3 py-3">
          <p className="text-xs text-fg-subtle">Quantidade</p>
          <p className="font-mono text-lg tabular">{formatNum(op.shares, true)}</p>
        </div>
      </div>

      <div className="mt-4">
        <PriceChart bars={op.bars} entry={op.entry} sl={op.sl} tp={op.tp} />
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-fg-muted">
          <span className="text-short">Stop {formatUsd(op.sl, true)}</span>
          <span>Entrada {formatUsd(op.entry, true)}</span>
          <span className="text-long">Alvo {formatUsd(op.tp, true)}</span>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {op.reasons.map((r) => (
          <li key={r} className="flex gap-2 text-sm text-fg">
            <Check className="mt-0.5 size-4 shrink-0 text-long" />
            {r}
          </li>
        ))}
        {op.missing.map((r) => (
          <li key={r} className="flex gap-2 text-sm text-fg-muted">
            <X className="mt-0.5 size-4 shrink-0 text-short" />
            {r}
          </li>
        ))}
      </ul>
    </section>
  );
}

function reasonLabel(reason: TradeExit): string {
  if (reason === "tp") return "Alvo";
  if (reason === "sl") return "Stop";
  return "Tempo";
}

function TradeRow({ trade }: { trade: Trade }) {
  const win = trade.pnl > 0;
  return (
    <div className="grid grid-cols-2 items-center gap-2 border-b border-border py-3 last:border-0 sm:grid-cols-4">
      <p className="font-mono text-sm">{trade.symbol}</p>
      <p className="hidden text-sm text-fg-muted sm:block">
        {formatDate(trade.entryDate)} → {formatDate(trade.exitDate)}
      </p>
      <Badge tone={trade.reason === "tp" ? "long" : trade.reason === "sl" ? "short" : "neutral"}>
        {reasonLabel(trade.reason)}
      </Badge>
      <p className={cn("text-right font-mono text-sm tabular", win ? "text-long" : "text-short")}>
        {formatUsd(trade.pnl)}
      </p>
    </div>
  );
}

function Rules() {
  const steps = [
    {
      t: "Tendência",
      d: "O fechamento precisa estar acima da média de 200 pregões. Só operamos recuo em papel que já está em alta.",
    },
    {
      t: "Gatilho",
      d: "RSI de 2 períodos abaixo de 5. É a sobrevenda extrema do Larry Connors — um esticão de baixa dentro da tendência.",
    },
    {
      t: "Entrada",
      d: "Abertura do pregão seguinte ao sinal. O ticket usa o fechamento do sinal como preço de referência.",
    },
    {
      t: "Stop",
      d: "1,5 × ATR(14) abaixo da entrada. Define o risco da posição de US$ 100.",
    },
    {
      t: "Alvo",
      d: "3,0 × ATR(14) acima da entrada. Relação 2R: o ganho-alvo é o dobro do risco.",
    },
    {
      t: "Tempo",
      d: "Se nem o stop nem o alvo forem atingidos em 6 pregões, a posição é encerrada no fechamento.",
    },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {steps.map((s, i) => (
        <article
          key={s.t}
          className="rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--color-border)] sm:p-5"
        >
          <p className="font-mono text-xs text-fg-subtle">{String(i + 1).padStart(2, "0")}</p>
          <h3 className="mt-1 font-display text-2xl tracking-tight">{s.t}</h3>
          <p className="mt-2 text-sm leading-relaxed text-pretty text-fg-muted">{s.d}</p>
        </article>
      ))}
    </div>
  );
}

function NextUpdateClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const next = nextUpdateAt(now);
  return (
    <div className="min-w-[9.5rem] rounded-lg bg-surface px-3 py-2 shadow-[0_0_0_1px_var(--color-border)]">
      <p className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">
        Próxima atualização
      </p>
      <p className="mt-1 font-mono text-xl tabular leading-none text-accent">{countdownLabel(next.getTime() - now.getTime())}</p>
      <p className="mt-1 text-xs text-fg-muted">{formatUpdateWhen(next)} · 20:00</p>
    </div>
  );
}

export function Dashboard({ scan: initial }: { scan: ScanResult }) {
  const [scan, setScan] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("ops");
  const [selected, setSelected] = useState<string | null>(
    initial.opportunities[0]?.symbol ?? initial.near[0]?.symbol ?? null,
  );
  const started = useRef(false);
  const refreshingRef = useRef(false);
  const retryAt = useRef(0);
  const refreshRef = useRef<(manual: boolean) => Promise<void>>(async () => {});

  async function refresh(manual: boolean) {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setProgress("Abrindo a API da Nasdaq…");
    try {
      const all: Series[] = [];
      let offset = 0;
      let total = 0;
      while (true) {
        const page = await fetchQuoteChunk({ data: { offset } });
        total = page.total;
        all.push(...page.series);
        const done = page.next ?? total;
        setProgress(`Nasdaq · ${done} de ${total}`);
        if (page.next == null) break;
        offset = page.next;
      }
      const usable = all.filter((s) => s.bars.length >= 220).length;
      if (usable < 400) throw new Error("short");
      const next = { ...scanUniverse(all), updatedAt: new Date().toISOString() };
      setScan(next);
      void rememberScan({ data: next }).catch(() => undefined);
      toast.success(
        `Pregão ${formatDate(next.asOf)} · ${next.opportunities.length} ${next.opportunities.length === 1 ? "sinal" : "sinais"}`,
      );
    } catch {
      if (!manual) {
        try {
          localStorage.removeItem(UPDATE_SLOT_KEY);
        } catch {
          /* private mode */
        }
        retryAt.current = Date.now() + 60_000;
      }
      toast.error(
        manual
          ? "A API da Nasdaq não respondeu. Tenta de novo em instantes."
          : "A atualização das 20h falhou. Usa o botão Atualizar.",
      );
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      setProgress(null);
    }
  }

  refreshRef.current = refresh;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const tick = () => {
      if (refreshingRef.current || Date.now() < retryAt.current) return;
      const slot = dueSlot(new Date());
      if (!slot) return;
      const key = slot.toISOString();
      try {
        if (localStorage.getItem(UPDATE_SLOT_KEY) === key) return;
        localStorage.setItem(UPDATE_SLOT_KEY, key);
      } catch {
        return;
      }
      void refreshRef.current(false);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const activeList = tab === "near" ? scan.near : scan.opportunities;
  const selectedOp = useMemo(() => {
    const pool = [...scan.opportunities, ...scan.near];
    return pool.find((o) => o.symbol === selected) ?? activeList[0] ?? null;
  }, [scan, selected, activeList]);

  const bt = scan.backtest;
  const stale = isScanStale(scan.asOf);
  const tabs: { id: Tab; label: string }[] = [
    { id: "ops", label: `Oportunidades (${scan.opportunities.length})` },
    { id: "near", label: `Quase lá (${scan.near.length})` },
    { id: "backtest", label: "Backtest" },
    { id: "rules", label: "Regras" },
  ];

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <Toaster
        theme="light"
        position="bottom-center"
        toastOptions={{
          style: {
            background: "var(--color-surface)",
            color: "var(--color-fg)",
            border: "1px solid var(--color-border-strong)",
          },
        }}
      />
      <header className="border-b border-border">
        <div className="h-0.5 bg-[linear-gradient(90deg,#02133e_0%,#0155c7_55%,#0171ff_100%)]" />
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div className="flex items-start gap-3">
            <img
              src="/mako-logo.png"
              alt=""
              width={96}
              height={96}
              className="size-20 shrink-0 sm:size-24"
            />
            <div>
              <h1 className="font-display text-3xl font-semibold leading-none tracking-tight text-fg sm:text-4xl">
                Mako Signals
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-pretty text-fg-muted">
                Setup RSI(2) Bounce com alvo 2R. Universo de {scan.universe} papéis. Cada ticket nasce
                com capital de {formatUsd(100)}. Sinal do pregão {formatDate(scan.asOf)}.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <NextUpdateClock />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refreshing}
              aria-busy={refreshing}
              onClick={() => void refresh(true)}
            >
              <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
              {refreshing ? "Atualizando" : "Atualizar"}
            </Button>
            <p className="text-xs text-fg-muted">
              {progress
                ? progress
                : stale
                  ? "Pregão novo · API Nasdaq"
                  : `Em dia · pregão ${formatDate(scan.asOf)} · Nasdaq`}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex gap-3 overflow-x-auto pb-1">
          <Kpi
            label="Profit factor"
            value={formatNum(bt.profitFactor)}
            hint="ganho bruto / perda bruta"
            tone="long"
          />
          <Kpi label="Taxa de acerto" value={formatPct(bt.winRate)} hint={`${bt.wins} ganhos`} />
          <Kpi label="Trades" value={formatNum(bt.trades)} hint={`${bt.tickersTested} ações`} />
          <Kpi
            label="P&L líquido"
            value={formatUsd(bt.netPnl)}
            hint="US$ 100 por trade"
            tone={bt.netPnl >= 0 ? "long" : "short"}
          />
        </div>

        <div className="mt-6 flex gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "h-11 shrink-0 rounded-md px-4 text-sm font-medium transition-colors duration-150",
                tab === t.id ? "bg-surface text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {(tab === "ops" || tab === "near") && (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {selectedOp ? <Detail op={selectedOp} /> : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:order-first lg:grid-cols-1 xl:grid-cols-2">
              {activeList.length === 0 ? (
                <p className="rounded-xl bg-surface p-6 text-sm text-fg-muted shadow-[0_0_0_1px_var(--color-border)]">
                  Nenhum papel nesta lista no último pregão. O S&P 500 não dispara o RSI(2) todos os
                  dias — volte no próximo fechamento.
                </p>
              ) : (
                activeList.map((op) => (
                  <OpportunityCard
                    key={op.symbol}
                    op={op}
                    selected={selectedOp?.symbol === op.symbol}
                    onSelect={() => setSelected(op.symbol)}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {tab === "backtest" && (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--color-border)] sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-2xl tracking-tight">Equity do setup</h2>
                  <p className="text-sm text-fg-muted">
                    {formatDate(bt.barsFrom)} a {formatDate(bt.barsTo)} · soma de tickets de{" "}
                    {formatUsd(100)}
                  </p>
                </div>
                <TrendingUp className="size-5 text-long" />
              </div>
              <div className="mt-4">
                <EquityChart points={bt.equity} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Kpi label="Expectativa" value={formatUsd(bt.expectancy)} />
                <Kpi label="Gain médio" value={formatUsd(bt.avgWin)} tone="long" />
                <Kpi label="Loss médio" value={formatUsd(bt.avgLoss)} tone="short" />
                <Kpi label="Drawdown" value={formatUsd(bt.maxDrawdown)} />
              </div>
            </section>
            <section className="rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--color-border)] sm:p-5">
              <h2 className="font-display text-2xl tracking-tight">Últimos encerramentos</h2>
              <p className="text-sm text-fg-muted">
                {formatPct(bt.timeStopRate)} saíram por tempo · média {formatNum(bt.avgBarsHeld)}{" "}
                pregões
              </p>
              <div className="mt-3">
                {bt.recentTrades.map((t) => (
                  <TradeRow key={`${t.symbol}-${t.entryDate}-${t.exitDate}`} trade={t} />
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === "rules" && (
          <div className="mt-6">
            <p className="mb-4 max-w-2xl text-sm leading-relaxed text-pretty text-fg-muted">
              O alvo é 2R: cada dólar arriscado busca dois de ganho. No backtest interno em{" "}
              {bt.tickersTested} ações do S&P 500 o profit factor ficou em {formatNum(bt.profitFactor)}{" "}
              com {formatPct(bt.winRate)} de acerto — validado em {formatNum(bt.trades)} trades.
            </p>
            <Rules />
            <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-fg-subtle">
              <ArrowUpRight className="mt-0.5 size-3.5 shrink-0" />
              Educação e pesquisa. Não é recomendação de investimento. Preços do último pregão
              regular; mercado fechado no fim de semana.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
