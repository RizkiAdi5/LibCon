import { describe, expect, it } from "vitest";
import { auditChanges, parseLogFilter, wibDayRange } from "@/lib/activityLog";
import { renderTemplate, SAMPLE_VARIABLES, TEMPLATE_INFO, unknownVariables } from "@/lib/email/templates";

describe("Log Aktivitas [FR-13.07]", () => {
  it("filter: nilai tak valid diabaikan, array dari URLSearchParams diambil pertama", () => {
    expect(parseLogFilter({ tab: "x", aksi: "drop table", tabel: "Users;", dari: "kemarin", hal: "-3" })).toEqual({ tab: "audit", pengguna: undefined, aksi: undefined, tabel: undefined, dari: undefined, sampai: undefined, hal: 1 });
    expect(parseLogFilter({ tab: ["aktivitas"], aksi: ["LOGIN"], pengguna: [""], hal: ["2"] })).toMatchObject({ tab: "aktivitas", aksi: "LOGIN", pengguna: undefined, hal: 2 });
  });

  it("rentang tanggal WIB inklusif", () => {
    const r = wibDayRange("2026-11-01", "2026-11-12");
    expect(r.gte?.toISOString()).toBe("2026-10-31T17:00:00.000Z");
    expect(r.lt?.toISOString()).toBe("2026-11-12T17:00:00.000Z");
    expect(wibDayRange()).toEqual({});
  });

  it("detail sebelum-sesudah: hanya kolom berubah, updated_at/by disembunyikan, hash disamarkan", () => {
    const changes = auditChanges(
      { status: "DRAFT", password_hash: "$argon2", updated_at: "a" },
      { status: "OPEN", password_hash: "$argon2new", updated_at: "b" },
      { status: "OPEN", password_hash: "$argon2new", updated_at: "b" },
    );
    expect(changes).toEqual([
      { field: "status", before: "DRAFT", after: "OPEN" },
      { field: "password_hash", before: "••••", after: "••••" },
    ]);
    // INSERT: semua kolom baru
    expect(auditChanges(null, { name: "A" }, null)).toEqual([{ field: "name", before: undefined, after: "A" }]);
    // hanya updated_at berubah → tetap ditampilkan
    expect(auditChanges({ updated_at: "a" }, { updated_at: "b" }, { updated_at: "b" })).toHaveLength(1);
  });
});

describe("Template email [FR-14.02]", () => {
  it("variabel tak dikenal terdeteksi; contoh variabel mencakup semua variabel template", () => {
    expect(unknownVariables("Halo {nama_lembaga} {nama} {npp}", TEMPLATE_INFO.ACTIVATION.variables)).toEqual(["nama"]);
    for (const info of Object.values(TEMPLATE_INFO)) for (const v of info.variables) expect(SAMPLE_VARIABLES[v]).toBeTruthy();
    expect(renderTemplate("{nama_lembaga} – {x}", { nama_lembaga: "A" })).toBe("A – {x}");
  });
});
