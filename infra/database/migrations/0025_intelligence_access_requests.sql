BEGIN;

-- Additive. Access requests: a person signs in with Google, has no access yet, and asks for it with their dealership's details.
-- Nothing is granted by asking. A VandLabs platform administrator approves (which creates the dealership and assigns this
-- Google account as owner) or declines. The request is bound to the verified Google identity that made it, never to a typed email.

CREATE TABLE intelligence_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub text NOT NULL,
  email text NOT NULL,
  name text NOT NULL,
  business_name text NOT NULL,
  dealership_name text NOT NULL,
  phone text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid,
  decision_note text,
  tenant_id uuid
);
-- One open request per Google account.
CREATE UNIQUE INDEX intelligence_access_requests_open ON intelligence_access_requests (google_sub) WHERE status = 'pending';
CREATE INDEX intelligence_access_requests_status ON intelligence_access_requests (status, created_at DESC);
ALTER TABLE intelligence_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_access_requests FORCE ROW LEVEL SECURITY;

-- Creates or updates the caller's own open request. The application calls it only with an identity Google just verified.
CREATE FUNCTION intelligence_submit_access_request(p_sub text, p_email text, p_name text, p_business text, p_dealership text, p_phone text, p_city text, p_state text, p_message text)
RETURNS TABLE (request_id uuid, outcome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE rid uuid; email_l text := lower(trim(p_email));
BEGIN
  IF length(coalesce(p_sub, '')) NOT BETWEEN 1 AND 255 OR email_l !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' THEN RAISE EXCEPTION 'invalid_identity' USING ERRCODE = '22023'; END IF;
  -- Someone who already has access, or whose account is bound to this Google identity, does not need a request.
  IF EXISTS (SELECT 1 FROM intelligence_users u WHERE u.google_sub = p_sub OR lower(u.email) = email_l) THEN
    RETURN QUERY SELECT NULL::uuid, 'has_account'::text; RETURN;
  END IF;
  -- Too many declined requests from this Google account: stop accepting new ones.
  IF (SELECT count(*) FROM intelligence_access_requests r WHERE r.google_sub = p_sub AND r.status = 'declined' AND r.decided_at > now() - interval '30 days') >= 3 THEN
    RETURN QUERY SELECT NULL::uuid, 'declined_recently'::text; RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('intelligence:access-request:' || p_sub, 0));
  UPDATE intelligence_access_requests SET email = email_l, name = left(trim(p_name), 120), business_name = left(trim(p_business), 120), dealership_name = left(trim(p_dealership), 120),
    phone = left(trim(p_phone), 20), city = left(trim(p_city), 80), state = left(trim(p_state), 80), message = nullif(left(trim(coalesce(p_message, '')), 600), ''), updated_at = now()
    WHERE google_sub = p_sub AND status = 'pending' RETURNING id INTO rid;
  IF rid IS NOT NULL THEN RETURN QUERY SELECT rid, 'updated'::text; RETURN; END IF;
  INSERT INTO intelligence_access_requests (google_sub, email, name, business_name, dealership_name, phone, city, state, message)
  VALUES (p_sub, email_l, left(trim(p_name), 120), left(trim(p_business), 120), left(trim(p_dealership), 120), left(trim(p_phone), 20), left(trim(p_city), 80), left(trim(p_state), 80), nullif(left(trim(coalesce(p_message, '')), 600), ''))
  RETURNING id INTO rid;
  RETURN QUERY SELECT rid, 'created'::text;
END $$;

-- What the requester sees about their own request.
CREATE FUNCTION intelligence_access_request_status(p_sub text)
RETURNS TABLE (status text, business_name text, created_at timestamptz, decided_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.status, r.business_name, r.created_at, r.decided_at FROM intelligence_access_requests r WHERE r.google_sub = p_sub ORDER BY r.created_at DESC LIMIT 1
$$;

CREATE FUNCTION intelligence_admin_access_requests(p_admin uuid, p_status text)
RETURNS TABLE (id uuid, email text, name text, business_name text, dealership_name text, phone text, city text, state text, message text, status text, created_at timestamptz, decided_at timestamptz, decision_note text, tenant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.id, r.email, r.name, r.business_name, r.dealership_name, r.phone, r.city, r.state, r.message, r.status, r.created_at, r.decided_at, r.decision_note, r.tenant_id
  FROM intelligence_access_requests r
  WHERE intelligence_is_platform_admin(p_admin) AND (p_status IS NULL OR r.status = p_status)
  ORDER BY r.created_at DESC LIMIT 200
$$;

-- Approve: creates the dealership (business, dealership, one branch from the request; the administrator may correct the names)
-- with the requester's Google email as the assigned owner. Decline: records why. Either way the decision is final and audited.
CREATE FUNCTION intelligence_admin_decide_access_request(p_admin uuid, p_request uuid, p_approve boolean, p_note text, p_business text, p_dealership text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r intelligence_access_requests%ROWTYPE; tid uuid;
BEGIN
  IF NOT intelligence_is_platform_admin(p_admin) THEN RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM intelligence_access_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pending' THEN RAISE EXCEPTION 'not_pending' USING ERRCODE = '22023'; END IF;
  IF p_approve THEN
    tid := intelligence_admin_provision_google(p_admin, coalesce(nullif(trim(p_business), ''), r.business_name), coalesce(nullif(trim(p_dealership), ''), r.dealership_name),
      jsonb_build_array(jsonb_build_object('name', 'Main branch', 'city', r.city, 'state', r.state, 'phone', r.phone)), r.email, r.name);
    UPDATE intelligence_access_requests SET status = 'approved', decided_at = now(), decided_by = p_admin, decision_note = nullif(left(trim(coalesce(p_note, '')), 300), ''), tenant_id = tid, updated_at = now() WHERE id = p_request;
    INSERT INTO platform_audit(id, tenant_id, actor, action, subject, payload)
    VALUES (gen_random_uuid(), tid, p_admin::text, 'access_request.approved', p_request::text, jsonb_build_object('email', r.email));
    RETURN tid;
  END IF;
  UPDATE intelligence_access_requests SET status = 'declined', decided_at = now(), decided_by = p_admin, decision_note = nullif(left(trim(coalesce(p_note, '')), 300), ''), updated_at = now() WHERE id = p_request;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION intelligence_submit_access_request(text, text, text, text, text, text, text, text, text), intelligence_access_request_status(text),
  intelligence_admin_access_requests(uuid, text), intelligence_admin_decide_access_request(uuid, uuid, boolean, text, text, text) FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION intelligence_submit_access_request(text, text, text, text, text, text, text, text, text), intelligence_access_request_status(text), intelligence_admin_access_requests(uuid, text), intelligence_admin_decide_access_request(uuid, uuid, boolean, text, text, text) TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
