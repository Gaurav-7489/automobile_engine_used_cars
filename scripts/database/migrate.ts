import { readFile, readdir } from "node:fs/promises";
import { migrationPool } from "../../packages/data/src/postgres";
const url=process.env.MIGRATION_DATABASE_URL;
if(!url)throw new Error("Set MIGRATION_DATABASE_URL to a migration/admin connection.");
const pool=migrationPool();const client=await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(884214)");
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  for(const name of (await readdir("infra/database/migrations")).filter(n=>n.endsWith(".sql")).sort()) {
    if((await client.query("SELECT name FROM schema_migrations WHERE name=$1",[name])).rows.length)continue;
    const sql=await readFile(`infra/database/migrations/${name}`,"utf8");
    await client.query("BEGIN");try{
      await client.query(sql.replace(/^BEGIN;\s*/i,"").replace(/COMMIT;\s*$/i,""));
      await client.query("INSERT INTO schema_migrations(name) VALUES($1)",[name]);await client.query("COMMIT");
      console.log(`Applied ${name}`);
    }catch(e){await client.query("ROLLBACK");throw e;}
  }
}finally{await client.query("SELECT pg_advisory_unlock(884214)");client.release();await pool.end();}
