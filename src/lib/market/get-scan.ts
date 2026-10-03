import { createServerFn } from "@tanstack/react-start";
import type { ScanResult } from "@/lib/swing/types";

export const getMarketScan = createServerFn({ method: "GET" }).handler(
  async (): Promise<ScanResult> => {
    const { readCachedScan } = await import("./refresh.server");
    const cached = readCachedScan();
    if (cached) return cached;
    const { SNAPSHOT } = await import("./snapshot");
    return SNAPSHOT;
  },
);

export const fetchQuoteChunk = createServerFn({ method: "POST" })
  .validator((data: { offset: number }) => {
    const offset = Number(data?.offset ?? 0);
    if (!Number.isFinite(offset) || offset < 0 || offset > 10000) {
      throw new Error("Offset inválido");
    }
    return { offset: Math.floor(offset) };
  })
  .handler(async ({ data }) => {
    const { fetchChunk } = await import("./refresh.server");
    return fetchChunk(data.offset);
  });

export const rememberScan = createServerFn({ method: "POST" })
  .validator((data: ScanResult) => data)
  .handler(async ({ data }) => {
    const { rememberScan: save } = await import("./refresh.server");
    save(data);
    return { ok: true as const };
  });
