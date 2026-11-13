-- =========================================================================
-- FR-13.08: audit_logs & activity_logs dipartisi per bulan (RANGE created_at).
--
-- - Data lama dipindah utuh (tidak ada baris yang dihapus); sequence id tetap.
-- - PK menjadi (id, created_at) — syarat Postgres: PK tabel terpartisi wajib
--   memuat kolom partisi. schema.prisma ikut diubah ke @@id([id, createdAt]).
-- - Partisi bulanan dibuat oleh ensure_log_partitions(n) (dipanggil cron
--   reminder harian, n bulan ke depan); partisi DEFAULT = jaring pengaman
--   supaya INSERT tidak pernah gagal bila cron terlewat.
-- - Retensi minimal 5 tahun: TIDAK ada penghapusan otomatis. Partisi yang
--   lebih tua dari 5 tahun boleh di-DETACH lalu diarsip manual oleh DBA.
-- - Append-only (FR-13.08): ALTER DEFAULT PRIVILEGES Tahap 3 memberi
--   UPDATE/DELETE ke libcon_app untuk SETIAP tabel baru — termasuk partisi —
--   jadi setiap partisi di-REVOKE juga, di sini dan di ensure_log_partitions.
-- Migrasi SQL murni (bukan dari prisma migrate dev).
-- =========================================================================

CREATE OR REPLACE FUNCTION ensure_log_partitions(months_ahead int DEFAULT 3, from_month date DEFAULT now()::date)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  t text;
  m date;
  part text;
  last_month date := (date_trunc('month', now()) + make_interval(months => months_ahead))::date;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_logs', 'activity_logs'] LOOP
    m := date_trunc('month', from_month)::date;
    WHILE m <= last_month LOOP
      part := format('%s_%s', t, to_char(m, 'YYYY_MM'));
      IF to_regclass(part) IS NULL THEN
        EXECUTE format('CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)', part, t, m, (m + interval '1 month')::date);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'libcon_app') THEN
          EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM libcon_app', part);
        END IF;
      END IF;
      m := (m + interval '1 month')::date;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------- audit_logs
ALTER TABLE audit_logs RENAME TO audit_logs_old;
ALTER TABLE audit_logs_old RENAME CONSTRAINT audit_logs_pkey TO audit_logs_old_pkey;
ALTER INDEX audit_logs_table_name_record_id_created_at_idx RENAME TO audit_logs_old_table_record_idx;
ALTER INDEX audit_logs_actor_user_id_created_at_idx RENAME TO audit_logs_old_actor_idx;
ALTER INDEX audit_logs_request_id_idx RENAME TO audit_logs_old_request_idx;

CREATE TABLE audit_logs (LIKE audit_logs_old INCLUDING DEFAULTS) PARTITION BY RANGE (created_at);
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id, created_at);
CREATE INDEX audit_logs_table_name_record_id_created_at_idx ON audit_logs (table_name, record_id, created_at);
CREATE INDEX audit_logs_actor_user_id_created_at_idx ON audit_logs (actor_user_id, created_at);
CREATE INDEX audit_logs_request_id_idx ON audit_logs (request_id);
ALTER SEQUENCE audit_logs_id_seq OWNED BY audit_logs.id;
CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;

-- ---------------------------------------------------------------- activity_logs
ALTER TABLE activity_logs RENAME TO activity_logs_old;
ALTER TABLE activity_logs_old RENAME CONSTRAINT activity_logs_pkey TO activity_logs_old_pkey;
ALTER INDEX activity_logs_user_id_created_at_idx RENAME TO activity_logs_old_user_idx;
ALTER INDEX activity_logs_activity_created_at_idx RENAME TO activity_logs_old_activity_idx;

CREATE TABLE activity_logs (LIKE activity_logs_old INCLUDING DEFAULTS) PARTITION BY RANGE (created_at);
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id, created_at);
CREATE INDEX activity_logs_user_id_created_at_idx ON activity_logs (user_id, created_at);
CREATE INDEX activity_logs_activity_created_at_idx ON activity_logs (activity, created_at);
ALTER SEQUENCE activity_logs_id_seq OWNED BY activity_logs.id;
CREATE TABLE activity_logs_default PARTITION OF activity_logs DEFAULT;

-- ---------------------------------------------------------------- partisi + pindah data
SELECT ensure_log_partitions(
  3,
  LEAST(
    COALESCE((SELECT min(created_at) FROM audit_logs_old), now()),
    COALESCE((SELECT min(created_at) FROM activity_logs_old), now())
  )::date
);

INSERT INTO audit_logs SELECT * FROM audit_logs_old;
INSERT INTO activity_logs SELECT * FROM activity_logs_old;
DROP TABLE audit_logs_old;
DROP TABLE activity_logs_old;

-- ---------------------------------------------------------------- hak akses append-only
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'libcon_app') THEN
    GRANT SELECT, INSERT ON audit_logs, activity_logs TO libcon_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs, activity_logs, audit_logs_default, activity_logs_default FROM libcon_app;
  END IF;
END $$;
