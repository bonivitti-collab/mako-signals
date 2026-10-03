import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/dashboard";
import { getMarketScan } from "@/lib/market/get-scan";

export const Route = createFileRoute("/")({
  loader: () => getMarketScan(),
  pendingComponent: Pending,
  component: Home,
});

function Pending() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg text-fg-muted">
      <p className="font-display text-2xl tracking-tight">Lendo o S&P 500…</p>
    </main>
  );
}

function Home() {
  const scan = Route.useLoaderData();
  return <Dashboard scan={scan} />;
}
