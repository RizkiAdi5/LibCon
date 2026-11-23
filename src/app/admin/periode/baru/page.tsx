import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { PeriodForm } from "../period-form";

export default async function PeriodeBaruPage() {
  await requireRole(["SUPER_ADMIN"]);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/periode" className="text-sm underline">
          ← Daftar periode
        </Link>
        <h1 className="text-xl font-semibold">Buat periode</h1>
      </div>
      <div className="box max-w-3xl p-5">
        <PeriodForm />
      </div>
    </div>
  );
}
