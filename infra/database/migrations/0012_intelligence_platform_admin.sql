BEGIN;

-- Additive: VandLabs platform administration inside Automobile Intelligence, so one sign-in serves
-- VandLabs administrators, dealer owners and dealer staff. The runtime role gets no direct access to
-- this table; every cross-tenant read or change goes through the functions below, which check the
-- caller is an enabled platform administrator first.

CREATE TABLE intelligence_platform_admins (
  user_id uuid PRIMARY KEY REFERENCES intelligence_users(id),
  granted_by text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE intelligence_platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_platform_admins FORCE ROW LEVEL SECURITY;

CREATE FUNCTION intelligence_is_platform_admin(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM intelligence_platform_admins a JOIN intelligence_users u ON u.id = a.user_id
    WHERE a.user_id = p_user AND NOT u.disabled
  )
$$;

-- One row per dealership workspace with live counts. Returns nothing for non-administrators.
CREATE FUNCTION intelligence_admin_workspaces(p_admin uuid)
RETURNS TABLE (tenant_id uuid, organization text, dealership text, created_at timestamptz, locations bigint, vehicles bigint,
  available bigint, leads bigint, members bigint, owners text, pending_invites bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.tenant_id, o.name, (SELECT d.name FROM dealerships d WHERE d.tenant_id = o.tenant_id ORDER BY d.created_at LIMIT 1), o.created_at,
    (SELECT count(*) FROM locations l WHERE l.tenant_id = o.tenant_id),
    (SELECT count(*) FROM vehicles v WHERE v.tenant_id = o.tenant_id AND v.availability_status <> 'archived'),
    (SELECT count(*) FROM vehicles v WHERE v.tenant_id = o.tenant_id AND v.publish_status = 'published'),
    (SELECT count(*) FROM leads x WHERE x.tenant_id = o.tenant_id),
    (SELECT count(*) FROM staff_members s WHERE s.tenant_id = o.tenant_id AND coalesce((s.payload->>'enabled')::boolean, false)),
    (SELECT string_agg(u.email, ', ' ORDER BY u.email) FROM staff_members s JOIN intelligence_users u ON u.id::text = s.user_id
      WHERE s.tenant_id = o.tenant_id AND s.payload->>'role' = 'owner' AND coalesce((s.payload->>'enabled')::boolean, false)),
    (SELECT count(*) FROM intelligence_tokens t WHERE t.tenant_id = o.tenant_id AND t.kind = 'invite' AND t.used_at IS NULL AND t.expires_at > now())
  FROM organizations o
  WHERE intelligence_is_platform_admin(p_admin) AND o.tenant_id IS NOT NULL
  ORDER BY o.created_at DESC
$$;

CREATE FUNCTION intelligence_admin_members(p_admin uuid, p_tenant uuid)
RETURNS TABLE (user_id uuid, email text, display_name text, role text, enabled boolean, disabled boolean, totp_enabled boolean, platform_admin boolean, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id, u.email, u.display_name, coalesce(s.payload->>'intelligenceRole', s.payload->>'role'), coalesce((s.payload->>'enabled')::boolean, false),
    u.disabled, u.totp_enabled, EXISTS (SELECT 1 FROM intelligence_platform_admins a WHERE a.user_id = u.id), u.created_at
  FROM staff_members s JOIN intelligence_users u ON u.id::text = s.user_id
  WHERE intelligence_is_platform_admin(p_admin) AND s.tenant_id = p_tenant
  ORDER BY u.email
$$;

-- Suspends or restores an account everywhere. Suspension also ends its sessions. Administrators cannot suspend themselves
-- or another administrator here.
CREATE FUNCTION intelligence_admin_set_disabled(p_admin uuid, p_user uuid, p_disabled boolean, p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record;
BEGIN
  IF NOT intelligence_is_platform_admin(p_admin) OR p_admin = p_user OR EXISTS (SELECT 1 FROM intelligence_platform_admins a WHERE a.user_id = p_user) THEN
    RETURN false;
  END IF;
  UPDATE intelligence_users SET disabled = p_disabled, sessions_valid_after = CASE WHEN p_disabled THEN now() ELSE sessions_valid_after END,
    failed_attempts = 0, locked_until = NULL WHERE id = p_user;
  IF NOT FOUND THEN RETURN false; END IF;
  FOR r IN SELECT s.tenant_id FROM staff_members s WHERE s.user_id = p_user::text LOOP
    INSERT INTO platform_audit(id, tenant_id, actor, action, subject, payload)
    VALUES (gen_random_uuid(), r.tenant_id, p_admin::text, CASE WHEN p_disabled THEN 'platform.user_suspended' ELSE 'platform.user_restored' END, p_user::text,
      jsonb_build_object('reason', left(coalesce(p_reason, ''), 300)));
  END LOOP;
  RETURN true;
END $$;

-- Creates a dealership workspace and a one-time owner setup invitation in one transaction.
CREATE FUNCTION intelligence_admin_provision(p_admin uuid, p_organization text, p_dealership text, p_locations jsonb,
  p_owner_email text, p_owner_name text, p_token_hash text, p_expires timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE tid uuid := gen_random_uuid(); did uuid := gen_random_uuid(); lid uuid; lids jsonb := '[]'::jsonb; l jsonb;
BEGIN
  IF NOT intelligence_is_platform_admin(p_admin) THEN RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_locations) <> 'array' OR jsonb_array_length(p_locations) = 0 THEN RAISE EXCEPTION 'invalid_locations' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('intelligence:provision:' || lower(p_organization), 0));
  IF EXISTS (SELECT 1 FROM organizations WHERE lower(name) = lower(p_organization)) THEN RAISE EXCEPTION 'duplicate_organization' USING ERRCODE = '23505'; END IF;
  INSERT INTO organizations(id, tenant_id, name) VALUES (tid, tid, p_organization);
  INSERT INTO dealerships(id, tenant_id, organization_id, name, brand_name) VALUES (did, tid, tid, p_dealership, p_dealership);
  FOR l IN SELECT * FROM jsonb_array_elements(p_locations) LOOP
    lid := gen_random_uuid();
    INSERT INTO locations(id, tenant_id, dealership_id, name, city, state, phone)
    VALUES (lid, tid, did, l->>'name', l->>'city', l->>'state', coalesce(nullif(l->>'phone', ''), 'Not recorded'));
    lids := lids || to_jsonb(lid::text);
  END LOOP;
  INSERT INTO intelligence_tokens(token_hash, kind, tenant_id, email, role, intelligence_role, dealership_ids, location_ids, display_name, created_by, expires_at)
  VALUES (p_token_hash, 'invite', tid, lower(p_owner_email), 'owner', 'owner', jsonb_build_array(did::text), lids, p_owner_name, 'platform-admin:' || p_admin::text, p_expires);
  INSERT INTO platform_audit(id, tenant_id, actor, action, subject, payload)
  VALUES (gen_random_uuid(), tid, p_admin::text, 'workspace.provisioned', tid::text,
    jsonb_build_object('organization', p_organization, 'locations', jsonb_array_length(lids), 'ownerEmail', lower(p_owner_email)));
  RETURN tid;
END $$;

-- A fresh owner setup link for a workspace nobody has joined yet (for example, the first link expired).
CREATE FUNCTION intelligence_admin_reissue_owner_invite(p_admin uuid, p_tenant uuid, p_owner_email text, p_owner_name text, p_token_hash text, p_expires timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE did uuid; lids jsonb;
BEGIN
  IF NOT intelligence_is_platform_admin(p_admin) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM staff_members s WHERE s.tenant_id = p_tenant AND coalesce((s.payload->>'enabled')::boolean, false)) THEN RETURN false; END IF;
  SELECT d.id INTO did FROM dealerships d WHERE d.tenant_id = p_tenant ORDER BY d.created_at LIMIT 1;
  IF did IS NULL THEN RETURN false; END IF;
  SELECT coalesce(jsonb_agg(l.id::text), '[]'::jsonb) INTO lids FROM locations l WHERE l.tenant_id = p_tenant;
  UPDATE intelligence_tokens SET expires_at = now() WHERE tenant_id = p_tenant AND kind = 'invite' AND used_at IS NULL AND expires_at > now();
  INSERT INTO intelligence_tokens(token_hash, kind, tenant_id, email, role, intelligence_role, dealership_ids, location_ids, display_name, created_by, expires_at)
  VALUES (p_token_hash, 'invite', p_tenant, lower(p_owner_email), 'owner', 'owner', jsonb_build_array(did::text), lids, p_owner_name, 'platform-admin:' || p_admin::text, p_expires);
  INSERT INTO platform_audit(id, tenant_id, actor, action, subject, payload)
  VALUES (gen_random_uuid(), p_tenant, p_admin::text, 'workspace.owner_invite_reissued', p_tenant::text, jsonb_build_object('ownerEmail', lower(p_owner_email)));
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION intelligence_is_platform_admin(uuid), intelligence_admin_workspaces(uuid), intelligence_admin_members(uuid, uuid),
  intelligence_admin_set_disabled(uuid, uuid, boolean, text), intelligence_admin_provision(uuid, text, text, jsonb, text, text, text, timestamptz),
  intelligence_admin_reissue_owner_invite(uuid, uuid, text, text, text, timestamptz) FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION intelligence_is_platform_admin(uuid), intelligence_admin_workspaces(uuid), intelligence_admin_members(uuid, uuid), intelligence_admin_set_disabled(uuid, uuid, boolean, text), intelligence_admin_provision(uuid, text, text, jsonb, text, text, text, timestamptz), intelligence_admin_reissue_owner_invite(uuid, uuid, text, text, text, timestamptz) TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
