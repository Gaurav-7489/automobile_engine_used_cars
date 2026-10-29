BEGIN;

-- Additive: platform-administrator controls for a dealership's subscription and feature entitlements, and a cross-dealership
-- view of the platform audit trail. Subscription and entitlements live in the existing per-dealership commerce record
-- (dealer_commerce.payload: `subscription` and a new `features` object), so there is one source of truth. Every function
-- re-checks that the caller is an enabled platform administrator; the runtime role never reads or writes another dealership directly.

CREATE TABLE IF NOT EXISTS dealer_commerce (
  tenant_id uuid PRIMARY KEY REFERENCES organizations(id),
  payload jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE FUNCTION intelligence_admin_commerce(p_admin uuid, p_tenant uuid)
RETURNS TABLE (subscription jsonb, features jsonb, usage jsonb, sources jsonb, version bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.payload->'subscription', coalesce(c.payload->'features', '{}'::jsonb), coalesce(c.payload->'usage', '{}'::jsonb),
         coalesce((SELECT jsonb_agg(jsonb_build_object('id', s->>'id', 'name', s->>'name', 'kind', s->>'kind', 'enabled', s->'enabled', 'expiresAt', s->>'expiresAt', 'dealerUse', s->'dealerUse', 'aiProcessing', s->'aiProcessing', 'redistribute', s->'redistribute'))
                   FROM jsonb_array_elements(coalesce(c.payload->'sources', '[]'::jsonb)) s), '[]'::jsonb), c.version
  FROM dealer_commerce c WHERE c.tenant_id = p_tenant AND intelligence_is_platform_admin(p_admin)
$$;

-- Sets the subscription (or clears it with NULL) and the per-feature switches in one audited step.
CREATE FUNCTION intelligence_admin_set_entitlements(p_admin uuid, p_tenant uuid, p_subscription jsonb, p_features jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE k text; v jsonb;
BEGIN
  IF NOT intelligence_is_platform_admin(p_admin) THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_tenant AND tenant_id = p_tenant) THEN RETURN false; END IF;
  IF p_subscription IS NOT NULL THEN
    IF jsonb_typeof(p_subscription) <> 'object' OR p_subscription->>'plan' NOT IN ('starter', 'growth', 'scale') OR p_subscription->>'status' NOT IN ('active', 'suspended', 'cancelled')
       OR coalesce(length(p_subscription->>'reference'), 0) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'invalid_subscription' USING ERRCODE = '22023'; END IF;
    PERFORM (p_subscription->>'expiresAt')::timestamptz;
  END IF;
  IF jsonb_typeof(p_features) <> 'object' THEN RAISE EXCEPTION 'invalid_features' USING ERRCODE = '22023'; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p_features) LOOP
    IF jsonb_typeof(v) <> 'boolean' OR k !~ '^[a-z_]{2,40}$' THEN RAISE EXCEPTION 'invalid_features' USING ERRCODE = '22023'; END IF;
  END LOOP;
  INSERT INTO dealer_commerce(tenant_id, payload) VALUES (p_tenant,
    jsonb_build_object('subscription', p_subscription, 'features', p_features, 'sources', '[]'::jsonb, 'vehicles', '[]'::jsonb, 'fuel', '[]'::jsonb, 'keys', '[]'::jsonb, 'usage', '{}'::jsonb,
      'audit', jsonb_build_array(jsonb_build_object('actor', p_admin::text, 'action', 'entitlements.updated', 'subject', p_tenant::text, 'at', now()))))
  ON CONFLICT (tenant_id) DO UPDATE SET
    payload = jsonb_set(jsonb_set(dealer_commerce.payload, '{subscription}', coalesce(p_subscription, 'null'::jsonb)), '{features}', p_features)
      || jsonb_build_object('audit', (jsonb_build_array(jsonb_build_object('actor', p_admin::text, 'action', 'entitlements.updated', 'subject', p_tenant::text, 'at', now())) || coalesce(dealer_commerce.payload->'audit', '[]'::jsonb)) - 500),
    version = dealer_commerce.version + 1, updated_at = now();
  INSERT INTO platform_audit(id, tenant_id, actor, action, subject, payload)
  VALUES (gen_random_uuid(), p_tenant, p_admin::text, 'platform.entitlements_updated', p_tenant::text, jsonb_build_object('subscription', p_subscription, 'features', p_features));
  RETURN true;
END $$;

-- The platform audit trail across dealerships, newest first, optionally narrowed to one dealership, action or search text.
CREATE FUNCTION intelligence_admin_audit(p_admin uuid, p_tenant uuid, p_action text, p_q text, p_limit integer, p_offset integer)
RETURNS TABLE (id uuid, tenant_id uuid, organization text, actor text, actor_name text, action text, subject text, payload jsonb, occurred_at timestamptz, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.id, a.tenant_id, o.name, a.actor, u.display_name, a.action, a.subject, a.payload, a.occurred_at, count(*) OVER ()
  FROM platform_audit a
  LEFT JOIN organizations o ON o.id = a.tenant_id
  LEFT JOIN intelligence_users u ON u.id::text = a.actor
  WHERE intelligence_is_platform_admin(p_admin)
    AND (p_tenant IS NULL OR a.tenant_id = p_tenant)
    AND (p_action IS NULL OR a.action = p_action)
    AND (p_q IS NULL OR lower(coalesce(o.name, '') || ' ' || a.actor || ' ' || coalesce(u.display_name, '') || ' ' || a.action || ' ' || a.subject) LIKE '%' || lower(p_q) || '%')
  ORDER BY a.occurred_at DESC, a.id
  LIMIT least(greatest(p_limit, 1), 200) OFFSET greatest(p_offset, 0)
$$;

REVOKE ALL ON FUNCTION intelligence_admin_commerce(uuid, uuid), intelligence_admin_set_entitlements(uuid, uuid, jsonb, jsonb), intelligence_admin_audit(uuid, uuid, text, text, integer, integer) FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON dealer_commerce TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION intelligence_admin_commerce(uuid, uuid), intelligence_admin_set_entitlements(uuid, uuid, jsonb, jsonb), intelligence_admin_audit(uuid, uuid, text, text, integer, integer) TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
