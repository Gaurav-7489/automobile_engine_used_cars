BEGIN;
CREATE TABLE notification_outbox (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 lead_id uuid NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,lead_id) REFERENCES leads(tenant_id,id)
);
ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_tenant ON notification_outbox
 USING (tenant_id = current_setting('app.tenant_id',true)::uuid)
 WITH CHECK (tenant_id = current_setting('app.tenant_id',true)::uuid);
CREATE INDEX notification_outbox_pending ON notification_outbox(tenant_id,available_at) WHERE sent_at IS NULL;
COMMIT;
