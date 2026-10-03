import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate, formatUsd } from "@/lib/swing/format";
import type { Bar, EquityPoint } from "@/lib/swing/types";

function usdTick(v: number) {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return formatUsd(v);
}

export function EquityChart({ points }: { points: EquityPoint[] }) {
  const data = points.map((p, i) => ({
    i,
    v: Number(p.v.toFixed(2)),
    t: p.t ? formatDate(new Date(p.t * 1000).toISOString().slice(0, 10)) : "início",
  }));
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-long)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-long)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="t" hide />
          <YAxis
            tickFormatter={usdTick}
            width={56}
            tick={{ fill: "var(--color-fg-subtle)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border-strong)",
              borderRadius: 8,
              color: "var(--color-fg)",
            }}
            formatter={(value) => [formatUsd(Number(value)), "Equity"]}
            labelFormatter={(_, items) => (items?.[0]?.payload as { t?: string } | undefined)?.t ?? ""}
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke="var(--color-long)"
            fill="url(#eq)"
            strokeWidth={1.6}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PriceChart({
  bars,
  entry,
  sl,
  tp,
}: {
  bars: Bar[];
  entry: number;
  sl: number;
  tp: number;
}) {
  const data = bars.map((b) => ({
    t: formatDate(new Date(b.t * 1000).toISOString().slice(0, 10)),
    c: b.c,
    h: b.h,
    l: b.l,
  }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="t" hide />
          <YAxis
            domain={["auto", "auto"]}
            width={52}
            tick={{ fill: "var(--color-fg-subtle)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => Number(v).toFixed(0)}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border-strong)",
              borderRadius: 8,
              color: "var(--color-fg)",
            }}
            formatter={(value) => [formatUsd(Number(value)), "Fechamento"]}
          />
          <ReferenceLine y={tp} stroke="var(--color-long)" strokeDasharray="4 4" />
          <ReferenceLine y={entry} stroke="var(--color-accent)" strokeDasharray="3 3" />
          <ReferenceLine y={sl} stroke="var(--color-short)" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="c"
            stroke="var(--color-fg)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
