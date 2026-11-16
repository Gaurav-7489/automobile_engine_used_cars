BEGIN;

-- Additive. What the dealership's AI agents may answer from, beyond car records: passages read from the dealership's own
-- website (refreshed automatically) and short entries the owner writes. Searched with PostgreSQL full-text search; no extra
-- service. Tenant-isolated with row-level security like every dealership table.

CREATE TABLE intelligence_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('website', 'manual')),
  url text,
  title text NOT NULL,
  content text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  tsv tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', content), 'B')) STORED
);
CREATE INDEX intelligence_knowledge_tsv ON intelligence_knowledge USING gin (tsv);
CREATE INDEX intelligence_knowledge_tenant ON intelligence_knowledge (tenant_id, source);

-- When the website was last read for each dealership, and what happened.
CREATE TABLE intelligence_knowledge_sync (
  tenant_id uuid PRIMARY KEY,
  site_origin text,
  last_run_at timestamptz,
  last_success_at timestamptz,
  pages integer NOT NULL DEFAULT 0,
  passages integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'never' CHECK (status IN ('never', 'ok', 'failed', 'no_website')),
  error text
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['intelligence_knowledge', 'intelligence_knowledge_sync'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;

-- The daily job needs the workspaces whose website knowledge is stale, before any tenant is selected. It learns nothing else.
CREATE FUNCTION intelligence_knowledge_due_tenants(p_limit integer)
RETURNS TABLE (tenant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT k.tenant_id FROM intelligence_api_keys k
  LEFT JOIN intelligence_knowledge_sync s ON s.tenant_id = k.tenant_id
  WHERE k.name LIKE 'Website: %' AND k.site_origin IS NOT NULL AND k.revoked_at IS NULL AND k.expires_at > now()
    AND (s.last_run_at IS NULL OR s.last_run_at < now() - interval '20 hours')
  LIMIT greatest(1, least(p_limit, 500))
$$;
REVOKE ALL ON FUNCTION intelligence_knowledge_due_tenants(integer) FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON intelligence_knowledge, intelligence_knowledge_sync TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION intelligence_knowledge_due_tenants(integer) TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
