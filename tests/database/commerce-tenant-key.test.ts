import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { postgresCommerceRepository } from "../../packages/data/src/commerce";
import { provisionTenant } from "../../packages/data/src/provisioning";
import type { SqlPool } from "../../packages/data/src/postgres";

const migrations = async () => (await readdir("infra/database/migrations")).filter(n => n.endsWith(".sql")).sort();
const apply = async (db: PGlite, names: string[]) => { for (const name of names) await db.exec((await readFile(`infra/database/migrations/${name}`, "utf8")).replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", "")); };
const poolFor = (db: PGlite): SqlPool => ({ async connect() { return { async query(sql, values) { return { rows: (await db.query<Record<string, unknown>>(sql, values)).rows }; }, release() {} }; } });
const grants = async (db: PGlite, role: string) => (await db.query<{ privilege_type: string }>("SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name='dealer_commerce' AND grantee=$1 ORDER BY 1", [role])).rows.map(r => r.privilege_type);

test("commerce state is keyed by tenant even when the organization id differs", async () => {
  const db = new PGlite(); await db.waitReady;
  await db.exec("CREATE ROLE vandlabs_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS");
  try {
    await apply(db, await migrations());
    const config = JSON.parse(await readFile("docs/tenant-config.example.json", "utf8"));
    assert.notEqual(config.organization.id, config.tenantId, "the documented template uses distinct ids");
    const admin = await poolFor(db).connect(); await provisionTenant(admin, config); admin.release();
    await db.exec("SET ROLE vandlabs_runtime");
    const repo = postgresCommerceRepository(poolFor(db));
    await repo.transact(config.tenantId, state => { state.usage["probe"] = 1; });
    assert.equal(await repo.transact(config.tenantId, state => state.usage["probe"]), 1);
    await assert.rejects(repo.transact("33333333-3333-4333-a333-333333333333", () => true), /foreign key/, "unprovisioned tenants cannot create commerce state");
    await db.exec("RESET ROLE");
    await assert.rejects(db.query("INSERT INTO organizations(id,tenant_id,name) VALUES($1,$2,'Second')", ["44444444-4444-4444-a444-444444444444", config.tenantId]), /organizations_tenant_id_key/);
  } finally { await db.close(); }
});

test("0009 upgrades an environment that already applied 0007/0008 and strips bypass-role grants", async () => {
  const db = new PGlite(); await db.waitReady;
  await db.exec("CREATE ROLE vandlabs_app NOLOGIN BYPASSRLS; CREATE ROLE vandlabs_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS");
  try {
    const names = await migrations(), upgrade = names.indexOf("0009_dealer_commerce_tenant_key.sql");
    assert.ok(upgrade > 0);
    await apply(db, names.slice(0, upgrade));
    const tenant = "11111111-1111-4111-a111-111111111111";
    await db.query("INSERT INTO organizations(id,tenant_id,name) VALUES($1,$1,'Existing')", [tenant]);
    await db.query("INSERT INTO dealer_commerce(tenant_id,payload) VALUES($1,'{}')", [tenant]);
    assert.deepEqual(await grants(db, "vandlabs_app"), ["INSERT", "SELECT", "UPDATE"], "0007 granted the legacy role");
    await apply(db, names.slice(upgrade));
    assert.equal((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM dealer_commerce")).rows[0].n, 1, "existing commerce rows survive");
    assert.deepEqual(await grants(db, "vandlabs_app"), [], "BYPASSRLS roles lose commerce access");
    assert.deepEqual(await grants(db, "vandlabs_runtime"), ["INSERT", "SELECT", "UPDATE"]);
    const fk = (await db.query<{ def: string }>("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='dealer_commerce'::regclass AND contype='f'")).rows.map(r => r.def);
    assert.deepEqual(fk, ["FOREIGN KEY (tenant_id) REFERENCES organizations(tenant_id)"]);
  } finally { await db.close(); }
});
