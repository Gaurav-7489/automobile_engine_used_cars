import { Pool, databaseSecret } from "../../packages/data/src/postgres";
if(!process.env.MIGRATION_DATABASE_URL||!process.env.APPLICATION_DATABASE_SECRET_ARN)throw new Error("Migration URL and APPLICATION_DATABASE_SECRET_ARN are required.");
const secret=await databaseSecret(process.env.APPLICATION_DATABASE_SECRET_ARN);
if(secret.username!=="vandlabs_app"||!secret.password)throw new Error("Expected the application-role secret.");
const pool=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL});const client=await pool.connect();
try{
 await client.query("BEGIN");
 if(!(await client.query("SELECT rolname FROM pg_roles WHERE rolname='vandlabs_app'")).rows.length)await client.query("CREATE ROLE vandlabs_app LOGIN NOSUPERUSER NOBYPASSRLS");
 const statement = await client.query("SELECT format('ALTER ROLE vandlabs_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L', $1::text) AS sql", [secret.password]);
 await client.query(statement.rows[0].sql);
 await client.query("GRANT USAGE ON SCHEMA public TO vandlabs_app");
 await client.query("GRANT SELECT,INSERT,UPDATE,DELETE ON organizations,dealerships,locations,vehicles,leads,tasks,journey_events,lead_activities,automation_rules,automation_runs,appointments TO vandlabs_app");
 await client.query("GRANT SELECT,INSERT ON sales,inventory_history TO vandlabs_app");
 await client.query("GRANT SELECT,INSERT,UPDATE ON stock_costs TO vandlabs_app");
 await client.query("GRANT SELECT,INSERT ON stock_cost_history TO vandlabs_app");
 await client.query("COMMIT");console.log("Application role provisioned from its secret.");
}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();await pool.end();}
