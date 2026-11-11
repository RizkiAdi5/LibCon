import { describe, expect, it } from "vitest";
import { htmlVariables } from "@/lib/email/send";

describe("htmlVariables (variabel email di-escape)", () => {
  it("teks pengguna tidak bisa menyisipkan HTML; baris baru jadi <br>", () => {
    expect(htmlVariables({ catatan: '<a href="x">klik</a>\nbaris 2', nama: "Perpus A & B" })).toEqual({
      catatan: "&lt;a href=&quot;x&quot;&gt;klik&lt;/a&gt;<br>baris 2",
      nama: "Perpus A &amp; B",
    });
  });

  it("link tetap valid di dalam href", () => {
    expect(htmlVariables({ link: "https://app/aktivasi/abc?x=1&y=2" }).link).toBe("https://app/aktivasi/abc?x=1&amp;y=2");
  });
});
