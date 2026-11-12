import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { ACCOUNT_STATUS } from "@/lib/accountStatus";
import { getLockoutPolicy } from "@/lib/settings";
import { isPermanentlyBlocked } from "@/lib/auth/loginThrottle";
import { formatWib } from "@/lib/date";
import { FlashMessage } from "@/components/flash-message";
import { ConfirmAction } from "@/components/confirm-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminAccountAction, inviteAdminAction } from "./actions";

function Act({ userId, action, label }: { userId: string; action: string; label: string }) {
  return (
    <form action={adminAccountAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="action" value={action} />
      <button type="submit" className="text-xs underline">
        {label}
      </button>
    </form>
  );
}

/** FR-14.01: kelola pengguna admin (Super Admin). */
const PAGE_LIMIT = 100;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; q?: string }> }) {
  const me = await requireRole(["SUPER_ADMIN"]);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const where = {
    role: { in: ["ADMIN" as const, "SUPER_ADMIN" as const] },
    deletedAt: null,
    ...(q && { OR: [{ fullName: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] }),
  };
  const [admins, total, policy] = await Promise.all([
    prisma.user.findMany({ where, orderBy: [{ role: "desc" }, { fullName: "asc" }], take: PAGE_LIMIT }),
    prisma.user.count({ where }),
    getLockoutPolicy(),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold">Pengguna admin</h1>
      <FlashMessage ok={sp.ok} error={sp.error} />

      <form action={inviteAdminAction} className="flex flex-wrap items-end gap-3 rounded-md border p-4 text-sm">
        <div className="space-y-1">
          <Label htmlFor="fullName">Nama lengkap</Label>
          <Input id="fullName" name="fullName" required className="h-9 w-56" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required className="h-9 w-64" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="role">Peran</Label>
          <select id="role" name="role" defaultValue="ADMIN" className="h-9 rounded-md border px-2">
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
        </div>
        <Button type="submit" size="sm">
          Kirim undangan
        </Button>
      </form>

      <form className="flex items-end gap-2 text-sm">
        <div className="space-y-1">
          <Label htmlFor="q">Cari nama/email</Label>
          <Input id="q" name="q" defaultValue={q} className="h-9 w-64" />
        </div>
        <Button type="submit" size="sm" variant="outline">
          Cari
        </Button>
        <span className="pb-2 text-muted-foreground">
          {total > admins.length ? `Menampilkan ${admins.length} dari ${total} — persempit pencarian` : `${total} akun`}
        </span>
      </form>

      <table className="w-full text-sm" data-testid="admin-table">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-1">Nama</th>
            <th>Email</th>
            <th>Peran</th>
            <th>Status</th>
            <th>Login terakhir</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {admins.map((a) => {
            const self = a.id === me.id;
            const blocked = isPermanentlyBlocked(a.failedLoginCount, policy);
            return (
              <tr key={a.id} className="border-t align-top">
                <td className="py-1">
                  {a.fullName}
                  {self && <span className="text-xs text-muted-foreground"> (Anda)</span>}
                </td>
                <td>{a.email}</td>
                <td>{a.role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}</td>
                <td className={ACCOUNT_STATUS[a.status].className}>
                  {ACCOUNT_STATUS[a.status].label}
                  {blocked && <span className="block text-destructive">Diblokir</span>}
                </td>
                <td>{a.lastLoginAt ? formatWib(a.lastLoginAt) : "–"}</td>
                <td className="flex flex-wrap gap-3">
                  {!self && a.role === "ADMIN" && <Act userId={a.id} action="role-super" label="Jadikan Super Admin" />}
                  {!self && a.role === "SUPER_ADMIN" && <Act userId={a.id} action="role-admin" label="Jadikan Admin" />}
                  {a.status === "PENDING_ACTIVATION" && <Act userId={a.id} action="resend" label="Kirim ulang undangan" />}
                  {a.status === "ACTIVE" && <Act userId={a.id} action="reset-password" label="Reset password" />}
                  {blocked && <Act userId={a.id} action="unblock" label="Buka blokir" />}
                  {a.status === "DISABLED" && <Act userId={a.id} action="enable" label="Aktifkan" />}
                  {!self && a.status !== "DISABLED" && (
                    <ConfirmAction
                      action={adminAccountAction}
                      fields={{ userId: a.id, action: "disable" }}
                      label="Nonaktifkan"
                      confirmLabel={`Ya, nonaktifkan ${a.email}`}
                      impact="Akun tidak bisa login dan sesi yang sedang berjalan diakhiri. Riwayat aksinya tetap tersimpan."
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
