import { requireRole } from "@/lib/auth/guard";
import { PeriodForm } from "../period-form";

export default async function PeriodeBaruPage() {
  await requireRole(["SUPER_ADMIN"]);

  return (
    <div className="flex justify-center">
      <div className="w-full max-w-3xl space-y-4">
        <h1 className="text-xl font-semibold">Buat periode</h1>
        <div className="box p-5">
          <PeriodForm />
        </div>
      </div>
    </div>
  );
}
