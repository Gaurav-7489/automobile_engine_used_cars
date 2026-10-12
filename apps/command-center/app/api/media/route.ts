import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireCapability } from "@vandlabs/contracts";
import { api } from "@vandlabs/data/http";
import { resolvePrincipal } from "../../../lib/auth";
export async function POST(request:Request) {
  return api(async()=>{
    const principal=await resolvePrincipal(request);requireCapability(principal,"inventory:write");
    const type=request.headers.get("content-type");
    if(!["image/webp","image/avif"].includes(type ?? "") || !request.body)return Response.json({error:"Upload a compressed WebP or AVIF photograph."},{status:400});
    const reader=request.body.getReader(),chunks:Uint8Array[]=[];let length=0;
    try {while(true){const item=await reader.read();if(item.done)break;length+=item.value.length;if(length>4*1024*1024){await reader.cancel();return Response.json({error:"Maximum photo size is 4 MB."},{status:413});}chunks.push(item.value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const text=(start:number,end:number)=>new TextDecoder().decode(bytes.slice(start,end));
    const webp=text(0,4)==="RIFF"&&text(8,12)==="WEBP";
    const avif=text(4,8)==="ftyp"&&["avif","avis"].includes(text(8,12));
    if(!(type==="image/webp"?webp:avif))return Response.json({error:"Photo format does not match its content type."},{status:400});
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(principal.tenantId))return Response.json({error:"Production tenant required."},{status:503});
    const key=`${principal.tenantId}/${crypto.randomUUID()}.${webp?"webp":"avif"}`;
    const {env}=await getCloudflareContext({async:true});
    const bucket=(env as unknown as {VEHICLE_MEDIA:{put(key:string,value:Uint8Array,options:unknown):Promise<unknown>}}).VEHICLE_MEDIA;
    await bucket.put(key,bytes,{httpMetadata:{contentType:type,cacheControl:"public, max-age=31536000, immutable"}});
    return Response.json({url:`${new URL(process.env.APP_ORIGIN!).origin}/media/${key}`,key},{status:201});
  });
}
