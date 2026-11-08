import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db/client";
import { withDb } from "../src/lib/db/withDb";
import { runWithRequestContext } from "../src/lib/db/requestContext";
import { SYSTEM_USER_ID } from "../src/lib/auth/constants";

const EMAIL_TEMPLATES = [
  {
    key: "ACTIVATION",
    subject: "Aktivasi akun LibCon — {nama_lembaga}",
    bodyHtml:
      "<p>Halo {nama_lembaga},</p><p>Gunakan username <b>{npp}</b> dan klik tombol berikut untuk membuat password:</p><p><a href=\"{link}\">Aktivasi Akun</a></p><p>Link berlaku 24 jam.</p>",
  },
  {
    key: "PASSWORD_RESET",
    subject: "Reset password LibCon",
    bodyHtml:
      '<p>Kami menerima permintaan reset password untuk akun Anda.</p><p><a href="{link}">Reset Password</a></p><p>Link berlaku 24 jam. Jika Anda tidak meminta ini, abaikan email ini.</p>',
  },
  {
    key: "ACCOUNT_LOCKED",
    subject: "Akun Anda terkunci sementara",
    bodyHtml:
      "<p>Akun Anda terkunci sampai {tenggat} karena 5 kali gagal login. Jika ini bukan Anda, segera reset password.</p>",
  },
  {
    key: "REMINDER_DEADLINE",
    subject: "Pengingat: tenggat pengisian survei {tenggat}",
    bodyHtml:
      "<p>Halo {nama_lembaga}, survei lembaga Anda masih belum terkirim. Tenggat pengisian: {tenggat}.</p><p><a href=\"{link}\">Lanjutkan Mengisi</a></p>",
  },
  {
    key: "REMINDER_ACTIVATION",
    subject: "Pengingat: aktivasi akun LibCon belum selesai",
    bodyHtml:
      "<p>Halo {nama_lembaga}, akun Anda belum diaktivasi. <a href=\"{link}\">Aktivasi sekarang</a>.</p>",
  },
  {
    key: "REMINDER_REVISION",
    subject: "Pengingat: batas revisi besok",
    bodyHtml: "<p>Halo {nama_lembaga}, batas waktu revisi survei Anda adalah {tenggat}. Catatan: {catatan}</p>",
  },
  {
    key: "SUBMISSION_RECEIPT",
    subject: "Tanda terima pengiriman survei",
    bodyHtml: "<p>Survei lembaga {nama_lembaga} telah kami terima. Ringkasan jawaban terlampir.</p>",
  },
  {
    key: "REVISION_OPENED",
    subject: "Revisi survei dibuka — {nama_lembaga}",
    bodyHtml:
      "<p>Admin membuka revisi untuk beberapa soal pada survei Anda. Catatan: {catatan}</p><p>Batas revisi: {tenggat}</p>",
  },
  {
    key: "ACCOUNT_REQUEST_APPROVED",
    subject: "Permintaan akun kedua disetujui",
    bodyHtml: "<p>Permintaan akun kedua untuk {nama_lembaga} telah disetujui. Email aktivasi akan menyusul.</p>",
  },
  {
    key: "ACCOUNT_REQUEST_REJECTED",
    subject: "Permintaan akun kedua ditolak",
    bodyHtml: "<p>Permintaan akun kedua untuk {nama_lembaga} ditolak. Alasan: {catatan}</p>",
  },
  {
    key: "SCORE_PUBLISHED",
    subject: "Skor periode ini telah dipublikasikan",
    bodyHtml: "<p>Skor lembaga {nama_lembaga} sudah bisa dilihat di menu Skor Saya.</p>",
  },
] as const;

async function main() {
  await runWithRequestContext(
    {
      userId: SYSTEM_USER_ID,
      requestId: randomUUID(),
      ip: null,
      userAgent: null,
      source: "SYSTEM",
    },
    () =>
      withDb(async (tx) => {
        // SYSTEM — self-referential created_by, aman karena satu INSERT yang sama (lihat CLAUDE.md)
        await tx.user.upsert({
          where: { id: SYSTEM_USER_ID },
          create: {
            id: SYSTEM_USER_ID,
            role: "SYSTEM",
            username: "SYSTEM",
            email: "system@libcon.local",
            fullName: "SYSTEM",
            status: "ACTIVE",
            createdBy: SYSTEM_USER_ID,
          },
          update: {},
        });

        // Super Admin pertama — PENDING_ACTIVATION, tanpa password (aktivasi lewat token di Tahap 6)
        const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL ?? "superadmin@libcon.local";
        await tx.user.upsert({
          where: { email: superAdminEmail },
          create: {
            role: "SUPER_ADMIN",
            username: superAdminEmail,
            email: superAdminEmail,
            fullName: "Super Admin LibCon",
            status: "PENDING_ACTIVATION",
            createdBy: SYSTEM_USER_ID,
          },
          update: {},
        });

        // Wilayah contoh: Kota Pontianak > Pontianak Kota > Benua Melayu Laut (kode Kemendagri)
        const city = await tx.region.upsert({
          where: { code: "6171" },
          create: { level: "CITY", code: "6171", name: "Kota Pontianak", createdBy: SYSTEM_USER_ID },
          update: {},
        });
        const district = await tx.region.upsert({
          where: { code: "617101" },
          create: {
            level: "DISTRICT",
            code: "617101",
            name: "Pontianak Kota",
            parentId: city.id,
            createdBy: SYSTEM_USER_ID,
          },
          update: {},
        });
        await tx.region.upsert({
          where: { code: "6171011001" },
          create: {
            level: "VILLAGE",
            code: "6171011001",
            name: "Benua Melayu Laut",
            parentId: district.id,
            createdBy: SYSTEM_USER_ID,
          },
          update: {},
        });

        // Jenis peserta awal (FR-02.02)
        for (const t of [
          { code: "SD", name: "Sekolah Dasar", sortOrder: 1 },
          { code: "SMP", name: "Sekolah Menengah Pertama", sortOrder: 2 },
          { code: "TBM", name: "Taman Bacaan Masyarakat", sortOrder: 3 },
        ]) {
          await tx.institutionType.upsert({
            where: { code: t.code },
            create: { ...t, createdBy: SYSTEM_USER_ID },
            update: {},
          });
        }

        // Template email (FR-14.02)
        for (const t of EMAIL_TEMPLATES) {
          await tx.emailTemplate.upsert({
            where: { key: t.key },
            create: { key: t.key, subject: t.subject, bodyHtml: t.bodyHtml, createdBy: SYSTEM_USER_ID },
            update: {},
          });
        }

        // Pengaturan awal (BR-04, BR-05, BR-15)
        await tx.appSetting.upsert({
          where: { key: "password_policy" },
          create: {
            key: "password_policy",
            value: {
              minLength: 10,
              requireUppercase: true,
              requireLowercase: true,
              requireNumber: true,
              requireSymbol: true,
              forbidNppOrInstitutionName: true,
            },
            createdBy: SYSTEM_USER_ID,
          },
          update: {},
        });
        await tx.appSetting.upsert({
          where: { key: "lockout_policy" },
          create: {
            key: "lockout_policy",
            value: { maxFailedAttempts: 5, lockoutMinutes: 15 },
            createdBy: SYSTEM_USER_ID,
          },
          update: {},
        });
        await tx.appSetting.upsert({
          where: { key: "passing_score_threshold" },
          create: { key: "passing_score_threshold", value: { threshold: 70 }, createdBy: SYSTEM_USER_ID },
          update: {},
        });
      }),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
