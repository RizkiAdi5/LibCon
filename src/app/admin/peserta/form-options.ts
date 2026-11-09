import { prisma } from "@/lib/db/client";

export type DistrictOption = { id: string; name: string; villages: { id: string; name: string }[] };
export type TypeOption = { id: string; name: string };

/**
 * Opsi form lembaga: hanya master aktif (PRD §5.2), ditambah nilai lembaga
 * saat ini walau sudah dinonaktifkan supaya form ubah tetap bisa disimpan.
 */
export async function loadInstitutionFormOptions(current?: { typeId: string; regionId: string }) {
  const [types, districts] = await Promise.all([
    prisma.institutionType.findMany({
      where: { deletedAt: null, OR: [{ isActive: true }, { id: current?.typeId }] },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.region.findMany({
      where: { level: "DISTRICT", deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        children: { where: { deletedAt: null, level: "VILLAGE" }, orderBy: { name: "asc" } },
      },
    }),
  ]);

  const districtOptions: DistrictOption[] = districts
    .map((d) => ({
      id: d.id,
      name: d.name,
      villages: d.children
        .filter((v) => (v.isActive && d.isActive) || v.id === current?.regionId)
        .map((v) => ({ id: v.id, name: v.name })),
    }))
    .filter((d) => d.villages.length > 0);

  return { types: types as TypeOption[], districts: districtOptions };
}
