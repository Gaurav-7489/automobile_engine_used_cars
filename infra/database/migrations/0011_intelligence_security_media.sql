BEGIN;

-- Additive: two-factor authentication and workspace API keys for Automobile Intelligence.

ALTER TABLE intelligence_users ADD COLUMN totp_secret text;
ALTER TABLE intelligence_users ADD COLUMN totp_enabled boolean NOT NULL DEFAULT false;

DROP FUNCTION intelligence_login_lookup(text);
CREATE FUNCTION intelligence_login_lookup(p_email text)
RETURNS TABLE (id uuid, display_name text, password_hash text, disabled boolean, locked_until timestamptz, totp_enabled boolean, totp_secret text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id, u.display_name, u.password_hash, u.disabled, u.locked_until, u.totp_enabled, u.totp_secret
  FROM intelligence_users u WHERE lower(u.email) = lower(p_email)
$$;

-- Stores a pending secret (enabled = false) or switches two-factor on or off for the calling user.
CREATE FUNCTION intelligence_set_totp(p_user uuid, p_secret text, p_enabled boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE intelligence_users SET totp_secret = p_secret, totp_enabled = p_enabled WHERE id = p_user
$$;

CREATE FUNCTION intelligence_totp_state(p_user uuid)
RETURNS TABLE (totp_enabled boolean, totp_secret text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.totp_enabled, u.totp_secret FROM intelligence_users u WHERE u.id = p_user
$$;

-- API keys: only a SHA-256 hash of the secret is stored. The prefix identifies the key without revealing it.
CREATE TABLE intelligence_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('inventory:read', 'leads:read')),
  location_ids jsonb NOT NULL,
  prefix text NOT NULL UNIQUE,
  key_hash text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz
);
CREATE INDEX intelligence_api_keys_tenant ON intelligence_api_keys (tenant_id, created_at DESC);
ALTER TABLE intelligence_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_api_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON intelligence_api_keys
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Resolves an incoming key by prefix before any tenant is known. Returns nothing for revoked or expired keys.
CREATE FUNCTION intelligence_api_key_lookup(p_prefix text)
RETURNS TABLE (id uuid, tenant_id uuid, scope text, location_ids jsonb, key_hash text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT k.id, k.tenant_id, k.scope, k.location_ids, k.key_hash FROM intelligence_api_keys k
  WHERE k.prefix = p_prefix AND k.revoked_at IS NULL AND k.expires_at > now()
$$;

CREATE FUNCTION intelligence_api_key_used(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE intelligence_api_keys SET last_used_at = now() WHERE id = p_id
$$;

REVOKE ALL ON FUNCTION intelligence_login_lookup(text), intelligence_set_totp(uuid, text, boolean), intelligence_totp_state(uuid),
  intelligence_api_key_lookup(text), intelligence_api_key_used(uuid) FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON intelligence_api_keys TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION intelligence_login_lookup(text), intelligence_set_totp(uuid, text, boolean), intelligence_totp_state(uuid), intelligence_api_key_lookup(text), intelligence_api_key_used(uuid) TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
