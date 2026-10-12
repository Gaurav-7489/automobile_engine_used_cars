import { databasePool, tenantTransaction, type SqlPool } from "./postgres";
/** Deliver only a record reference; customer contact data never enters email logs. */
export async function dispatchNotifications(tenantId:string, options: {
  pool?:SqlPool; fetcher?:typeof fetch; env?:Record<string,string|undefined>;
} = {}) {
  const env=options.env ?? process.env, fetcher=options.fetcher ?? fetch;
  if(!env.RESEND_API_KEY || !env.NOTIFICATION_FROM || !env.NOTIFICATION_TO || !env.APP_ORIGIN) throw new Error("Resend notifications are not configured.");
  const origin=new URL(env.APP_ORIGIN); if(origin.protocol!=="https:" || origin.username || origin.password)throw new Error("HTTPS notification origin required.");
  const pool=options.pool ?? await databasePool();
  // Short claim transaction; provider calls never hold database locks or connections.
  const rows=await tenantTransaction(pool,tenantId,async c=>(await c.query(`
    UPDATE notification_outbox SET attempts=attempts+1,available_at=now()+interval '2 minutes'
    WHERE id IN (SELECT id FROM notification_outbox WHERE tenant_id=$1 AND sent_at IS NULL AND attempts<8
      AND available_at<=now() AND created_at>now()-interval '23 hours' ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED)
    RETURNING id,lead_id,attempts`,[tenantId])).rows);
  let sent=0;
  for(const row of rows) {
    try {
      const response=await fetcher("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json","Idempotency-Key":`lead-${row.id}`},body:JSON.stringify({from:env.NOTIFICATION_FROM,to:env.NOTIFICATION_TO.split(",").map(v=>v.trim()),subject:"New dealership enquiry",text:`A new enquiry is waiting in your secure workspace.\n${origin.origin}/command/leads\nReference: ${row.lead_id}`}),signal:AbortSignal.timeout(10000),redirect:"error"});
      if(!response.ok)throw new Error("Provider rejected delivery");
      await tenantTransaction(pool,tenantId,c=>c.query("UPDATE notification_outbox SET sent_at=now(),last_error=NULL WHERE tenant_id=$1 AND id=$2 AND sent_at IS NULL",[tenantId,row.id])); sent++;
    } catch {
      await tenantTransaction(pool,tenantId,c=>c.query("UPDATE notification_outbox SET last_error='delivery_failed',available_at=now()+($3::int * interval '1 minute') WHERE tenant_id=$1 AND id=$2 AND sent_at IS NULL",[tenantId,row.id,Math.min(60,2**Number(row.attempts))]));
    }
  }
  return {claimed:rows.length,sent};
}
