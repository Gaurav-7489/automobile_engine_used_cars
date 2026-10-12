import { takeBucket, validLimit, cleanMediaKey, surface } from "./admission-core";
type Env = { WEB: Fetcher; COMMAND: Fetcher; PLATFORM: Fetcher; ADMISSION: DurableObjectNamespace;
  VEHICLE_MEDIA: R2Bucket; PUBLIC_ORIGIN: string };
const json = (value: unknown, status = 200, retry = 1) => Response.json(value, {status, headers: {"Cache-Control":"no-store", "Retry-After":String(retry)}});

/** Binding-only durable admission coordinator. No public route exposes this object. */
export class Admission {
  constructor(private state: DurableObjectState) {}
  async fetch(request: Request) {
    const body = await request.json() as {op:string; scope?:string; limit?:number; windowMs?:number; lease?:string};
    const now = Date.now();
    return this.state.storage.transaction(async tx => {
      if(body.op === "rate") {
        if(!body.scope || !/^[a-zA-Z0-9:_-]{1,150}$/.test(body.scope) || !validLimit(body.limit, 1000) || !validLimit(body.windowMs, 3600000)) return json({error:"Invalid admission policy"},400);
        const key = `rate:${body.scope}`;
        const result = takeBucket(await tx.get(key), now, body.windowMs, body.limit);
        await tx.put(key, result.bucket);
        await tx.setAlarm(now + body.windowMs);
        return json({success: result.allowed, retryAfter:result.retryAfter});
      }
      const leases = await tx.get<Record<string,number>>("leases") ?? {};
      for(const [id, expires] of Object.entries(leases)) if(expires <= now) delete leases[id];
      if(body.op === "release" && body.lease) { delete leases[body.lease]; await tx.put("leases",leases); return json({success:true}); }
      if(body.op !== "acquire" || !validLimit(body.limit,100)) return json({error:"Invalid admission policy"},400);
      if(Object.keys(leases).length >= body.limit) return json({success:false},503,2);
      const lease = crypto.randomUUID(); leases[lease] = now + 60000;
      await tx.put("leases",leases); await tx.setAlarm(now + 60000);
      return json({success:true,lease});
    });
  }
  async alarm() {
    const now = Date.now(); let next = Infinity;
    await this.state.storage.transaction(async tx => {
      const buckets = await tx.list<{reset:number}>({prefix:"rate:"});
      for(const [key, bucket] of buckets) { if(bucket.reset <= now) await tx.delete(key); else next = Math.min(next,bucket.reset); }
      const leases = await tx.get<Record<string,number>>("leases") ?? {};
      for(const [id, expires] of Object.entries(leases)) { if(expires <= now) delete leases[id]; else next = Math.min(next,expires); }
      await tx.put("leases",leases);
      if(Number.isFinite(next)) await tx.setAlarm(next);
    });
  }
}
export default {
  async fetch(request: Request, env: Env, ctx:ExecutionContext): Promise<Response> {
    const started = Date.now(), requestId = crypto.randomUUID(), url = new URL(request.url);
    const origin = new URL(env.PUBLIC_ORIGIN);
    if(origin.protocol !== "https:") return json({error:"HTTPS origin required"},503);
    // Canonical authority comes from deployment configuration, never an input header.
    if(url.protocol !== "https:" || url.host !== origin.host) {url.protocol=origin.protocol;url.host=origin.host; return Response.redirect(url.toString(),308);}
    if(url.pathname.length > 1 && url.pathname.endsWith("/")) {url.pathname=url.pathname.replace(/\/+$/,"");return Response.redirect(url.toString(),308);}
    if(url.pathname.startsWith("/media/")) {
      if(!["GET","HEAD"].includes(request.method)) return json({error:"Method not allowed"},405);
      const key = cleanMediaKey(url.pathname.slice(6)); if(!key) return json({error:"Not found"},404);
      const cacheKey=new Request(origin.origin+"/media/"+key);
      const cached=await caches.default.match(cacheKey);
      if(cached) return request.method==="HEAD" ? new Response(null,{headers:cached.headers}) : cached;
      const object = await env.VEHICLE_MEDIA.get(key); if(!object) return json({error:"Not found"},404);
      const response = new Response(request.method === "HEAD" ? null : object.body,{headers:{"Content-Type":key.endsWith(".avif")?"image/avif":"image/webp","Cache-Control":"public, max-age=31536000, immutable","ETag":object.httpEtag,"X-Content-Type-Options":"nosniff","Strict-Transport-Security":"max-age=31536000; includeSubDomains"}});
      if(request.method==="GET")ctx.waitUntil(caches.default.put(cacheKey,response.clone()).catch(()=>undefined));
      return response;
    }
    const target = surface(url.pathname), dynamic = !url.pathname.includes("/_next/static/");
    let lease: string | undefined;
    const global = env.ADMISSION.get(env.ADMISSION.idFromName("global-database"));
    const call = (stub:DurableObjectStub, value:unknown) => stub.fetch("https://admission.internal",{method:"POST",body:JSON.stringify(value)});
    try {
      if(dynamic) {
        const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip)))).map(v=>v.toString(16).padStart(2,"0")).join("");
        const client = env.ADMISSION.get(env.ADMISSION.idFromName(hash));
        const rate = await (await call(client,{op:"rate",scope:"gateway",limit:120,windowMs:60000})).json() as {success:boolean;retryAfter:number};
        if(!rate.success) return json({error:"Too many requests"},429,rate.retryAfter);
        const response = await call(global,{op:"acquire",limit:24});
        const result = await response.json() as {success:boolean;lease?:string};
        if(!result.success) return json({error:"System busy. Retry shortly."},503,2);
        lease=result.lease;
      }
      const headers = new Headers(request.headers);
      // Strip caller-supplied proxy identity. The public limiter uses the real Cloudflare IP.
      headers.delete("x-forwarded-for"); headers.delete("x-forwarded-host"); headers.set("x-request-id",requestId);
      const controller = new AbortController(), timer=setTimeout(()=>controller.abort(),25000);
      let response:Response;
      try {response=await env[target].fetch(new Request(request,{headers,signal:controller.signal}));} finally {clearTimeout(timer);}
      const outgoing = new Headers(response.headers);
      outgoing.set("X-Request-ID",requestId); outgoing.set("Strict-Transport-Security","max-age=31536000; includeSubDomains");
      if(target !== "WEB" || url.pathname.startsWith("/api/") || headers.has("authorization") || headers.has("cookie") || outgoing.has("set-cookie")) outgoing.set("Cache-Control","private, no-store");
      const heldLease=lease;
      if(response.body && heldLease) {
        const reader=response.body.getReader(); lease=undefined;
        const release=()=>call(global,{op:"release",lease:heldLease}).catch(()=>undefined);
        const body=new ReadableStream({async pull(c) {try {const item=await reader.read(); if(item.done){c.close();await release();}else c.enqueue(item.value);} catch(e){c.error(e);await release();}},async cancel(reason){await reader.cancel(reason);await release();}});
        return new Response(body,{status:response.status,headers:outgoing});
      }
      return new Response(response.body,{status:response.status,headers:outgoing});
    } catch {
      console.error(JSON.stringify({event:"gateway_failure",requestId,surface:target,durationMs:Date.now()-started}));
      return json({error:"Service unavailable",requestId},503,5);
    } finally {if(lease)await call(global,{op:"release",lease}).catch(()=>undefined);}
  },
} satisfies ExportedHandler<Env>;
