import { describe, expect, it } from "vitest";
import { getRequestContext, runWithRequestContext, type RequestContext } from "@/lib/db/requestContext";
import { withCreatedBy, withUpdatedBy } from "@/lib/db/trackingFields";
import { SYSTEM_USER_ID } from "@/lib/auth/constants";

const webCtx: RequestContext = {
  userId: "11111111-1111-1111-1111-111111111111",
  requestId: "22222222-2222-2222-2222-222222222222",
  ip: "127.0.0.1",
  userAgent: "vitest",
  source: "WEB",
};

const cronCtx: RequestContext = {
  userId: SYSTEM_USER_ID,
  requestId: "33333333-3333-3333-3333-333333333333",
  ip: null,
  userAgent: null,
  source: "CRON",
};

describe("request context", () => {
  it("melempar error jika dipanggil tanpa context aktif [FR-13.02]", () => {
    expect(() => getRequestContext()).toThrowError(/runWithRequestContext/);
  });

  it("mengembalikan context yang sama di dalam runWithRequestContext", () => {
    runWithRequestContext(webCtx, () => {
      expect(getRequestContext()).toEqual(webCtx);
    });
  });
});

describe("withCreatedBy", () => {
  it("melempar error tanpa context aktif, mencegah created_by kosong [FR-13.02]", () => {
    expect(() => withCreatedBy({ name: "Kota Contoh" })).toThrowError(/runWithRequestContext/);
  });

  it("mengisi createdBy dari context WEB", () => {
    const result = runWithRequestContext(webCtx, () => withCreatedBy({ name: "Kota Contoh" }));
    expect(result).toEqual({ name: "Kota Contoh", createdBy: webCtx.userId });
  });

  it("mengisi createdBy dengan SYSTEM_USER_ID di konteks cron [BR: aksi otomatis atas nama SYSTEM]", () => {
    const result = runWithRequestContext(cronCtx, () => withCreatedBy({ name: "Reminder" }));
    expect(result.createdBy).toBe(SYSTEM_USER_ID);
  });
});

describe("withUpdatedBy", () => {
  it("mengisi updatedBy tanpa menyentuh deletedBy jika deletedAt tidak diset", () => {
    const result = runWithRequestContext(webCtx, () => withUpdatedBy({ name: "Baru" }));
    expect(result).toEqual({ name: "Baru", updatedBy: webCtx.userId });
    expect(result.deletedBy).toBeUndefined();
  });

  it("otomatis mengisi deletedBy saat deletedAt diset (soft delete) [BR-18]", () => {
    const now = new Date();
    const result = runWithRequestContext(webCtx, () => withUpdatedBy({ deletedAt: now }));
    expect(result.updatedBy).toBe(webCtx.userId);
    expect(result.deletedBy).toBe(webCtx.userId);
  });

  it("tidak menimpa deletedBy jika caller sudah menyertakannya sendiri", () => {
    const now = new Date();
    const explicitDeleter = "99999999-9999-9999-9999-999999999999";
    const result = runWithRequestContext(webCtx, () =>
      withUpdatedBy({ deletedAt: now, deletedBy: explicitDeleter }),
    );
    expect(result.deletedBy).toBe(explicitDeleter);
  });
});
