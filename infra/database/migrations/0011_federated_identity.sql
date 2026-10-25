BEGIN;

-- Single sign-in: one person, one account, across Command Center, Platform and Automobile Intelligence.
-- The canonical account is the intelligence_users row (a uuid that is also staff_members.user_id).
-- A federated identity (Cognito subject, including Google through Cognito) is linked to it once, by
-- a verified email that already belongs to an enabled member. No account is ever created here.
CREATE TABLE identity_links (
  provider_sub text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES intelligence_users(id),
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX identity_links_user ON identity_links (user_id);
ALTER TABLE identity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_links FORCE ROW LEVEL SECURITY;
-- No policy: the runtime role reaches links only through the SECURITY DEFINER functions below.

-- Resolves (and on first use creates) the link. The caller must already have verified that the identity
-- provider asserted this email as verified. An existing link always wins; a changed email never re-links.
CREATE FUNCTION identity_resolve_federated(p_sub text, p_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid;
BEGIN
  IF p_sub IS NULL OR length(p_sub) = 0 OR length(p_sub) > 256 THEN RETURN NULL; END IF;
  SELECT l.user_id INTO uid FROM identity_links l JOIN intelligence_users u ON u.id = l.user_id
    WHERE l.provider_sub = p_sub AND NOT u.disabled;
  IF uid IS NOT NULL THEN RETURN uid; END IF;
  IF EXISTS (SELECT 1 FROM identity_links WHERE provider_sub = p_sub) THEN RETURN NULL; END IF; -- linked, but disabled
  IF p_email IS NULL OR length(p_email) = 0 OR length(p_email) > 254 THEN RETURN NULL; END IF;
  SELECT u.id INTO uid FROM intelligence_users u
    WHERE lower(u.email) = lower(p_email) AND NOT u.disabled
      AND EXISTS (SELECT 1 FROM staff_members s WHERE s.user_id = u.id::text AND coalesce((s.payload->>'enabled')::boolean, false));
  IF uid IS NULL THEN RETURN NULL; END IF;
  INSERT INTO identity_links (provider_sub, user_id, email) VALUES (p_sub, uid, lower(p_email)) ON CONFLICT DO NOTHING;
  RETURN uid;
END $$;

-- Lookup only: used by every request to map a signed Cognito subject to the canonical staff user id.
CREATE FUNCTION identity_linked_user(p_sub text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.user_id FROM identity_links l JOIN intelligence_users u ON u.id = l.user_id
  WHERE l.provider_sub = p_sub AND NOT u.disabled
$$;

REVOKE ALL ON FUNCTION identity_resolve_federated(text, text), identity_linked_user(text) FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION identity_resolve_federated(text, text), identity_linked_user(text) TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
