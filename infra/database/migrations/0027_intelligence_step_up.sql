BEGIN;

-- Additive. Single-use step-up confirmations: a confirmation identifier (jti) is recorded the first time it is used, so the same
-- confirmation can never authorise a second operation. The table is unreachable by the runtime role; only the function below touches it,
-- exactly like the rate limiter.

CREATE TABLE intelligence_step_up_used (
  jti text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE INDEX intelligence_step_up_used_expiry ON intelligence_step_up_used (expires_at);
ALTER TABLE intelligence_step_up_used ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_step_up_used FORCE ROW LEVEL SECURITY;

-- Returns true only the first time a confirmation is presented before it expires.
CREATE FUNCTION intelligence_step_up_consume(p_jti text, p_expires_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  IF length(p_jti) < 16 OR length(p_jti) > 64 OR p_expires_at IS NULL THEN
    RAISE EXCEPTION 'invalid step-up confirmation';
  END IF;
  IF p_expires_at <= now() THEN
    RETURN false;
  END IF;
  INSERT INTO intelligence_step_up_used (jti, expires_at) VALUES (p_jti, p_expires_at) ON CONFLICT (jti) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  -- Occasional cleanup of long-expired confirmations keeps the table small without a scheduled job.
  IF random() < 0.01 THEN
    DELETE FROM intelligence_step_up_used WHERE jti IN (SELECT jti FROM intelligence_step_up_used WHERE expires_at < now() - interval '1 hour' LIMIT 500);
  END IF;
  RETURN n = 1;
END $$;

REVOKE ALL ON FUNCTION intelligence_step_up_consume(text, timestamptz) FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION intelligence_step_up_consume(text, timestamptz) TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
