import { getRequestContext } from "./requestContext";

/** FR-13.02: created_by diisi otomatis dari context, tidak boleh kosong. */
export function withCreatedBy<T extends Record<string, unknown>>(data: T): T & { createdBy: string } {
  const ctx = getRequestContext();
  return { ...data, createdBy: ctx.userId };
}

/**
 * FR-13.02: updated_by diisi otomatis dari context. Jika `data.deletedAt`
 * diset (soft delete) dan caller belum menyertakan `deletedBy`, isi juga
 * deletedBy dari context yang sama.
 */
export function withUpdatedBy<T extends Record<string, unknown>>(
  data: T,
): T & { updatedBy: string; deletedBy?: string } {
  const ctx = getRequestContext();
  const next: Record<string, unknown> = { ...data, updatedBy: ctx.userId };
  if ("deletedAt" in data && data.deletedAt != null && next.deletedBy === undefined) {
    next.deletedBy = ctx.userId;
  }
  return next as T & { updatedBy: string; deletedBy?: string };
}
