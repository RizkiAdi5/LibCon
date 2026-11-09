import { prisma } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FlashMessage } from "@/components/flash-message";
import type { Region } from "@/generated/prisma/client";
import { createRegionAction, toggleRegionActiveAction, updateRegionAction } from "./actions";

const LEVEL_LABEL = { CITY: "Kota", DISTRICT: "Kecamatan", VILLAGE: "Kelurahan" } as const;

function RegionRow({ region }: { region: Region }) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <span className="w-24 text-xs text-muted-foreground">{LEVEL_LABEL[region.level]}</span>
      <form action={updateRegionAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={region.id} />
        <Input name="code" defaultValue={region.code} aria-label={`Kode ${region.name}`} className="w-36" required />
        <Input name="name" defaultValue={region.name} aria-label={`Nama ${region.name}`} className="w-56" required />
        <Button type="submit" variant="outline" size="sm">
          Simpan
        </Button>
      </form>
      <form action={toggleRegionActiveAction}>
        <input type="hidden" name="id" value={region.id} />
        <Button type="submit" variant="ghost" size="sm">
          {region.isActive ? "Nonaktifkan" : "Aktifkan"}
        </Button>
      </form>
      <span className={region.isActive ? "text-xs text-green-700" : "text-xs text-destructive"}>
        {region.isActive ? "Aktif" : "Nonaktif"}
      </span>
    </div>
  );
}

export default async function WilayahPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const regions = await prisma.region.findMany({ where: { deletedAt: null }, orderBy: [{ name: "asc" }] });
  const childrenOf = (parentId: string | null) => regions.filter((r) => r.parentId === parentId);
  const parentOptions = regions.filter((r) => r.level !== "VILLAGE");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Wilayah</h1>
      <FlashMessage ok={ok} error={error} />

      <form action={createRegionAction} className="flex flex-wrap items-end gap-3 rounded-md border p-4">
        <div className="space-y-1">
          <Label htmlFor="parentId">Induk</Label>
          <select id="parentId" name="parentId" className="h-9 rounded-md border px-2 text-sm">
            <option value="">— Kota baru —</option>
            {parentOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {LEVEL_LABEL[r.level]} {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="code">Kode</Label>
          <Input id="code" name="code" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="name">Nama</Label>
          <Input id="name" name="name" required />
        </div>
        <Button type="submit">Tambah wilayah</Button>
      </form>

      <div className="space-y-4">
        {childrenOf(null).map((city) => (
          <section key={city.id} className="rounded-md border p-4">
            <RegionRow region={city} />
            {childrenOf(city.id).map((district) => (
              <div key={district.id} className="ml-6 border-l pl-4">
                <RegionRow region={district} />
                <div className="ml-6 border-l pl-4">
                  {childrenOf(district.id).map((village) => (
                    <RegionRow key={village.id} region={village} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
