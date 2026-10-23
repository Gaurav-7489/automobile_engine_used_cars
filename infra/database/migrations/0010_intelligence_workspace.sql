BEGIN;

-- VandLabs Automobile Intelligence: additive tables and functions only.
-- Nothing here alters or drops an existing table, row or policy.

-- Credentials live outside tenant scope (a person may belong to several dealerships).
-- The runtime role gets no direct access; it reaches them only through the SECURITY DEFINER
-- functions below, which never return password hashes except to the login check.
CREATE TABLE intelligence_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  disabled boolean NOT NULL DEFAULT false,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  sessions_valid_after timestamptz NOT NULL DEFAULT now(),
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX intelligence_users_email_key ON intelligence_users (lower(email));

-- One-time invitation and password-reset tokens. Only the SHA-256 hash is stored.
CREATE TABLE intelligence_tokens (
  token_hash text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('invite','reset')),
  tenant_id uuid NOT NULL,
  email text NOT NULL,
  user_id uuid REFERENCES intelligence_users(id),
  role text,
  intelligence_role text,
  dealership_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  location_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_name text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX intelligence_tokens_tenant ON intelligence_tokens (tenant_id, kind, created_at DESC);

ALTER TABLE intelligence_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_users FORCE ROW LEVEL SECURITY;
ALTER TABLE intelligence_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_tokens FORCE ROW LEVEL SECURITY;
-- Tenant staff may list the pending invitations of their own tenant (never the hash secret value).
CREATE POLICY tenant_isolation ON intelligence_tokens
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Workspace documents: every Intelligence-owned record (campaigns, price requests, alerts, ...).
CREATE TABLE intelligence_documents (
  tenant_id uuid NOT NULL,
  collection text NOT NULL,
  id text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, collection, id)
);
CREATE INDEX intelligence_documents_collection ON intelligence_documents (tenant_id, collection);
ALTER TABLE intelligence_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON intelligence_documents
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Product enquiries from the public site belong to VandLabs, not to any dealership. Row-level security with no
-- policy denies all direct access; the only way in is the idempotent function below.
CREATE TABLE intelligence_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  reference text NOT NULL UNIQUE,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE intelligence_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_enquiries FORCE ROW LEVEL SECURITY;

-- Authentication functions. Owned by the migration role (which can read across tenants);
-- fixed search_path prevents object shadowing.
CREATE FUNCTION intelligence_login_lookup(p_email text)
RETURNS TABLE (id uuid, display_name text, password_hash text, disabled boolean, locked_until timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id, u.display_name, u.password_hash, u.disabled, u.locked_until
  FROM intelligence_users u WHERE lower(u.email) = lower(p_email)
$$;

-- Five consecutive failures lock the account for fifteen minutes. Success clears the counter.
CREATE FUNCTION intelligence_record_login(p_id uuid, p_success boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE intelligence_users SET
    failed_attempts = CASE WHEN p_success THEN 0 WHEN failed_attempts + 1 >= 5 THEN 0 ELSE failed_attempts + 1 END,
    locked_until = CASE WHEN p_success THEN NULL WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
  WHERE id = p_id
$$;

-- Enabled memberships of a user: used at sign-in to choose a workspace.
CREATE FUNCTION intelligence_memberships(p_user uuid)
RETURNS TABLE (tenant_id uuid, payload jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.tenant_id, s.payload FROM staff_members s
  JOIN intelligence_users u ON u.id = p_user AND NOT u.disabled
  WHERE s.user_id = p_user::text AND coalesce((s.payload->>'enabled')::boolean, false)
$$;

-- Per-request session validation: a session is valid only while the account is enabled,
-- the session was issued after the last revocation, and the membership is still enabled.
CREATE FUNCTION intelligence_resolve_session(p_user uuid, p_tenant uuid, p_issued_at timestamptz)
RETURNS TABLE (display_name text, email text, payload jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.display_name, u.email, s.payload FROM intelligence_users u
  JOIN staff_members s ON s.tenant_id = p_tenant AND s.user_id = u.id::text
  WHERE u.id = p_user AND NOT u.disabled AND date_trunc('second', u.sessions_valid_after) <= p_issued_at
    AND coalesce((s.payload->>'enabled')::boolean, false)
$$;

CREATE FUNCTION intelligence_revoke_sessions(p_user uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE intelligence_users SET sessions_valid_after = now() WHERE id = p_user
$$;

-- Redeem a one-time token. Invite: creates the account (or, for an existing account, only adds the
-- membership and leaves its password untouched) and writes the staff record and audit entry
-- atomically. Reset: sets a new password for the account the token was issued for.
CREATE FUNCTION intelligence_redeem_token(p_hash text, p_password_hash text)
RETURNS TABLE (out_outcome text, out_user_id uuid, out_tenant_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t intelligence_tokens%ROWTYPE; uid uuid; created boolean := false; member jsonb; now_iso text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  SELECT * INTO t FROM intelligence_tokens WHERE token_hash = p_hash FOR UPDATE;
  IF NOT FOUND OR t.used_at IS NOT NULL OR t.expires_at <= now() THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid; RETURN;
  END IF;
  IF t.kind = 'reset' THEN
    UPDATE intelligence_users SET password_hash = p_password_hash, failed_attempts = 0, locked_until = NULL,
      sessions_valid_after = now(), password_changed_at = now() WHERE id = t.user_id;
    UPDATE intelligence_tokens SET used_at = now() WHERE token_hash = p_hash;
    RETURN QUERY SELECT 'password_reset'::text, t.user_id, t.tenant_id; RETURN;
  END IF;
  SELECT u.id INTO uid FROM intelligence_users u WHERE lower(u.email) = lower(t.email);
  IF uid IS NULL THEN
    INSERT INTO intelligence_users (email, display_name, password_hash) VALUES (lower(t.email), coalesce(t.display_name, t.email), p_password_hash) RETURNING id INTO uid;
    created := true;
  END IF;
  member := jsonb_build_object('userId', uid::text, 'tenantId', t.tenant_id::text, 'displayName', coalesce(t.display_name, t.email),
    'role', t.role, 'intelligenceRole', t.intelligence_role, 'email', lower(t.email), 'dealershipIds', t.dealership_ids, 'locationIds', t.location_ids,
    'enabled', true, 'version', 1, 'updatedAt', now_iso, 'updatedBy', t.created_by);
  INSERT INTO staff_members (tenant_id, user_id, payload) VALUES (t.tenant_id, uid::text, member)
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET payload = jsonb_set(EXCLUDED.payload, '{version}', to_jsonb(((staff_members.payload->>'version')::int) + 1));
  INSERT INTO platform_audit (id, tenant_id, actor, action, subject, payload, occurred_at)
    VALUES (gen_random_uuid(), t.tenant_id, t.created_by, 'staff.invitation_accepted', uid::text,
      jsonb_build_object('role', t.role, 'intelligenceRole', t.intelligence_role, 'accountCreated', created), now());
  UPDATE intelligence_tokens SET used_at = now() WHERE token_hash = p_hash;
  RETURN QUERY SELECT CASE WHEN created THEN 'account_created' ELSE 'membership_added' END, uid, t.tenant_id;
END $$;

-- Shows the invitee which account a link is for, without revealing anything else.
CREATE FUNCTION intelligence_token_info(p_hash text)
RETURNS TABLE (kind text, email text, display_name text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT t.kind, t.email, t.display_name FROM intelligence_tokens t WHERE t.token_hash = p_hash AND t.used_at IS NULL AND t.expires_at > now()
$$;

-- Reset tokens are issued for an existing account by a signed-in owner (no mail service is required).
CREATE FUNCTION intelligence_user_id_for_email(p_tenant uuid, p_email text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id FROM intelligence_users u JOIN staff_members s ON s.tenant_id = p_tenant AND s.user_id = u.id::text
  WHERE lower(u.email) = lower(p_email)
$$;

CREATE FUNCTION intelligence_submit_enquiry(p_key text, p_kind text, p_reference text, p_payload jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ref text;
BEGIN
  INSERT INTO intelligence_enquiries (idempotency_key, reference, kind, payload) VALUES (p_key, p_reference, p_kind, p_payload)
    ON CONFLICT (idempotency_key) DO NOTHING;
  SELECT reference INTO ref FROM intelligence_enquiries WHERE idempotency_key = p_key;
  RETURN ref;
END $$;

REVOKE ALL ON FUNCTION intelligence_login_lookup(text), intelligence_record_login(uuid, boolean), intelligence_memberships(uuid),
  intelligence_resolve_session(uuid, uuid, timestamptz), intelligence_revoke_sessions(uuid), intelligence_redeem_token(text, text),
  intelligence_user_id_for_email(uuid, text), intelligence_token_info(text), intelligence_submit_enquiry(text, text, text, jsonb) FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON intelligence_documents TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON intelligence_tokens TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION intelligence_login_lookup(text), intelligence_record_login(uuid, boolean), intelligence_memberships(uuid), intelligence_resolve_session(uuid, uuid, timestamptz), intelligence_revoke_sessions(uuid), intelligence_redeem_token(text, text), intelligence_user_id_for_email(uuid, text), intelligence_token_info(text), intelligence_submit_enquiry(text, text, text, jsonb) TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
