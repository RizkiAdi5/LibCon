-- FR-13.08: cron memanggil ensure_log_partitions() sebagai libcon_app, yang TIDAK punya hak
-- CREATE di schema public. SECURITY DEFINER = berjalan dengan hak pemilik fungsi (role migrasi);
-- search_path dikunci supaya tidak bisa dibajak, dan EXECUTE hanya untuk libcon_app.
ALTER FUNCTION ensure_log_partitions(int, date) SECURITY DEFINER SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION ensure_log_partitions(int, date) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'libcon_app') THEN
    GRANT EXECUTE ON FUNCTION ensure_log_partitions(int, date) TO libcon_app;
  END IF;
END $$;
