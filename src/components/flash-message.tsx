/** Banner hasil aksi, dibaca dari query `?ok=` / `?error=` setelah server action redirect. */
export function FlashMessage({ ok, error }: { ok?: string; error?: string }) {
  if (error) {
    return (
      <p role="alert" className="rounded-md bg-destructive px-4 py-3 text-sm text-white shadow-xs">
        {error}
      </p>
    );
  }
  if (ok) {
    return (
      <p role="status" className="rounded-md bg-brand px-4 py-3 text-sm text-white shadow-xs">
        {ok}
      </p>
    );
  }
  return null;
}
