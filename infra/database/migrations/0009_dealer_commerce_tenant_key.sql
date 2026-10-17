BEGIN;
-- 0007 keyed dealer_commerce to organizations(id), but the application writes the tenant id.
-- Tenants provisioned with organization.id <> tenantId could never record commerce state.
-- Existing rows were written with the tenant id, so they satisfy the corrected key.
-- Provisioning already allows one organization per tenant; fails here (and rolls back) if not.
ALTER TABLE organizations ADD CONSTRAINT organizations_tenant_id_key UNIQUE (tenant_id);
DO $$ DECLARE c text; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='dealer_commerce'::regclass AND contype='f' LOOP
  EXECUTE format('ALTER TABLE dealer_commerce DROP CONSTRAINT %I', c);
 END LOOP;
END $$;
ALTER TABLE dealer_commerce ADD CONSTRAINT dealer_commerce_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES organizations(tenant_id);
-- A role that bypasses RLS must never hold tenant commerce grants (staging's legacy vandlabs_app).
-- Restricted runtime roles converge on the same grants regardless of migration/provisioning order.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT rolname, rolbypassrls OR rolsuper AS bypass FROM pg_roles WHERE rolname IN ('vandlabs_app','vandlabs_runtime') LOOP
  IF r.bypass THEN
   EXECUTE format('REVOKE ALL ON dealer_commerce FROM %I', r.rolname);
  ELSE
   EXECUTE format('GRANT SELECT,INSERT,UPDATE ON dealer_commerce TO %I', r.rolname);
  END IF;
 END LOOP;
END $$;
COMMIT;
