import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { FlashMessage } from "@/components/flash-message";
import { DISABLE_SECOND_ACCOUNT, type DisableSecondAccountChange } from "@/lib/validation/accountRequest";
import { approveAccountRequestAction, rejectAccountRequestAction, reviewDisableRequestAction } from "./actions";

export default async function PermintaanAkunPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const { ok, error } = await searchParams;
  const [requests, disableRequests] = await Promise.all([
    prisma.accountRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { institution: true, requestedBy: true },
    }),
    prisma.institutionChangeRequest.findMany({
      where: { status: "PENDING", changes: { path: ["type"], equals: DISABLE_SECOND_ACCOUNT } },
      orderBy: { createdAt: "asc" },
      include: { institution: true, requestedBy: true },
    }),
  ]);

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

      {/* FR-05.08 */}
      <section className="space-y-3">
        <h2 className="font-semibold">Permintaan nonaktifkan akun kedua ({disableRequests.length} menunggu)</h2>
        {disableRequests.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada permintaan yang menunggu.</p>}
        <ul className="space-y-4">
          {disableRequests.map((r) => {
            const change = r.changes as DisableSecondAccountChange;
            return (
              <li key={r.id} className="space-y-3 rounded-md border p-4 text-sm">
                <div>
                  <Link href={`/admin/peserta/${r.institutionId}`} className="font-semibold underline">
                    {r.institution.libraryName}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    — diajukan {r.requestedBy.username}, {formatWib(r.createdAt)}
                  </span>
                </div>
                <p>
                  Nonaktifkan akun <b>{change.username}</b>. Alasan: {r.reason}
                </p>
                <div className="flex flex-wrap items-start gap-4">
                  <form action={reviewDisableRequestAction}>
                    <input type="hidden" name="requestId" value={r.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <Button type="submit" size="sm">
                      Nonaktifkan {change.username}
                    </Button>
                  </form>
                  <form action={reviewDisableRequestAction} className="flex flex-wrap items-start gap-2">
                    <input type="hidden" name="requestId" value={r.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <textarea name="note" required aria-label={`Catatan penolakan ${change.username}`} placeholder="Catatan penolakan (wajib, tampil di portal peserta)" className="min-h-9 w-72 rounded-md border p-2" />
                    <Button type="submit" variant="destructive" size="sm">
                      Tolak
                    </Button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
