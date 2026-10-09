import type {TenantConfig} from "@vandlabs/contracts";
import {InputError} from "./errors";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(v:unknown):Record<string,unknown> {if(!v||typeof v!=="object"||Array.isArray(v))throw new InputError("Invalid dealership configuration.");return v as Record<string,unknown>;}
function text(v:unknown,max=500):v is string {return typeof v==="string"&&v.trim().length>0&&v.length<=max;}
function id(v:unknown):v is string {return typeof v==="string"&&uuid.test(v);}
export function productionTenantConfig(value:unknown):TenantConfig {
  const c=object(value),org=object(c.organization),brand=object(c.brand),theme=object(brand.theme),typography=object(brand.typography),contact=object(c.contact),seo=object(c.seo),experience=object(c.experience);
  if(!id(c.tenantId)||!id(c.activeDealershipId)||!id(org.id)||!text(org.name)||!Array.isArray(org.dealerships)||!org.dealerships.length||org.dealerships.length>100)throw new InputError("Invalid dealership configuration.");
  const seen=new Set<string>([org.id]);let active=false;
  for(const item of org.dealerships){const d=object(item);
    if(!id(d.id)||seen.has(d.id)||d.organizationId!==org.id||!text(d.name)||!text(d.brandName)||!Array.isArray(d.locations)||!d.locations.length||d.locations.length>100)throw new InputError("Invalid dealership hierarchy.");
    seen.add(d.id);if(d.id===c.activeDealershipId)active=true;
    for(const item of d.locations){const l=object(item);if(!id(l.id)||seen.has(l.id)||![l.name,l.city,l.state,l.phone].every(v=>text(v)))throw new InputError("Invalid dealership location.");seen.add(l.id);}
  }
  if(!active||![brand.logoText,brand.tagline,typography.heading,typography.body,contact.phone,contact.email,contact.whatsapp,seo.title,seo.description].every(v=>text(v))||!Object.values(theme).every(v=>text(v,100))||!["background","surface","foreground","muted","accent"].every(k=>text(theme[k],100)))throw new InputError("Invalid dealership brand/contact configuration.");
  let canonical:URL;try{canonical=new URL(String(seo.canonicalBase));}catch{throw new InputError("Invalid canonical origin.");}
  if(canonical.protocol!=="https:"||canonical.username||canonical.password||canonical.pathname!=="/"||canonical.search||canonical.hash)throw new InputError("Canonical base must be a secure origin.");
  if(!Array.isArray(c.entitlements)||c.entitlements.length>100||!c.entitlements.every(v=>text(v,100))||![experience.showCompare,experience.showFinance,experience.showExchange].every(v=>typeof v==="boolean")||!Array.isArray(c.navigation)||c.navigation.length>30||!c.navigation.every(v=>{const n=object(v);return text(n.label,100)&&typeof n.href==="string"&&n.href.startsWith("/")&&!n.href.startsWith("//")&&!/[\\\u0000-\u0020]/.test(n.href);}))throw new InputError("Invalid dealership experience configuration.");
  return structuredClone(c) as unknown as TenantConfig;
}
