BEGIN;

-- Additive and non-destructive. Website integration v2:
--  * a "website" API-key scope (read published stock, record enquiries and website analytics) and the site's origin for inventory webhooks;
--  * idempotency records for website enquiries, so a retried submission never creates a second lead;
--  * daily website analytics aggregates (no visitor identifiers stored), with a short-lived dedupe table;
--  * a transactional outbox for signed inventory-change webhooks to the connected website.

ALTER TABLE intelligence_api_keys DROP CONSTRAINT IF EXISTS intelligence_api_keys_scope_check;
ALTER TABLE intelligence_api_keys ADD CONSTRAINT intelligence_api_keys_scope_check CHECK (scope IN ('inventory:read', 'leads:read', 'website'));
ALTER TABLE intelligence_api_keys ADD COLUMN IF NOT EXISTS site_origin text;

-- intelligence_api_key_lookup gains the key name, so a legacy website connection (inventory:read, "Website: <host>") is recognised.
DROP FUNCTION IF EXISTS intelligence_api_key_lookup(text);
CREATE FUNCTION intelligence_api_key_lookup(p_prefix text)
RETURNS TABLE (id uuid, tenant_id uuid, scope text, location_ids jsonb, key_hash text, name text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT k.id, k.tenant_id, k.scope, k.location_ids, k.key_hash, k.name FROM intelligence_api_keys k
  WHERE k.prefix = p_prefix AND k.revoked_at IS NULL AND k.expires_at > now()
$$;
REVOKE ALL ON FUNCTION intelligence_api_key_lookup(text) FROM PUBLIC;

CREATE TABLE intelligence_website_enquiries (
  tenant_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  reference text NOT NULL,
  enquiry_type text NOT NULL,
  website_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, idempotency_key)
);
CREATE INDEX intelligence_website_enquiries_created ON intelligence_website_enquiries (tenant_id, created_at DESC);

CREATE TABLE intelligence_website_metrics (
  tenant_id uuid NOT NULL,
  day date NOT NULL,
  metric text NOT NULL,
  dimension text NOT NULL DEFAULT '',
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day, metric, dimension)
);

CREATE TABLE intelligence_website_seen (
  tenant_id uuid NOT NULL,
  day date NOT NULL,
  hash text NOT NULL,
  PRIMARY KEY (tenant_id, day, hash)
);

CREATE TABLE intelligence_webhook_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  key_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
CREATE INDEX intelligence_webhook_outbox_due ON intelligence_webhook_outbox (tenant_id, next_attempt_at) WHERE status = 'pending';

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['intelligence_website_enquiries', 'intelligence_website_metrics', 'intelligence_website_seen', 'intelligence_webhook_outbox'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;

-- The scheduled retry needs to know which workspaces have webhooks due, before any tenant is selected. It learns nothing else.
CREATE FUNCTION intelligence_webhook_due_tenants(p_limit integer)
RETURNS TABLE (tenant_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT o.tenant_id FROM intelligence_webhook_outbox o WHERE o.status = 'pending' AND o.next_attempt_at <= now() LIMIT greatest(1, least(p_limit, 500))
$$;
REVOKE ALL ON FUNCTION intelligence_webhook_due_tenants(integer) FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON intelligence_website_enquiries, intelligence_website_metrics, intelligence_webhook_outbox TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, DELETE ON intelligence_website_seen TO %I', r);
      EXECUTE format('GRANT DELETE ON intelligence_website_metrics TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION intelligence_api_key_lookup(text), intelligence_webhook_due_tenants(integer) TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
