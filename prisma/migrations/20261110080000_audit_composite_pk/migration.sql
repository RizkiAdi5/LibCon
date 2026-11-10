-- Perbaikan trigger audit_logs (Tahap 3): record_id diambil dari NEW.id/OLD.id, padahal
-- tiga tabel ber-PK komposit tidak punya kolom `id` (question_institution_types,
-- score_node_edges, score_node_variables) → record_id NULL → INSERT ditolak
-- (NOT NULL). Ditemukan lewat e2e builder kuesioner (Tahap 10a).
-- Sekarang: jika tidak ada `id`, record_id = nilai kolom primary key digabung ':'
-- (dibaca dari pg_index). Ini juga menggantikan cabang khusus app_settings (PK `key`).
-- Migrasi SQL murni — tidak ada perubahan schema.prisma.

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
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_action := 'DELETE';
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    IF (v_old ? 'deleted_at') AND (v_old ->> 'deleted_at') IS NULL AND (v_new ->> 'deleted_at') IS NOT NULL THEN
      v_action := 'SOFT_DELETE';
    ELSIF (v_old ? 'deleted_at') AND (v_old ->> 'deleted_at') IS NOT NULL AND (v_new ->> 'deleted_at') IS NULL THEN
      v_action := 'RESTORE';
    ELSE
      v_action := 'UPDATE';
    END IF;
  END IF;

  v_record_id := COALESCE(v_new, v_old) ->> 'id';
  IF v_record_id IS NULL THEN
    -- tabel tanpa kolom id: gabungkan kolom primary key sesuai urutannya
    SELECT string_agg(COALESCE(v_new, v_old) ->> a.attname, ':' ORDER BY array_position(i.indkey::int2[], a.attnum))
      INTO v_record_id
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
     WHERE i.indrelid = TG_RELID AND i.indisprimary;
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
