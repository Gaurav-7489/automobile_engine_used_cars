import {test} from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {readFile,readdir} from "node:fs/promises";
test("notification records enforce tenant isolation and claim retries atomically",async()=>{
 const db=new PGlite();await db.waitReady;
 const a="11111111-1111-4111-a111-111111111111",b="22222222-2222-4222-a222-222222222222";
 try {
  for(const name of (await readdir("infra/database/migrations")).filter(n=>n.endsWith(".sql")).sort())await db.exec((await readFile(`infra/database/migrations/${name}`,"utf8")).replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;",""));
  for(const tenant of [a,b]) {
   await db.query("INSERT INTO organizations(id,tenant_id,name) VALUES($1,$1,'Dealer')",[tenant]);
   await db.query("INSERT INTO dealerships(id,tenant_id,organization_id,name,brand_name) VALUES($1,$1,$1,'Dealer','Dealer')",[tenant]);
   await db.query("INSERT INTO leads(id,tenant_id,dealership_id,payload,stage,source) VALUES($1,$1,$1,'{}','new','web')",[tenant]);
   await db.query("INSERT INTO notification_outbox(id,tenant_id,lead_id) VALUES($1,$1,$1)",[tenant]);
  }
  await db.exec(await readFile("infra/database/application-role.sql","utf8"));await db.exec("SET ROLE vandlabs_app; BEGIN;");
  await db.query("SELECT set_config('app.tenant_id',$1,true)",[a]);
  assert.equal((await db.query("SELECT * FROM notification_outbox")).rows.length,1);
  await assert.rejects(db.query("INSERT INTO notification_outbox(id,tenant_id,lead_id) VALUES('33333333-3333-4333-a333-333333333333',$1,$1)",[b]));
  await db.exec("ROLLBACK; BEGIN;");await db.query("SELECT set_config('app.tenant_id',$1,true)",[a]);
  const claim="UPDATE notification_outbox SET attempts=attempts+1,available_at=now()+interval '2 minutes' WHERE id IN (SELECT id FROM notification_outbox WHERE tenant_id=$1 AND sent_at IS NULL AND available_at<=now() FOR UPDATE SKIP LOCKED) RETURNING id";
  assert.equal((await db.query(claim,[a])).rows.length,1);assert.equal((await db.query(claim,[a])).rows.length,0);
  await db.exec("COMMIT");
 } finally {await db.close();}
});
