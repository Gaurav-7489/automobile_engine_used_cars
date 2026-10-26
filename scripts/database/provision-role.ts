import { migrationPool } from "../../packages/data/src/postgres";
if(!process.env.MIGRATION_DATABASE_URL)throw new Error("Migration URL is required.");
const role=process.env.APPLICATION_DATABASE_USER ?? (process.env.DATA_MODE === "neon" ? "vandlabs_runtime" : "vandlabs_app");
if(!["vandlabs_runtime","vandlabs_app"].includes(role))throw new Error("Unsupported application role name.");
const secret=process.env.APPLICATION_DATABASE_PASSWORD ? {username:role,password:process.env.APPLICATION_DATABASE_PASSWORD} : undefined;
if(!secret)throw new Error("Configure APPLICATION_DATABASE_PASSWORD securely for Neon.");
if(secret.username!==role||!secret.password)throw new Error("Expected the application-role secret.");
const pool=migrationPool();const client=await pool.connect();
try{
 await client.query("BEGIN");
 if(!(await client.query("SELECT rolname FROM pg_roles WHERE rolname=$1",[role])).rows.length)await client.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`);
 const statement = await client.query("SELECT format('ALTER ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L', $1::text, $2::text) AS sql", [role,secret.password]);
 await client.query(statement.rows[0].sql);
 await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
 await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON organizations,dealerships,locations,vehicles,leads,tasks,journey_events,lead_activities,automation_rules,automation_runs,appointments TO ${role}`);
 await client.query(`GRANT SELECT,INSERT ON sales,inventory_history TO ${role}`);
 await client.query(`GRANT SELECT,INSERT,UPDATE ON stock_costs TO ${role}`);
 await client.query(`GRANT SELECT,INSERT ON stock_cost_history TO ${role}`);
 await client.query(`GRANT SELECT,INSERT,UPDATE ON staff_members TO ${role}`);
 await client.query(`GRANT SELECT,INSERT ON platform_audit TO ${role}`);
 await client.query(`GRANT SELECT,INSERT,UPDATE ON notification_outbox TO ${role}`);
 await client.query(`GRANT SELECT,INSERT,UPDATE ON dealer_commerce TO ${role}`);
 await client.query("COMMIT");console.log("Application role provisioned from its secret.");
}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();await pool.end();}
