import type { ReactNode } from "react";
import Image from "next/image";

/** Halaman publik (login, aktivasi, lupa/reset password) gaya Rubick: sisi kiri biru dengan identitas, kanan form. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="relative hidden overflow-hidden bg-brand px-12 py-10 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <Image src="/logo-libcon.png" alt="" width={44} height={33} className="brightness-0 invert" priority />
          <span className="text-xl font-medium tracking-wide">LibCon</span>
        </div>
        <div className="my-auto max-w-md space-y-4">
          <h1 className="text-3xl leading-snug font-medium text-white">
            Lomba Perpustakaan Terbaik
            <br />
            Kota Pontianak
          </h1>
          <p className="text-base text-white/75">Daftarkan lembaga, isi survei, pantau verifikasi, dan lihat hasil penilaian di satu tempat.</p>
        </div>
        <div className="w-fit rounded-md bg-white px-4 py-3">
          <Image src="/logo-disperpusip.png" alt="Pemerintah Kota Pontianak — DISPERPUSIP" width={245} height={60} />
        </div>
        {/* ornamen lingkaran lembut seperti latar template */}
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-white/5" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 size-96 rounded-full bg-white/5" />
      </section>
      <div className="flex flex-col">
        <div className="flex items-center gap-2 px-6 pt-6 lg:hidden">
          <Image src="/logo-libcon.png" alt="" width={32} height={24} priority />
          <span className="font-medium text-brand">LibCon</span>
        </div>
        {children}
      </div>
    </div>
  );
}
