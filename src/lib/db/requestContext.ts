import { AsyncLocalStorage } from "node:async_hooks";

export type RequestSource = "WEB" | "CRON" | "IMPORT" | "SYSTEM";

export type RequestContext = {
  userId: string;
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  source: RequestSource;
};

const storage = new AsyncLocalStorage<RequestContext>();

/** Jalankan `fn` dengan request context aktif untuk seluruh pohon async di dalamnya. */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Context aktif, atau error jika dipanggil di luar `runWithRequestContext`. */
export function getRequestContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error(
      "Tidak ada request context aktif. Bungkus aksi penulisan data dengan runWithRequestContext()/withDb() sebelum menulis ke database.",
    );
  }
  return ctx;
}

export function tryGetRequestContext(): RequestContext | null {
  return storage.getStore() ?? null;
}
