export type GroupableInstitution = { districtName: string; typeName: string; typeSortOrder: number };

export type InstitutionGroup<T> = {
  districtName: string;
  count: number;
  types: { typeName: string; count: number; items: T[] }[];
};

/** FR-03.08: kelompokkan lembaga per Kecamatan, lalu per Jenis, dengan jumlah per kelompok. */
export function groupInstitutions<T extends GroupableInstitution>(rows: T[]): InstitutionGroup<T>[] {
  const districts = new Map<string, Map<string, T[]>>();
  for (const row of rows) {
    const types = districts.get(row.districtName) ?? new Map<string, T[]>();
    types.set(row.typeName, [...(types.get(row.typeName) ?? []), row]);
    districts.set(row.districtName, types);
  }

  return [...districts.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "id"))
    .map(([districtName, types]) => ({
      districtName,
      count: [...types.values()].reduce((sum, items) => sum + items.length, 0),
      types: [...types.entries()]
        .map(([typeName, items]) => ({ typeName, count: items.length, items }))
        .sort(
          (a, b) =>
            a.items[0].typeSortOrder - b.items[0].typeSortOrder || a.typeName.localeCompare(b.typeName, "id"),
        ),
    }));
}
