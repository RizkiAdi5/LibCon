-- Tahap 3 — migrasi SQL tambahan yang tidak bisa diekspresikan di schema.prisma:
-- trigger audit_logs, trigger batas 2 akun peserta, partial unique index,
-- CHECK constraint, dan pencabutan izin UPDATE/DELETE pada tabel log.
-- Lihat CLAUDE.md "Keputusan desain schema" untuk alasan tiap bagian.

-- =========================================================================
-- 1. Trigger audit_logs generik (FR-13.03)
--    Dipasang di semua tabel KECUALI yang inherently log/riwayat immutable:
--    audit_logs & activity_logs (log itu sendiri, akan infinite-loop kalau
--    ikut dipasang), serta login_attempts, answer_history, submission_snapshots
--    (PK bigint, append-only, sudah punya riwayatnya sendiri secara desain).
-- =========================================================================

CREATE OR REPLACE FUNCTION audit_log_trigger() RETURNS trigger AS $$
DECLARE
  v_actor_user_id uuid;
  v_actor_role "UserRole";
  v_source "LogSource";
  v_request_id uuid;
  v_ip text;
  v_user_agent text;
  v_old jsonb;
  v_new jsonb;
  v_action "AuditAction";
  v_changed jsonb;
  v_record_id text;
BEGIN
  v_actor_user_id := NULLIF(current_setting('app.user_id', true), '')::uuid;
  v_request_id := NULLIF(current_setting('app.request_id', true), '')::uuid;
  v_ip := NULLIF(current_setting('app.ip', true), '');
  v_user_agent := NULLIF(current_setting('app.user_agent', true), '');
  v_source := COALESCE(NULLIF(current_setting('app.source', true), '')::"LogSource", 'WEB');

  IF v_actor_user_id IS NOT NULL THEN
    SELECT role INTO v_actor_role FROM users WHERE id = v_actor_user_id;
  END IF;
  IF v_actor_role IS NULL THEN
    v_actor_role := 'SYSTEM';
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_old := NULL;
    v_action := 'INSERT';
    v_record_id := v_new ->> 'id';
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_action := 'DELETE';
    v_record_id := v_old ->> 'id';
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := v_new ->> 'id';
    IF (v_old ? 'deleted_at') AND (v_old ->> 'deleted_at') IS NULL AND (v_new ->> 'deleted_at') IS NOT NULL THEN
      v_action := 'SOFT_DELETE';
    ELSIF (v_old ? 'deleted_at') AND (v_old ->> 'deleted_at') IS NOT NULL AND (v_new ->> 'deleted_at') IS NULL THEN
      v_action := 'RESTORE';
    ELSE
      v_action := 'UPDATE';
    END IF;
  END IF;

  -- app_settings tidak punya kolom 'id', PK-nya 'key'
  IF v_record_id IS NULL AND TG_TABLE_NAME = 'app_settings' THEN
    v_record_id := COALESCE(v_new ->> 'key', v_old ->> 'key');
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(key, value)
      INTO v_changed
      FROM jsonb_each(v_new)
      WHERE value IS DISTINCT FROM (v_old -> key);
  ELSE
    v_changed := NULL;
  END IF;

  INSERT INTO audit_logs (
    created_at, actor_user_id, actor_role, action, table_name, record_id,
    old_data, new_data, changed_fields, source, request_id, ip_address, user_agent
  ) VALUES (
    now(), v_actor_user_id, v_actor_role, v_action, TG_TABLE_NAME, v_record_id,
    v_old, v_new, v_changed, v_source, v_request_id, v_ip, v_user_agent
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'regions', 'institution_types', 'institutions', 'institution_change_requests',
    'users', 'auth_tokens', 'sessions', 'account_requests',
    'survey_periods', 'period_extensions', 'questionnaires', 'sections', 'questions',
    'question_options', 'question_institution_types', 'question_conditions', 'validation_rules',
    'submissions', 'answers', 'validation_results', 'revision_requests', 'revision_request_items', 'evidence_files',
    'scoring_schemes', 'score_nodes', 'score_node_edges', 'score_node_variables', 'score_node_type_overrides',
    'score_categories', 'score_runs', 'submission_scores', 'submission_score_details',
    'email_templates', 'reminder_schedules', 'email_logs',
    'saved_report_filters', 'import_jobs', 'import_job_rows', 'app_settings'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_log_trigger()',
      t || '_audit_trigger', t
    );
  END LOOP;
END $$;

-- =========================================================================
-- 2. Trigger batas 2 akun PARTICIPANT per institution_id (BR-02, FR-05.06)
--    Lapis kedua di DB; aplikasi tetap wajib cek juga di server action.
-- =========================================================================

CREATE OR REPLACE FUNCTION enforce_max_participant_accounts() RETURNS trigger AS $$
DECLARE
  v_count int;
BEGIN
  IF NEW.role = 'PARTICIPANT' AND NEW.institution_id IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM users
    WHERE institution_id = NEW.institution_id
      AND role = 'PARTICIPANT'
      AND deleted_at IS NULL
      AND id <> NEW.id;

    IF v_count >= 2 THEN
      RAISE EXCEPTION 'Lembaga % sudah punya maksimal 2 akun peserta', NEW.institution_id
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_max_participant_accounts
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION enforce_max_participant_accounts();

-- =========================================================================
-- 3. Partial index / partial unique index (ERD §10)
-- =========================================================================

-- Satu akun utama per lembaga
CREATE UNIQUE INDEX users_one_primary_per_institution
  ON users (institution_id)
  WHERE is_primary = true AND deleted_at IS NULL;

-- Cek token aktif per user+type lebih cepat (bukan unique — boleh ada >1
-- token terpakai/kedaluwarsa historis, tapi lookup token aktif jadi cepat)
CREATE INDEX auth_tokens_active_per_user_type
  ON auth_tokens (user_id, type)
  WHERE used_at IS NULL;

-- Satu revisi terbuka per kiriman
CREATE UNIQUE INDEX revision_requests_one_open_per_submission
  ON revision_requests (submission_id)
  WHERE status = 'OPEN';

-- Satu skema skor aktif per periode
CREATE UNIQUE INDEX scoring_schemes_one_active_per_period
  ON scoring_schemes (period_id)
  WHERE status = 'ACTIVE';

-- Satu skor yang berlaku per kiriman
CREATE UNIQUE INDEX submission_scores_one_current_per_submission
  ON submission_scores (submission_id)
  WHERE is_current = true;

-- Query harian (daftar aktif) tidak menyentuh data yang di-soft-delete
CREATE INDEX regions_not_deleted ON regions (id) WHERE deleted_at IS NULL;
CREATE INDEX institution_types_not_deleted ON institution_types (id) WHERE deleted_at IS NULL;
CREATE INDEX institutions_not_deleted ON institutions (id) WHERE deleted_at IS NULL;
CREATE INDEX users_not_deleted ON users (id) WHERE deleted_at IS NULL;
CREATE INDEX survey_periods_not_deleted ON survey_periods (id) WHERE deleted_at IS NULL;
CREATE INDEX period_extensions_not_deleted ON period_extensions (id) WHERE deleted_at IS NULL;
CREATE INDEX questionnaires_not_deleted ON questionnaires (id) WHERE deleted_at IS NULL;
CREATE INDEX sections_not_deleted ON sections (id) WHERE deleted_at IS NULL;
CREATE INDEX questions_not_deleted ON questions (id) WHERE deleted_at IS NULL;
CREATE INDEX question_options_not_deleted ON question_options (id) WHERE deleted_at IS NULL;
CREATE INDEX question_conditions_not_deleted ON question_conditions (id) WHERE deleted_at IS NULL;
CREATE INDEX validation_rules_not_deleted ON validation_rules (id) WHERE deleted_at IS NULL;
CREATE INDEX evidence_files_not_deleted ON evidence_files (id) WHERE deleted_at IS NULL;
CREATE INDEX scoring_schemes_not_deleted ON scoring_schemes (id) WHERE deleted_at IS NULL;
CREATE INDEX score_nodes_not_deleted ON score_nodes (id) WHERE deleted_at IS NULL;
CREATE INDEX score_node_type_overrides_not_deleted ON score_node_type_overrides (id) WHERE deleted_at IS NULL;
CREATE INDEX score_categories_not_deleted ON score_categories (id) WHERE deleted_at IS NULL;
CREATE INDEX email_templates_not_deleted ON email_templates (id) WHERE deleted_at IS NULL;
CREATE INDEX reminder_schedules_not_deleted ON reminder_schedules (id) WHERE deleted_at IS NULL;
CREATE INDEX saved_report_filters_not_deleted ON saved_report_filters (id) WHERE deleted_at IS NULL;

-- =========================================================================
-- 4. CHECK constraint lintas kolom (ERD §10)
-- =========================================================================

ALTER TABLE score_node_edges
  ADD CONSTRAINT score_node_edges_no_self_loop
  CHECK (parent_node_id <> child_node_id);

ALTER TABLE users
  ADD CONSTRAINT users_participant_requires_institution
  CHECK (
    (role = 'PARTICIPANT' AND institution_id IS NOT NULL)
    OR (role <> 'PARTICIPANT' AND institution_id IS NULL)
  );

-- =========================================================================
-- 5. Role aplikasi least-privilege + log append-only (FR-13.08)
--
-- PENTING: REVOKE di bawah ini hanya efektif jika aplikasi benar-benar
-- connect sebagai role `libcon_app`, BUKAN sebagai superuser `postgres`
-- (superuser Postgres selalu bisa bypass semua GRANT/REVOKE). Di Supabase,
-- pastikan DATABASE_URL production memakai kredensial `libcon_app`.
-- Role dibuat TANPA password di sini (jangan commit secret) — set lewat
-- `ALTER ROLE libcon_app WITH PASSWORD '...'` secara manual per environment.
-- =========================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'libcon_app') THEN
    CREATE ROLE libcon_app LOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO libcon_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO libcon_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO libcon_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO libcon_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO libcon_app;

REVOKE UPDATE, DELETE ON audit_logs, activity_logs FROM libcon_app;

-- =========================================================================
-- 6. FK created_by/updated_by/deleted_by -> users.id (FR-13.02)
--
-- Sengaja TIDAK dimodelkan sebagai relasi Prisma (lihat header file ini dan
-- CLAUDE.md "Keputusan desain schema") supaya model User tidak punya ratusan
-- field balik. FK sesungguhnya ditambah di sini lewat SQL, digenerate dari
-- information_schema (semua kolom bernama created_by/updated_by/deleted_by
-- di schema public, kecuali audit_logs/activity_logs yang tidak punya kolom
-- ini sama sekali — keduanya memakai actor_user_id/user_id langsung).
--
-- users_created_by_fkey mereferensikan diri sendiri (users.created_by ->
-- users.id) — aman untuk baris SYSTEM yang dibuat dengan id = created_by
-- dalam satu INSERT yang sama (lihat prisma/seed.ts).
-- =========================================================================

ALTER TABLE account_requests ADD CONSTRAINT account_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE account_requests ADD CONSTRAINT account_requests_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE answer_history ADD CONSTRAINT answer_history_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE answers ADD CONSTRAINT answers_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE answers ADD CONSTRAINT answers_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE app_settings ADD CONSTRAINT app_settings_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE app_settings ADD CONSTRAINT app_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE auth_tokens ADD CONSTRAINT auth_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE auth_tokens ADD CONSTRAINT auth_tokens_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE email_logs ADD CONSTRAINT email_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE email_logs ADD CONSTRAINT email_logs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE email_templates ADD CONSTRAINT email_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE email_templates ADD CONSTRAINT email_templates_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE email_templates ADD CONSTRAINT email_templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE evidence_files ADD CONSTRAINT evidence_files_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE evidence_files ADD CONSTRAINT evidence_files_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE evidence_files ADD CONSTRAINT evidence_files_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE import_job_rows ADD CONSTRAINT import_job_rows_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE import_job_rows ADD CONSTRAINT import_job_rows_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE import_jobs ADD CONSTRAINT import_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE import_jobs ADD CONSTRAINT import_jobs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE institution_change_requests ADD CONSTRAINT institution_change_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE institution_change_requests ADD CONSTRAINT institution_change_requests_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE institution_types ADD CONSTRAINT institution_types_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE institution_types ADD CONSTRAINT institution_types_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE institution_types ADD CONSTRAINT institution_types_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE institutions ADD CONSTRAINT institutions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE institutions ADD CONSTRAINT institutions_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE institutions ADD CONSTRAINT institutions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE login_attempts ADD CONSTRAINT login_attempts_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE period_extensions ADD CONSTRAINT period_extensions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE period_extensions ADD CONSTRAINT period_extensions_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE period_extensions ADD CONSTRAINT period_extensions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE question_conditions ADD CONSTRAINT question_conditions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE question_conditions ADD CONSTRAINT question_conditions_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE question_conditions ADD CONSTRAINT question_conditions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE question_institution_types ADD CONSTRAINT question_institution_types_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE question_options ADD CONSTRAINT question_options_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE question_options ADD CONSTRAINT question_options_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE question_options ADD CONSTRAINT question_options_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE questionnaires ADD CONSTRAINT questionnaires_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE questionnaires ADD CONSTRAINT questionnaires_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE questionnaires ADD CONSTRAINT questionnaires_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE questions ADD CONSTRAINT questions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE questions ADD CONSTRAINT questions_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE questions ADD CONSTRAINT questions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE regions ADD CONSTRAINT regions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE regions ADD CONSTRAINT regions_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE regions ADD CONSTRAINT regions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE reminder_schedules ADD CONSTRAINT reminder_schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE reminder_schedules ADD CONSTRAINT reminder_schedules_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE reminder_schedules ADD CONSTRAINT reminder_schedules_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE revision_request_items ADD CONSTRAINT revision_request_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE revision_request_items ADD CONSTRAINT revision_request_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE revision_requests ADD CONSTRAINT revision_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE revision_requests ADD CONSTRAINT revision_requests_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE saved_report_filters ADD CONSTRAINT saved_report_filters_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE saved_report_filters ADD CONSTRAINT saved_report_filters_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE saved_report_filters ADD CONSTRAINT saved_report_filters_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE score_categories ADD CONSTRAINT score_categories_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE score_categories ADD CONSTRAINT score_categories_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE score_categories ADD CONSTRAINT score_categories_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE score_node_edges ADD CONSTRAINT score_node_edges_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE score_node_edges ADD CONSTRAINT score_node_edges_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE score_node_type_overrides ADD CONSTRAINT score_node_type_overrides_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE score_node_type_overrides ADD CONSTRAINT score_node_type_overrides_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE score_node_type_overrides ADD CONSTRAINT score_node_type_overrides_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE score_node_variables ADD CONSTRAINT score_node_variables_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE score_nodes ADD CONSTRAINT score_nodes_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE score_nodes ADD CONSTRAINT score_nodes_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE score_nodes ADD CONSTRAINT score_nodes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE score_runs ADD CONSTRAINT score_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE score_runs ADD CONSTRAINT score_runs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE scoring_schemes ADD CONSTRAINT scoring_schemes_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE scoring_schemes ADD CONSTRAINT scoring_schemes_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE scoring_schemes ADD CONSTRAINT scoring_schemes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE sections ADD CONSTRAINT sections_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE sections ADD CONSTRAINT sections_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE sections ADD CONSTRAINT sections_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE sessions ADD CONSTRAINT sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE sessions ADD CONSTRAINT sessions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE submission_score_details ADD CONSTRAINT submission_score_details_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE submission_scores ADD CONSTRAINT submission_scores_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE submission_scores ADD CONSTRAINT submission_scores_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE submission_snapshots ADD CONSTRAINT submission_snapshots_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE submissions ADD CONSTRAINT submissions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE submissions ADD CONSTRAINT submissions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE survey_periods ADD CONSTRAINT survey_periods_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE survey_periods ADD CONSTRAINT survey_periods_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE survey_periods ADD CONSTRAINT survey_periods_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE users ADD CONSTRAINT users_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE users ADD CONSTRAINT users_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE users ADD CONSTRAINT users_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE validation_results ADD CONSTRAINT validation_results_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE validation_results ADD CONSTRAINT validation_results_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE validation_rules ADD CONSTRAINT validation_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE validation_rules ADD CONSTRAINT validation_rules_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE validation_rules ADD CONSTRAINT validation_rules_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
