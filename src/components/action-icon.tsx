import {
  Archive,
  ArchiveRestore,
  Ban,
  BookCheck,
  Calculator,
  CalendarPlus,
  Check,
  Copy,
  DoorOpen,
  Download,
  Eye,
  EyeOff,
  FlaskConical,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Megaphone,
  PenLine,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  RotateCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Unlink,
  Unlock,
  Upload,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { createElement } from "react";
import { cn } from "@/lib/utils";

/**
 * Ikon aksi dipilih dari KATA KERJA di awal label tombol (Bahasa Indonesia), supaya semua tombol
 * CRUD konsisten tanpa memasang ikon satu per satu. Urutan penting: frasa lebih spesifik dulu.
 */
const ACTION_ICONS: [RegExp, LucideIcon][] = [
  [/…$|\.\.\.$/, Loader2], // label proses ("Menyimpan…") → pemutar
  [/^(kirim ulang|minta link baru)/i, RotateCw],
  [/^buka blokir/i, Unlock],
  [/^(batal|tarik)/i, XCircle],
  [/^(tambah|buat|ajukan)/i, Plus],
  [/^simpan/i, Save],
  [/^(ubah|edit|atur|perbaiki)/i, Pencil],
  [/^hapus/i, Trash2],
  [/^(lihat|pratinjau|tampilkan)/i, Eye],
  [/^(ekspor|unduh|laporan ringkas|rapor)/i, Download],
  [/^(impor|unggah)/i, Upload],
  [/^(kirim|aktivasi & masuk)/i, Send],
  [/^terapkan/i, SlidersHorizontal],
  [/^cari/i, Search],
  [/^(setujui|terima|verifikasi|ya, verifikasi)/i, Check],
  [/^tolak/i, X],
  [/^(ya, )?nonaktifkan/i, Ban],
  [/^(aktifkan|ya, aktifkan)/i, Power],
  [/^(pulihkan)/i, ArchiveRestore],
  [/^(duplikat|salin)/i, Copy],
  [/^(terbitkan|ya, terbitkan)/i, BookCheck],
  [/^(publikasikan|ya, publikasikan)/i, Megaphone],
  [/^sembunyikan/i, EyeOff],
  [/^uji/i, FlaskConical],
  [/^(hitung|ya, hitung)/i, Calculator],
  [/^(reset password|ganti password|buat password)/i, KeyRound],
  [/^masuk/i, LogIn],
  [/^keluar/i, LogOut],
  [/^jadikan/i, ShieldCheck],
  [/^hubungkan/i, Link2],
  [/^lepas/i, Unlink],
  [/^pdf$/i, Download],
  [/^minta revisi/i, RotateCcw],
  [/^perpanjang/i, CalendarPlus],
  [/^(buka|ya, buka)/i, DoorOpen],
  [/^(tutup|ya, tutup)/i, Lock],
  [/^(arsipkan|ya, arsipkan)/i, Archive],
  [/^(isi|lanjutkan|mulai)/i, PenLine],
  [/^ya, hapus/i, Trash2],
];

export function actionIconFor(label: string): LucideIcon | null {
  const text = label.trim();
  return ACTION_ICONS.find(([re]) => re.test(text))?.[1] ?? null;
}

/**
 * Isi tombol/tautan aksi "ikon saja" (permintaan user): ikon terlihat + tooltip, teks tetap ada
 * untuk pembaca layar (sr-only) sehingga nama aksesibel tidak berubah. Tanpa ikon cocok → teks biasa.
 */
export function IconOnly({ label, text = label, className, tooltip = true }: { label: string; text?: string; className?: string; tooltip?: boolean }) {
  if (!actionIconFor(label)) return <>{text}</>;
  return (
    <>
      {/* tooltip=false bila elemen induk sudah ber-title (mis. summary ConfirmAction) */}
      <span title={tooltip ? text : undefined} className="inline-flex">
        <ActionIcon label={label} className={className} />
      </span>
      <span className="sr-only">{text}</span>
    </>
  );
}

/** Ikon untuk label aksi (dekoratif — teks label tetap jadi nama yang dibaca pembaca layar). */
export function ActionIcon({ label, className }: { label: string; className?: string }) {
  const icon = actionIconFor(label);
  // createElement: ikon diambil dari tabel modul (bukan komponen yang dibuat saat render)
  return icon && createElement(icon, { "aria-hidden": true, className: cn("size-4 shrink-0", icon === Loader2 && "animate-spin", className) });
}
