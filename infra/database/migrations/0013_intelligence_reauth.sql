BEGIN;

-- Additive: dedicated password confirmation (step-up) for signed-in users. It is deliberately separate from
-- sign-in: it never selects a workspace, never clears or advances the sign-in lockout, and keeps its own
-- failure counter so repeated wrong confirmations cannot lock a person out of signing in.

ALTER TABLE intelligence_users
  ADD COLUMN reauth_failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN reauth_locked_until timestamptz;

-- Returns the hash for exactly one user id. `locked` is true while either the sign-in lock or the confirmation lock is active.
CREATE FUNCTION intelligence_reauth_state(p_user uuid)
RETURNS TABLE (password_hash text, disabled boolean, locked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.password_hash, u.disabled,
    coalesce(u.locked_until > now(), false) OR coalesce(u.reauth_locked_until > now(), false)
  FROM intelligence_users u WHERE u.id = p_user
$$;

-- Five consecutive wrong confirmations pause confirmation (not sign-in) for ten minutes. Success clears the counter.
CREATE FUNCTION intelligence_record_reauth(p_user uuid, p_success boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE intelligence_users SET
    reauth_failed_attempts = CASE WHEN p_success THEN 0 WHEN reauth_failed_attempts + 1 >= 5 THEN 0 ELSE reauth_failed_attempts + 1 END,
    reauth_locked_until = CASE WHEN p_success THEN NULL WHEN reauth_failed_attempts + 1 >= 5 THEN now() + interval '10 minutes' ELSE reauth_locked_until END
  WHERE id = p_user
$$;

REVOKE ALL ON FUNCTION intelligence_reauth_state(uuid), intelligence_record_reauth(uuid, boolean) FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION intelligence_reauth_state(uuid), intelligence_record_reauth(uuid, boolean) TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
