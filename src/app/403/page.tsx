export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4 text-center">
      <div>
        <h1 className="text-xl font-semibold">403 — Akses ditolak</h1>
        <p className="text-muted-foreground">Anda tidak punya izin untuk membuka halaman ini.</p>
        <a href="/login" className="underline">
          Kembali ke login
        </a>
      </div>
    </main>
  );
}
