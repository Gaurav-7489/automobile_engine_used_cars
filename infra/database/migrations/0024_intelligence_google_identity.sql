BEGIN;

-- Google-only sign-in. Additive and reversible: nothing is dropped, password and two-factor columns stay so a rollback to
-- password sign-in keeps working (LEGACY_PASSWORD_LOGIN=enabled).
--
--  * intelligence_users.google_sub binds an account to one Google account by its stable subject id (never by email alone).
--  * intelligence_pending_identities are identities VandLabs (or an owner's invitation) approved before anyone signed in: the
--    dealership owner a platform administrator assigned, or the platform administrator bootstrapped from the owner connection.
--    The first verified Google sign-in for that email activates it, once.
--  * intelligence_google_signin is the only way in. Unknown Google accounts get nothing.

ALTER TABLE intelligence_users ADD COLUMN IF NOT EXISTS google_sub text;
ALTER TABLE intelligence_users ADD COLUMN IF NOT EXISTS google_linked_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_users_google_sub_key ON intelligence_users (google_sub) WHERE google_sub IS NOT NULL;

CREATE TABLE intelligence_pending_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  tenant_id uuid,
  user_id uuid REFERENCES intelligence_users(id),
  role text,
  intelligence_role text,
  dealership_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  location_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_name text,
  platform_admin boolean NOT NULL DEFAULT false,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  activated_user uuid,
  revoked_at timestamptz,
  CHECK (tenant_id IS NOT NULL OR platform_admin)
);
CREATE UNIQUE INDEX intelligence_pending_identities_open ON intelligence_pending_identities (lower(email), coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE activated_at IS NULL AND revoked_at IS NULL;
-- No policy: only the SECURITY DEFINER functions below read or write it.
ALTER TABLE intelligence_pending_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_pending_identities FORCE ROW LEVEL SECURITY;

-- Turns the approvals for one email (assigned identities and still-valid invitations) into memberships of user p_user.
CREATE FUNCTION intelligence_activate_approvals(p_user uuid, p_email text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p intelligence_pending_identities%ROWTYPE; t intelligence_tokens%ROWTYPE; n integer := 0; member jsonb;
  now_iso text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'); uname text;
BEGIN
  SELECT display_name INTO uname FROM intelligence_users WHERE id = p_user;
  FOR p IN SELECT * FROM intelligence_pending_identities WHERE lower(email) = lower(p_email) AND activated_at IS NULL AND revoked_at IS NULL
    AND (user_id IS NULL OR user_id = p_user) FOR UPDATE LOOP
    IF p.tenant_id IS NOT NULL THEN
      member := jsonb_build_object('userId', p_user::text, 'tenantId', p.tenant_id::text, 'displayName', coalesce(p.display_name, uname),
        'role', p.role, 'intelligenceRole', p.intelligence_role, 'email', lower(p_email), 'dealershipIds', p.dealership_ids, 'locationIds', p.location_ids,
        'enabled', true, 'version', 1, 'updatedAt', now_iso, 'updatedBy', p.created_by);
      INSERT INTO staff_members (tenant_id, user_id, payload) VALUES (p.tenant_id, p_user::text, member)
        ON CONFLICT (tenant_id, user_id) DO UPDATE SET payload = jsonb_set(EXCLUDED.payload, '{version}', to_jsonb(((staff_members.payload->>'version')::int) + 1));
      INSERT INTO platform_audit (id, tenant_id, actor, action, subject, payload, occurred_at)
        VALUES (gen_random_uuid(), p.tenant_id, p.created_by, 'identity.google_activated', p_user::text, jsonb_build_object('role', p.role, 'email', lower(p_email)), now());
    END IF;
    IF p.platform_admin THEN
      INSERT INTO intelligence_platform_admins (user_id, granted_by) VALUES (p_user, p.created_by) ON CONFLICT (user_id) DO NOTHING;
    END IF;
    UPDATE intelligence_pending_identities SET activated_at = now(), activated_user = p_user WHERE id = p.id;
    n := n + 1;
  END LOOP;
  -- Invitations an owner issued before Google-only sign-in keep working: the invited email signs in with Google instead of a link.
  FOR t IN SELECT * FROM intelligence_tokens WHERE kind = 'invite' AND lower(email) = lower(p_email) AND used_at IS NULL AND expires_at > now() FOR UPDATE LOOP
    member := jsonb_build_object('userId', p_user::text, 'tenantId', t.tenant_id::text, 'displayName', coalesce(t.display_name, uname),
      'role', t.role, 'intelligenceRole', t.intelligence_role, 'email', lower(p_email), 'dealershipIds', t.dealership_ids, 'locationIds', t.location_ids,
      'enabled', true, 'version', 1, 'updatedAt', now_iso, 'updatedBy', t.created_by);
    INSERT INTO staff_members (tenant_id, user_id, payload) VALUES (t.tenant_id, p_user::text, member)
      ON CONFLICT (tenant_id, user_id) DO UPDATE SET payload = jsonb_set(EXCLUDED.payload, '{version}', to_jsonb(((staff_members.payload->>'version')::int) + 1));
    INSERT INTO platform_audit (id, tenant_id, actor, action, subject, payload, occurred_at)
      VALUES (gen_random_uuid(), t.tenant_id, t.created_by, 'staff.invitation_accepted', p_user::text, jsonb_build_object('role', t.role, 'via', 'google'), now());
    UPDATE intelligence_tokens SET used_at = now() WHERE token_hash = t.token_hash;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- The single Google sign-in decision. p_email must be Google-verified (checked by the application before calling).
-- p_authoritative: Google is the authority for this address (gmail.com, or a Workspace domain matching the hd claim). Only then may
-- an existing, not-yet-linked account be linked by email without a prior approval. Platform administrators are never linked by email:
-- they need a bootstrap approval created on the owner connection.
CREATE FUNCTION intelligence_google_signin(p_sub text, p_email text, p_name text, p_authoritative boolean)
RETURNS TABLE (outcome text, user_id uuid, tenant_id uuid, platform_admin boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u intelligence_users%ROWTYPE; uid uuid; approved boolean; tid uuid; adm boolean; email_l text := lower(trim(p_email));
BEGIN
  IF p_sub IS NULL OR length(p_sub) < 1 OR length(p_sub) > 255 OR email_l !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' THEN
    RETURN QUERY SELECT 'no_account'::text, NULL::uuid, NULL::uuid, false; RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('intelligence:google:' || email_l, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('intelligence:google-sub:' || p_sub, 0));

  SELECT * INTO u FROM intelligence_users WHERE google_sub = p_sub;
  IF FOUND THEN
    uid := u.id;
    IF u.disabled THEN RETURN QUERY SELECT 'disabled'::text, uid, NULL::uuid, false; RETURN; END IF;
    PERFORM intelligence_activate_approvals(uid, email_l);
  ELSE
    approved := EXISTS (SELECT 1 FROM intelligence_pending_identities p WHERE lower(p.email) = email_l AND p.activated_at IS NULL AND p.revoked_at IS NULL)
      OR EXISTS (SELECT 1 FROM intelligence_tokens t WHERE t.kind = 'invite' AND lower(t.email) = email_l AND t.used_at IS NULL AND t.expires_at > now());
    SELECT * INTO u FROM intelligence_users WHERE lower(email) = email_l;
    IF FOUND THEN
      uid := u.id;
      -- Already bound to a different Google account: never re-bind.
      IF u.google_sub IS NOT NULL THEN RETURN QUERY SELECT 'conflict'::text, NULL::uuid, NULL::uuid, false; RETURN; END IF;
      IF u.disabled THEN RETURN QUERY SELECT 'disabled'::text, uid, NULL::uuid, false; RETURN; END IF;
      IF EXISTS (SELECT 1 FROM intelligence_platform_admins a WHERE a.user_id = uid)
        AND NOT EXISTS (SELECT 1 FROM intelligence_pending_identities p WHERE p.platform_admin AND lower(p.email) = email_l AND p.activated_at IS NULL AND p.revoked_at IS NULL) THEN
        RETURN QUERY SELECT 'admin_not_approved'::text, NULL::uuid, NULL::uuid, false; RETURN;
      END IF;
      IF NOT approved AND NOT p_authoritative THEN RETURN QUERY SELECT 'link_not_approved'::text, NULL::uuid, NULL::uuid, false; RETURN; END IF;
      UPDATE intelligence_users SET google_sub = p_sub, google_linked_at = now() WHERE id = uid;
      INSERT INTO platform_audit (id, tenant_id, actor, action, subject, payload, occurred_at)
        SELECT gen_random_uuid(), s.tenant_id, uid::text, 'identity.google_linked', uid::text, jsonb_build_object('email', email_l, 'approved', approved), now()
        FROM staff_members s WHERE s.user_id = uid::text;
    ELSE
      IF NOT approved THEN RETURN QUERY SELECT 'no_account'::text, NULL::uuid, NULL::uuid, false; RETURN; END IF;
      -- '!google-only' is not a password hash: password sign-in can never succeed for this account.
      INSERT INTO intelligence_users (email, display_name, password_hash, google_sub, google_linked_at)
        VALUES (email_l, coalesce(nullif(left(trim(p_name), 120), ''), email_l), '!google-only', p_sub, now()) RETURNING id INTO uid;
    END IF;
    PERFORM intelligence_activate_approvals(uid, email_l);
  END IF;

  adm := intelligence_is_platform_admin(uid);
  SELECT s.tenant_id INTO tid FROM staff_members s WHERE s.user_id = uid::text AND coalesce((s.payload->>'enabled')::boolean, false)
    ORDER BY (s.payload->>'role' = 'owner') DESC, s.tenant_id LIMIT 1;
  IF tid IS NULL THEN RETURN QUERY SELECT 'no_access'::text, uid, NULL::uuid, adm; RETURN; END IF;
  UPDATE intelligence_users SET failed_attempts = 0, locked_until = NULL WHERE id = uid;
  RETURN QUERY SELECT 'ok'::text, uid, tid, adm;
END $$;

-- Which Google account a signed-in user is bound to (for step-up confirmation). Returns NULL when not bound.
CREATE FUNCTION intelligence_google_sub_of(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT google_sub FROM intelligence_users WHERE id = p_user AND NOT disabled
$$;

-- Platform administrator creates a dealership whose owner signs in with an assigned Google account. No link, password or email service.
CREATE FUNCTION intelligence_admin_provision_google(p_admin uuid, p_organization text, p_dealership text, p_locations jsonb, p_owner_email text, p_owner_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE tid uuid := gen_random_uuid(); did uuid := gen_random_uuid(); lid uuid; lids jsonb := '[]'::jsonb; l jsonb;
BEGIN
  IF NOT intelligence_is_platform_admin(p_admin) THEN RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_locations) <> 'array' OR jsonb_array_length(p_locations) = 0 THEN RAISE EXCEPTION 'invalid_locations' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('intelligence:provision:' || lower(p_organization), 0));
  IF EXISTS (SELECT 1 FROM organizations WHERE lower(name) = lower(p_organization)) THEN RAISE EXCEPTION 'duplicate_organization' USING ERRCODE = '23505'; END IF;
  PERFORM set_config('app.tenant_id', tid::text, true);
  INSERT INTO organizations(id, tenant_id, name) VALUES (tid, tid, p_organization);
  INSERT INTO dealerships(id, tenant_id, organization_id, name, brand_name) VALUES (did, tid, tid, p_dealership, p_dealership);
  FOR l IN SELECT * FROM jsonb_array_elements(p_locations) LOOP
    lid := gen_random_uuid();
    INSERT INTO locations(id, tenant_id, dealership_id, name, city, state, phone)
    VALUES (lid, tid, did, l->>'name', l->>'city', l->>'state', coalesce(nullif(l->>'phone', ''), 'Not recorded'));
    lids := lids || to_jsonb(lid::text);
  END LOOP;
  INSERT INTO intelligence_pending_identities (email, tenant_id, role, intelligence_role, dealership_ids, location_ids, display_name, created_by)
  VALUES (lower(trim(p_owner_email)), tid, 'owner', 'owner', jsonb_build_array(did::text), lids, p_owner_name, 'platform-admin:' || p_admin::text);
  INSERT INTO platform_audit(id, tenant_id, actor, action, subject, payload)
  VALUES (gen_random_uuid(), tid, p_admin::text, 'workspace.provisioned', tid::text,
    jsonb_build_object('organization', p_organization, 'locations', jsonb_array_length(lids), 'ownerEmail', lower(trim(p_owner_email)), 'signIn', 'google'));
  RETURN tid;
END $$;

-- Changes the assigned owner Google account while nobody has signed in to the workspace yet.
CREATE FUNCTION intelligence_admin_assign_owner(p_admin uuid, p_tenant uuid, p_owner_email text, p_owner_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE did uuid; lids jsonb;
BEGIN
  IF NOT intelligence_is_platform_admin(p_admin) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM staff_members s WHERE s.tenant_id = p_tenant AND coalesce((s.payload->>'enabled')::boolean, false)) THEN RETURN false; END IF;
  SELECT d.id INTO did FROM dealerships d WHERE d.tenant_id = p_tenant ORDER BY d.created_at LIMIT 1;
  IF did IS NULL THEN RETURN false; END IF;
  SELECT coalesce(jsonb_agg(l.id::text), '[]'::jsonb) INTO lids FROM locations l WHERE l.tenant_id = p_tenant;
  UPDATE intelligence_pending_identities SET revoked_at = now() WHERE tenant_id = p_tenant AND activated_at IS NULL AND revoked_at IS NULL;
  UPDATE intelligence_tokens SET expires_at = now() WHERE tenant_id = p_tenant AND kind = 'invite' AND used_at IS NULL AND expires_at > now();
  INSERT INTO intelligence_pending_identities (email, tenant_id, role, intelligence_role, dealership_ids, location_ids, display_name, created_by)
  VALUES (lower(trim(p_owner_email)), p_tenant, 'owner', 'owner', jsonb_build_array(did::text), lids, p_owner_name, 'platform-admin:' || p_admin::text);
  INSERT INTO platform_audit(id, tenant_id, actor, action, subject, payload)
  VALUES (gen_random_uuid(), p_tenant, p_admin::text, 'workspace.owner_assigned', p_tenant::text, jsonb_build_object('ownerEmail', lower(trim(p_owner_email))));
  RETURN true;
END $$;

-- Assigned owners not yet signed in, per workspace (for the admin console).
CREATE FUNCTION intelligence_admin_pending_owners(p_admin uuid)
RETURNS TABLE (tenant_id uuid, email text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.tenant_id, p.email, p.created_at FROM intelligence_pending_identities p
  WHERE intelligence_is_platform_admin(p_admin) AND p.tenant_id IS NOT NULL AND p.activated_at IS NULL AND p.revoked_at IS NULL
$$;

-- VandLabs links a dealership website to a workspace: a website-scope key whose secret is shown once to the administrator, who sets
-- it on the website's own deployment. The dealer never types a password into their public website.
CREATE FUNCTION intelligence_admin_create_website_key(p_admin uuid, p_tenant uuid, p_site text, p_origin text, p_prefix text, p_hash text, p_expires timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE kid uuid; lids jsonb;
BEGIN
  IF NOT intelligence_is_platform_admin(p_admin) THEN RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations o WHERE o.tenant_id = p_tenant) THEN RAISE EXCEPTION 'unknown_workspace' USING ERRCODE = '22023'; END IF;
  PERFORM set_config('app.tenant_id', p_tenant::text, true);
  SELECT coalesce(jsonb_agg(l.id::text), '[]'::jsonb) INTO lids FROM locations l WHERE l.tenant_id = p_tenant;
  -- One live key per website.
  UPDATE intelligence_api_keys SET revoked_at = now() WHERE tenant_id = p_tenant AND name = 'Website: ' || p_site AND revoked_at IS NULL;
  INSERT INTO intelligence_api_keys (tenant_id, name, scope, location_ids, prefix, key_hash, created_by, expires_at, site_origin)
  VALUES (p_tenant, 'Website: ' || p_site, 'website', lids, p_prefix, p_hash, 'platform-admin:' || p_admin::text, p_expires, p_origin) RETURNING id INTO kid;
  INSERT INTO platform_audit(id, tenant_id, actor, action, subject, payload)
  VALUES (gen_random_uuid(), p_tenant, p_admin::text, 'website.linked_by_admin', p_site, jsonb_build_object('keyId', kid, 'expiresAt', p_expires));
  RETURN kid;
END $$;

CREATE FUNCTION intelligence_admin_website_keys(p_admin uuid, p_tenant uuid)
RETURNS TABLE (id uuid, name text, prefix text, created_by text, created_at timestamptz, expires_at timestamptz, revoked_at timestamptz, last_used_at timestamptz, site_origin text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT k.id, k.name, k.prefix, k.created_by, k.created_at, k.expires_at, k.revoked_at, k.last_used_at, k.site_origin FROM intelligence_api_keys k
  WHERE intelligence_is_platform_admin(p_admin) AND k.tenant_id = p_tenant AND k.name LIKE 'Website: %' ORDER BY k.created_at DESC
$$;

CREATE FUNCTION intelligence_admin_revoke_website_key(p_admin uuid, p_tenant uuid, p_key uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n text;
BEGIN
  IF NOT intelligence_is_platform_admin(p_admin) THEN RETURN false; END IF;
  PERFORM set_config('app.tenant_id', p_tenant::text, true);
  UPDATE intelligence_api_keys SET revoked_at = now() WHERE tenant_id = p_tenant AND id = p_key AND name LIKE 'Website: %' AND revoked_at IS NULL RETURNING name INTO n;
  IF n IS NULL THEN RETURN false; END IF;
  INSERT INTO platform_audit(id, tenant_id, actor, action, subject, payload)
  VALUES (gen_random_uuid(), p_tenant, p_admin::text, 'website.unlinked_by_admin', n, jsonb_build_object('keyId', p_key));
  RETURN true;
END $$;

-- One-time platform administrator bootstrap. OWNER CONNECTION ONLY: the application role is never granted this function.
-- Creates (once) the internal "VandLabs" workspace and an approval that the first verified Google sign-in for p_email consumes,
-- binding that Google account and granting platform administration. Refused while an approval or an administrator for the email exists.
CREATE FUNCTION intelligence_bootstrap_platform_admin(p_email text, p_name text, p_by text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE email_l text := lower(trim(p_email)); tid uuid; did uuid; lid uuid; existing uuid;
BEGIN
  IF email_l !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' OR length(coalesce(p_by, '')) < 2 THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('intelligence:bootstrap-admin', 0));
  IF EXISTS (SELECT 1 FROM intelligence_pending_identities p WHERE p.platform_admin AND lower(p.email) = email_l AND p.activated_at IS NULL AND p.revoked_at IS NULL) THEN RETURN 'already_pending'; END IF;
  SELECT u.id INTO existing FROM intelligence_users u WHERE lower(u.email) = email_l;
  IF existing IS NOT NULL AND EXISTS (SELECT 1 FROM intelligence_users u JOIN intelligence_platform_admins a ON a.user_id = u.id WHERE u.id = existing AND u.google_sub IS NOT NULL) THEN RETURN 'already_admin'; END IF;
  SELECT o.tenant_id INTO tid FROM organizations o WHERE o.name = 'VandLabs' ORDER BY o.created_at LIMIT 1;
  IF tid IS NULL THEN
    tid := gen_random_uuid(); did := gen_random_uuid(); lid := gen_random_uuid();
    PERFORM set_config('app.tenant_id', tid::text, true);
    INSERT INTO organizations(id, tenant_id, name) VALUES (tid, tid, 'VandLabs');
    INSERT INTO dealerships(id, tenant_id, organization_id, name, brand_name) VALUES (did, tid, tid, 'VandLabs', 'VandLabs');
    INSERT INTO locations(id, tenant_id, dealership_id, name, city, state, phone) VALUES (lid, tid, did, 'VandLabs HQ', 'Bengaluru', 'Karnataka', 'Not recorded');
  ELSE
    SELECT d.id INTO did FROM dealerships d WHERE d.tenant_id = tid ORDER BY d.created_at LIMIT 1;
  END IF;
  INSERT INTO intelligence_pending_identities (email, tenant_id, user_id, role, intelligence_role, dealership_ids, location_ids, display_name, platform_admin, created_by)
  VALUES (email_l, tid, existing, 'owner', 'owner', jsonb_build_array(did::text),
    (SELECT coalesce(jsonb_agg(l.id::text), '[]'::jsonb) FROM locations l WHERE l.tenant_id = tid), nullif(trim(p_name), ''), true, 'bootstrap:' || left(p_by, 80));
  INSERT INTO platform_audit(id, tenant_id, actor, action, subject, payload)
  VALUES (gen_random_uuid(), tid, 'bootstrap:' || left(p_by, 80), 'platform.admin_bootstrap_approved', email_l, jsonb_build_object('existingAccount', existing IS NOT NULL));
  RETURN CASE WHEN existing IS NULL THEN 'approved_new' ELSE 'approved_existing' END;
END $$;

REVOKE ALL ON FUNCTION intelligence_activate_approvals(uuid, text), intelligence_google_signin(text, text, text, boolean), intelligence_google_sub_of(uuid),
  intelligence_admin_provision_google(uuid, text, text, jsonb, text, text), intelligence_admin_assign_owner(uuid, uuid, text, text), intelligence_admin_pending_owners(uuid),
  intelligence_admin_create_website_key(uuid, uuid, text, text, text, text, timestamptz), intelligence_admin_website_keys(uuid, uuid),
  intelligence_admin_revoke_website_key(uuid, uuid, uuid), intelligence_bootstrap_platform_admin(text, text, text) FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      -- intelligence_activate_approvals and intelligence_bootstrap_platform_admin are deliberately not granted.
      EXECUTE format('GRANT EXECUTE ON FUNCTION intelligence_google_signin(text, text, text, boolean), intelligence_google_sub_of(uuid), intelligence_admin_provision_google(uuid, text, text, jsonb, text, text), intelligence_admin_assign_owner(uuid, uuid, text, text), intelligence_admin_pending_owners(uuid), intelligence_admin_create_website_key(uuid, uuid, text, text, text, text, timestamptz), intelligence_admin_website_keys(uuid, uuid), intelligence_admin_revoke_website_key(uuid, uuid, uuid) TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
