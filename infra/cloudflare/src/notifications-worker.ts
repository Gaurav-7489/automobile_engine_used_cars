import { Pool, neonConfig } from "@neondatabase/serverless";
import { dispatchNotifications } from "@vandlabs/data/notifications";
type Env = {DATABASE_URL:string;NOTIFICATION_TENANT_ID:string;RESEND_API_KEY:string;NOTIFICATION_FROM:string;NOTIFICATION_TO:string;APP_ORIGIN:string};
export default {
  async scheduled(_event:ScheduledController,env:Env) {
    const url=new URL(env.DATABASE_URL);
    if(!url.hostname.endsWith(".neon.tech") || !url.hostname.includes("-pooler.") || !/^[0-9a-f-]{36}$/i.test(env.NOTIFICATION_TENANT_ID))throw new Error("Configure a pooled Neon URL and tenant.");
    neonConfig.webSocketConstructor=WebSocket;
    const pool=new Pool({connectionString:env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000});
    try {const result=await dispatchNotifications(env.NOTIFICATION_TENANT_ID,{pool,env});console.log(JSON.stringify({event:"notification_dispatch",...result}));}
    catch {console.error(JSON.stringify({event:"notification_dispatch_failed"}));throw new Error("Notification dispatch failed");}
    finally {await pool.end();}
  },
} satisfies ExportedHandler<Env>;
