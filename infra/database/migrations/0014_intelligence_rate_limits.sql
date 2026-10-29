BEGIN;

-- Additive: a durable, shared fixed-window rate limiter so limits hold across every serverless instance.
-- Keys are SHA-256 hashes computed by the application, so no email or address is stored.
-- The table is unreachable by the runtime role; only the function below touches it.

CREATE TABLE intelligence_rate_limits (
  key_hash text PRIMARY KEY,
  window_ends_at timestamptz NOT NULL,
  hits integer NOT NULL
);
CREATE INDEX intelligence_rate_limits_expiry ON intelligence_rate_limits (window_ends_at);
ALTER TABLE intelligence_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_rate_limits FORCE ROW LEVEL SECURITY;

CREATE FUNCTION intelligence_rate_hit(p_key text, p_limit integer, p_window_seconds integer)
RETURNS TABLE (allowed boolean, retry_after integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r intelligence_rate_limits%ROWTYPE;
BEGIN
  IF p_limit < 1 OR p_window_seconds < 1 OR p_window_seconds > 86400 OR length(p_key) <> 64 THEN
    RAISE EXCEPTION 'invalid rate limit arguments';
  END IF;
  INSERT INTO intelligence_rate_limits AS t (key_hash, window_ends_at, hits)
  VALUES (p_key, now() + make_interval(secs => p_window_seconds), 1)
  ON CONFLICT (key_hash) DO UPDATE SET
    hits = CASE WHEN t.window_ends_at <= now() THEN 1 ELSE t.hits + 1 END,
    window_ends_at = CASE WHEN t.window_ends_at <= now() THEN now() + make_interval(secs => p_window_seconds) ELSE t.window_ends_at END
  RETURNING * INTO r;
  -- Occasional cleanup of long-expired windows keeps the table small without a scheduled job.
  IF random() < 0.01 THEN
    DELETE FROM intelligence_rate_limits WHERE key_hash IN (SELECT key_hash FROM intelligence_rate_limits WHERE window_ends_at < now() - interval '1 hour' LIMIT 500);
  END IF;
  RETURN QUERY SELECT r.hits <= p_limit, greatest(1, ceil(extract(epoch FROM (r.window_ends_at - now())))::integer);
END $$;

REVOKE ALL ON FUNCTION intelligence_rate_hit(text, integer, integer) FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION intelligence_rate_hit(text, integer, integer) TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
