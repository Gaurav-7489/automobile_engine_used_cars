BEGIN;

-- Additive. Four things the operating playbook describes as part of the product:
--   1. Customer messaging channels a dealership configures for the AI agent (website chat, WhatsApp, Instagram).
--   2. The conversations themselves, so every exchange is logged and visible to the team, linked to the lead it created.
--   3. Operating expenses (rent, salaries, utilities...) so revenue and expenses can be seen side by side.
--   4. Investor and partner records with their contributions. Records only: no return or profit-share calculation.
-- Every table is tenant-scoped by forced row-level security, like every other workspace table.

CREATE TABLE intelligence_ai_channels (
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  channel text NOT NULL CHECK (channel IN ('website', 'whatsapp', 'instagram')),
  enabled boolean NOT NULL DEFAULT false,
  external_id text NOT NULL DEFAULT '',     -- WhatsApp phone-number id or Instagram account id; '' for the website
  display_name text NOT NULL DEFAULT '',
  token_cipher text,                        -- provider access token, encrypted by the application
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, channel)
);
-- One WhatsApp number or Instagram account can belong to one dealership only.
CREATE UNIQUE INDEX intelligence_ai_channels_external ON intelligence_ai_channels (channel, external_id) WHERE external_id <> '';

CREATE TABLE intelligence_conversations (
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  conversation_id text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('website', 'whatsapp', 'instagram')),
  contact_key text NOT NULL,                -- hash of the website visitor token, WhatsApp number or Instagram user id
  contact_name text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  contact_ref text NOT NULL DEFAULT '',     -- where replies go: WhatsApp number or Instagram user id; '' for the website
  vehicle_stock_id text,
  lead_id text,
  status text NOT NULL DEFAULT 'ai' CHECK (status IN ('ai', 'team', 'closed')),
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  unread boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, conversation_id),
  CHECK (jsonb_typeof(messages) = 'array')
);
CREATE INDEX intelligence_conversations_contact ON intelligence_conversations (tenant_id, channel, contact_key, updated_at DESC);
CREATE INDEX intelligence_conversations_recent ON intelligence_conversations (tenant_id, updated_at DESC);
CREATE INDEX intelligence_conversations_lead ON intelligence_conversations (tenant_id, lead_id) WHERE lead_id IS NOT NULL;

CREATE TABLE intelligence_expenses (
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  expense_id text NOT NULL,
  branch_id uuid NOT NULL,
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  spent_on date NOT NULL,
  created_by uuid NOT NULL,
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, expense_id)
);
CREATE INDEX intelligence_expenses_month ON intelligence_expenses (tenant_id, spent_on DESC);

CREATE TABLE intelligence_investors (
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  investor_id text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'Investor' CHECK (kind IN ('Investor', 'Partner', 'Lender')),
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  agreement text NOT NULL DEFAULT '',       -- the dealership's own words for the arrangement; never computed on
  notes text NOT NULL DEFAULT '',
  entries jsonb NOT NULL DEFAULT '[]'::jsonb, -- contributions and repayments: {id, kind, amountPaise, on, note, by}
  archived boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, investor_id),
  CHECK (jsonb_typeof(entries) = 'array')
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['intelligence_ai_channels', 'intelligence_conversations', 'intelligence_expenses', 'intelligence_investors'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;

-- A message arriving from WhatsApp or Instagram names the receiving number or account, not the dealership. This narrow
-- lookup answers which dealership has that channel switched on, and nothing else.
CREATE FUNCTION intelligence_ai_channel_tenant(p_channel text, p_external_id text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT tenant_id FROM intelligence_ai_channels WHERE channel = p_channel AND external_id = p_external_id AND external_id <> '' AND enabled LIMIT 1
$$;

-- Management engagement in the health review needs to know when people last signed in.
ALTER TABLE intelligence_users ADD COLUMN last_login_at timestamptz;
CREATE OR REPLACE FUNCTION intelligence_record_login(p_id uuid, p_success boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE intelligence_users SET
    failed_attempts = CASE WHEN p_success THEN 0 WHEN failed_attempts + 1 >= 5 THEN 0 ELSE failed_attempts + 1 END,
    locked_until = CASE WHEN p_success THEN NULL WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END,
    last_login_at = CASE WHEN p_success THEN now() ELSE last_login_at END
  WHERE id = p_id
$$;

-- Platform health review: a handful of counts per dealership for VandLabs customer success. Counts only, no records, and only
-- for a platform administrator.
CREATE FUNCTION intelligence_health_counts(p_admin uuid)
RETURNS TABLE (tenant_id uuid, vehicles_live integer, vehicles_stale integer, vehicles_no_photo integer, vehicles_no_price integer,
  leads_30d integer, leads_overdue integer, leads_unassigned integer, campaigns_30d integer, recommended_30d integer,
  conversations_30d integer, channels_on integer, logins_30d integer, expenses_30d integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.tenant_id,
    (SELECT count(*)::int FROM vehicles v WHERE v.tenant_id = o.tenant_id AND v.availability_status IN ('available', 'reserved')),
    (SELECT count(*)::int FROM vehicles v WHERE v.tenant_id = o.tenant_id AND v.availability_status IN ('available', 'reserved') AND v.updated_at < now() - interval '30 days'),
    (SELECT count(*)::int FROM vehicles v WHERE v.tenant_id = o.tenant_id AND v.availability_status IN ('available', 'reserved')
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v.payload->'media') = 'array' THEN v.payload->'media' ELSE '[]'::jsonb END) e WHERE e->>'url' LIKE 'https://%')),
    (SELECT count(*)::int FROM vehicles v WHERE v.tenant_id = o.tenant_id AND v.availability_status IN ('available', 'reserved') AND coalesce(v.payload->>'price', '') !~ '^[1-9][0-9]*(\.[0-9]+)?$'),
    (SELECT count(*)::int FROM intelligence_lead_index l WHERE l.tenant_id = o.tenant_id AND l.created_at > now() - interval '30 days'),
    (SELECT count(*)::int FROM intelligence_lead_index l WHERE l.tenant_id = o.tenant_id AND l.overdue_flag),
    (SELECT count(*)::int FROM intelligence_lead_index l WHERE l.tenant_id = o.tenant_id AND l.owner = 'Unassigned' AND l.stage NOT IN ('Won', 'Lost')),
    (SELECT count(*)::int FROM intelligence_documents d WHERE d.tenant_id = o.tenant_id AND d.collection = 'campaigns' AND d.updated_at > now() - interval '30 days'),
    (SELECT count(*)::int FROM intelligence_documents d WHERE d.tenant_id = o.tenant_id AND d.collection = 'campaigns' AND d.updated_at > now() - interval '30 days' AND d.payload ? 'recommendation'),
    (SELECT count(*)::int FROM intelligence_conversations c WHERE c.tenant_id = o.tenant_id AND c.created_at > now() - interval '30 days'),
    (SELECT count(*)::int FROM intelligence_ai_channels a WHERE a.tenant_id = o.tenant_id AND a.enabled),
    (SELECT count(DISTINCT s.user_id)::int FROM staff_members s JOIN intelligence_users u ON u.id::text = s.user_id
       WHERE s.tenant_id = o.tenant_id AND u.last_login_at > now() - interval '30 days'),
    (SELECT count(*)::int FROM intelligence_expenses x WHERE x.tenant_id = o.tenant_id AND x.created_at > now() - interval '30 days')
  FROM organizations o
  WHERE intelligence_is_platform_admin(p_admin) AND o.tenant_id IS NOT NULL
$$;

REVOKE ALL ON FUNCTION intelligence_ai_channel_tenant(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION intelligence_health_counts(uuid) FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION intelligence_ai_channel_tenant(text, text), intelligence_health_counts(uuid) TO %I', r);
      IF r = 'vandlabs_runtime' THEN
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON intelligence_ai_channels, intelligence_conversations, intelligence_investors TO %I', r);
        EXECUTE format('GRANT SELECT, INSERT, DELETE ON intelligence_expenses TO %I', r);
      END IF;
    END IF;
  END LOOP;
END $$;

COMMIT;
