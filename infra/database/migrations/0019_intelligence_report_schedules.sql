BEGIN;

-- Additive: scheduled report emails. Schedules are workspace documents (intelligence_documents, collection 'reportSchedules'),
-- which already have forced row-level security per tenant. The daily delivery job runs with no tenant set, so it needs one
-- question answered across tenants: which dealerships have a schedule due? This function returns only those tenant ids;
-- every schedule, recipient and email is then read inside that tenant's own row-level-security transaction.

CREATE INDEX intelligence_documents_report_schedules ON intelligence_documents (tenant_id) WHERE collection = 'reportSchedules';

CREATE FUNCTION intelligence_due_report_tenants(p_now timestamptz, p_limit integer)
RETURNS TABLE (tenant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.tenant_id FROM (
    SELECT d.tenant_id,
      CASE WHEN d.payload->>'nextRunAt' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$' THEN (d.payload->>'nextRunAt')::timestamptz END AS next_run,
      CASE WHEN d.payload->>'claimedUntil' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$' THEN (d.payload->>'claimedUntil')::timestamptz END AS claimed_until
    FROM intelligence_documents d
    WHERE d.collection = 'reportSchedules'
  ) s
  WHERE s.next_run <= p_now AND (s.claimed_until IS NULL OR s.claimed_until <= p_now)
  GROUP BY s.tenant_id
  ORDER BY min(s.next_run)
  LIMIT least(greatest(coalesce(p_limit, 1), 1), 500)
$$;

-- Which of the given users can still sign in to the tenant whose row-level-security context is set. Suspended accounts are
-- excluded, so they receive no report emails. Called only inside a tenant transaction: with no tenant set, or a different
-- one, it returns nothing.
CREATE FUNCTION intelligence_active_members(p_tenant uuid, p_users uuid[])
RETURNS TABLE (user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id FROM intelligence_users u
  WHERE p_tenant = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND u.id = ANY(p_users) AND NOT u.disabled
    AND EXISTS (SELECT 1 FROM staff_members s WHERE s.tenant_id = p_tenant AND s.user_id = u.id::text AND coalesce((s.payload->>'enabled')::boolean, true))
$$;

REVOKE ALL ON FUNCTION intelligence_due_report_tenants(timestamptz, integer), intelligence_active_members(uuid, uuid[]) FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION intelligence_due_report_tenants(timestamptz, integer), intelligence_active_members(uuid, uuid[]) TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
