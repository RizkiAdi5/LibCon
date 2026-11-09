/** Banner hasil aksi, dibaca dari query `?ok=` / `?error=` setelah server action redirect. */
export function FlashMessage({ ok, error }: { ok?: string; error?: string }) {
  if (error) {
    return (
      <p role="alert" className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (ok) {
    return (
      <p role="status" className="rounded-md border border-green-600/50 p-3 text-sm text-green-700">
        {ok}
      </p>
    );
  }
  return null;
}
