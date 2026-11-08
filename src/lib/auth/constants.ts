/**
 * ID users.id untuk akun teknis SYSTEM (cron, trigger, impor). UUID tetap
 * (bukan acak) supaya bisa dirujuk langsung di kode dan migrasi tanpa query.
 * Baris nyata dibuat di seed (Tahap 5) — lihat CLAUDE.md "Keputusan yang
 * sudah diambil" (role SYSTEM eksplisit).
 */
export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
