import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";

const MENU = [
  { href: "/admin/pengaturan/admin", title: "Pengguna admin", desc: "Undang admin, ubah peran, nonaktifkan, reset password." },
  { href: "/admin/pengaturan/template-email", title: "Template email", desc: "Ubah subjek & isi, pratinjau, kirim uji." },
  { href: "/admin/pengaturan/keamanan", title: "Keamanan", desc: "Kebijakan password, batas gagal login, lama kunci." },
  { href: "/admin/pengaturan/identitas", title: "Identitas", desc: "Nama & alamat Perpustakaan Kota, tanda tangan rapor, identitas ekspor IPLM." },
  { href: "/admin/pengaturan/wilayah", title: "Wilayah", desc: "Kota, kecamatan, kelurahan." },
  { href: "/admin/pengaturan/jenis-peserta", title: "Jenis peserta", desc: "SD, SMP, TBM, dan jenis lain." },
];

/** PRD §5.13 / menu Pengaturan (Super Admin). */
export default async function PengaturanPage() {
  await requireRole(["SUPER_ADMIN"]);
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Pengaturan</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {MENU.map((m) => (
          <li key={m.href} className="rounded-md border p-3">
            <Link href={m.href} className="font-medium underline">
              {m.title}
            </Link>
            <p className="text-sm text-muted-foreground">{m.desc}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
