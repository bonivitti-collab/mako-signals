import { cn } from "@/lib/utils";

export function Sparkline({
  values,
  className,
  tone = "neutral",
}: {
  values: number[];
  className?: string;
  tone?: "neutral" | "long" | "short";
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 120;
  const h = 36;
  const step = w / (values.length - 1);
  const d = values
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke =
    tone === "long" ? "var(--color-long)" : tone === "short" ? "var(--color-short)" : "var(--color-accent)";
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-9 w-[7.5rem]", className)}
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
