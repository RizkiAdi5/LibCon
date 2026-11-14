import { describe, expect, it } from "vitest";
import { Ban, Download, Loader2, Plus, RotateCw, Save, Send, Trash2, Unlock } from "lucide-react";
import { actionIconFor } from "@/components/action-icon";

describe("ikon aksi dari kata kerja label", () => {
  it("CRUD dasar", () => {
    expect(actionIconFor("Tambah lembaga")).toBe(Plus);
    expect(actionIconFor("Simpan")).toBe(Save);
    expect(actionIconFor("hapus")).toBe(Trash2);
    expect(actionIconFor("Ya, hapus Sekolah Dasar")).toBe(Trash2);
    expect(actionIconFor("Ekspor Excel (format IPLM)")).toBe(Download);
  });

  it("frasa spesifik menang atas kata umum", () => {
    expect(actionIconFor("Kirim ulang aktivasi")).toBe(RotateCw); // bukan Send
    expect(actionIconFor("Kirim undangan")).toBe(Send);
    expect(actionIconFor("Buka blokir")).toBe(Unlock); // bukan "Buka" periode
    expect(actionIconFor("Ya, nonaktifkan a@b.c")).toBe(Ban);
  });

  it("label proses → pemutar; label tanpa kata kerja dikenal → tanpa ikon", () => {
    expect(actionIconFor("Menyimpan…")).toBe(Loader2);
    expect(actionIconFor("Perpus SD 01")).toBeNull();
  });
});
