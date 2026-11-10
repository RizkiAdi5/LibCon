import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { FlashMessage } from "@/components/flash-message";
import { approveAccountRequestAction, rejectAccountRequestAction } from "./actions";

export default async function PermintaanAkunPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const { ok, error } = await searchParams;
  const requests = await prisma.accountRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { institution: true, requestedBy: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Permintaan Akun ({requests.length} menunggu)</h1>
      <FlashMessage ok={ok} error={error} />
      {requests.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada permintaan yang menunggu.</p>}

      <ul className="space-y-4">
        {requests.map((r) => (
          <li key={r.id} className="space-y-3 rounded-md border p-4 text-sm">
            <div>
              <Link href={`/admin/peserta/${r.institutionId}`} className="font-semibold underline">
                {r.institution.libraryName}
              </Link>{" "}
              <span className="text-muted-foreground">
                (NPP {r.institution.npp}) — diajukan {r.requestedBy.username}, {formatWib(r.createdAt)}
              </span>
            </div>
            <p>
              Pengisi kedua: <b>{r.fullName}</b> ({r.email})
            </p>
            <p>Alasan: {r.reason}</p>
            <div className="flex flex-wrap items-start gap-4">
              <form action={approveAccountRequestAction}>
                <input type="hidden" name="requestId" value={r.id} />
                <Button type="submit" size="sm">
                  Setujui {r.fullName}
                </Button>
              </form>
              <form action={rejectAccountRequestAction} className="flex flex-wrap items-start gap-2">
                <input type="hidden" name="requestId" value={r.id} />
                <textarea
                  name="reason"
                  required
                  aria-label={`Alasan penolakan ${r.fullName}`}
                  placeholder="Alasan penolakan (wajib, dikirim ke pengaju)"
                  className="min-h-9 w-72 rounded-md border p-2"
                />
                <Button type="submit" variant="destructive" size="sm">
                  Tolak
                </Button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
