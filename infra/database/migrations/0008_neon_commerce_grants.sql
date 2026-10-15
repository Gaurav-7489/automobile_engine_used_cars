BEGIN;
-- Existing Neon environments use a SQL-created runtime role, not vandlabs_app.
-- Add grants separately so environments that already applied 0007 also converge.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vandlabs_runtime') THEN
  GRANT SELECT,INSERT,UPDATE ON dealer_commerce TO vandlabs_runtime;
 END IF;
END $$;
COMMIT;
