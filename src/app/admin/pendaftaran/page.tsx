import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { FlashMessage } from "@/components/flash-message";
import { approveRegistrationRequestAction, rejectRegistrationRequestAction } from "./actions";

export default async function PendaftaranPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const { ok, error } = await searchParams;
  const requests = await prisma.institutionRegistrationRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { type: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Pendaftaran Lembaga ({requests.length} menunggu)</h1>
      <p className="text-sm text-muted-foreground">
        Pengajuan pendaftaran mandiri dari halaman publik — di luar PRD, fitur percobaan.
      </p>
      <FlashMessage ok={ok} error={error} />
      {requests.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada pendaftaran yang menunggu.</p>}

      <ul className="space-y-4">
        {requests.map((r) => (
          <li key={r.id} className="space-y-3 rounded-md border p-4 text-sm">
            <div>
              <span className="font-semibold">{r.institutionName}</span>{" "}
              <span className="text-muted-foreground">
                ({r.type.name}) — diajukan {formatWib(r.createdAt)}
              </span>
            </div>
            <p>
              Email: <b>{r.officialEmail}</b>
            </p>
            <p>
              PIC: {r.picName}
              {r.whatsapp ? ` — WA ${r.whatsapp}` : ""}
            </p>
            <div className="flex flex-wrap items-start gap-4">
              <form action={approveRegistrationRequestAction}>
                <input type="hidden" name="requestId" value={r.id} />
                <Button type="submit" size="sm">
                  Setujui & buat lembaga
                </Button>
              </form>
              <form action={rejectRegistrationRequestAction} className="flex flex-wrap items-start gap-2">
                <input type="hidden" name="requestId" value={r.id} />
                <textarea
                  name="reason"
                  required
                  aria-label={`Alasan penolakan ${r.institutionName}`}
                  placeholder="Alasan penolakan (wajib, internal — tidak dikirim ke pendaftar)"
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
