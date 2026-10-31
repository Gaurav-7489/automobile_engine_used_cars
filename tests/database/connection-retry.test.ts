import { test } from "node:test";
import assert from "node:assert/strict";
import { connectClient, isTransientConnectionError, tenantTransaction, type SqlClient, type SqlPool } from "../../packages/data/src/postgres";

const TENANT = "00000000-0000-4000-8000-000000000001";
const timeout = () => new Error("timeout exceeded when trying to connect");

test("transient connection failures are recognised; statement errors are not", () => {
  assert.equal(isTransientConnectionError(timeout()), true);
  assert.equal(isTransientConnectionError(Object.assign(new Error("server conn crashed?"), { code: "08P01" })), true);
  assert.equal(isTransientConnectionError(new Error("Connection terminated due to connection timeout")), true);
  assert.equal(isTransientConnectionError(Object.assign(new Error("duplicate key"), { code: "23505" })), false);
  assert.equal(isTransientConnectionError(new Error("permission denied for table vehicles")), false);
});

test("opening a connection retries while the database wakes, then gives up", async () => {
  let calls = 0;
  const client: SqlClient = { query: async () => ({ rows: [] }), release() {} };
  const waking: SqlPool = { connect: async () => { if (++calls < 3) throw timeout(); return client; } };
  assert.equal(await connectClient(waking), client);
  assert.equal(calls, 3);
  calls = 0;
  const down: SqlPool = { connect: async () => { calls++; throw timeout(); } };
  await assert.rejects(connectClient(down), /timeout exceeded/);
  assert.equal(calls, 3);
  calls = 0;
  const denied: SqlPool = { connect: async () => { calls++; throw new Error("password authentication failed"); } };
  await assert.rejects(connectClient(denied), /password authentication failed/);
  assert.equal(calls, 1, "a non-network error is not retried");
});

test("a pooled connection that died while idle is discarded and the transaction runs on a fresh one", async () => {
  const released: unknown[] = [];
  const statements: string[] = [];
  let opened = 0;
  const pool: SqlPool = { connect: async () => {
    const id = ++opened;
    return {
      async query(sql: string) {
        if (id === 1 && sql === "BEGIN") throw Object.assign(new Error("server conn crashed?"), { code: "08P01" });
        statements.push(sql);
        return { rows: sql.startsWith("SELECT set_config") ? [{ tenant: TENANT, rolsuper: false, rolbypassrls: false }] : [{ ok: 1 }] };
      },
      release(error?: unknown) { released.push(error ?? null); },
    };
  } };
  const result = await tenantTransaction(pool, TENANT, async (c) => (await c.query("SELECT 1 AS ok")).rows[0]);
  assert.deepEqual(result, { ok: 1 });
  assert.equal(opened, 2);
  assert.ok(released[0] instanceof Error, "the dead connection is destroyed, not returned to the pool");
  assert.deepEqual(statements.filter((s) => !s.startsWith("SELECT set_config")), ["BEGIN", "SELECT 1 AS ok", "COMMIT"]);
});

test("an error inside the transaction is never retried", async () => {
  let actions = 0;
  const pool: SqlPool = { connect: async () => ({
    async query(sql: string) { return { rows: sql.startsWith("SELECT set_config") ? [{ rolsuper: false, rolbypassrls: false }] : [] }; },
    release() {},
  }) };
  await assert.rejects(tenantTransaction(pool, TENANT, async () => { actions++; throw timeout(); }), /timeout exceeded/);
  assert.equal(actions, 1);
});
