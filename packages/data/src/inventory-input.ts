import type { Vehicle } from "@vandlabs/contracts";
import { InventoryValidationError } from "./errors";

export const inventoryColumns = ["stockId","make","model","variant","year","price","mileage","fuelType","transmission","ownership","bodyType","condition","exteriorColor","interiorColor","imageUrl","financeEligible","exchangeEligible"] as const;
export type InventoryDraft = Omit<Vehicle,"id"|"slug"|"tenantId"|"dealershipId"|"locationId"|"createdAt"|"updatedAt">;
function issue(row:number,field:string,message:string):never {throw new InventoryValidationError([{row,field,message}]);}

// RFC-style quoted fields, CRLF, escaped quotes and embedded newlines. No formulas are evaluated.
export function parseInventoryCsv(text:unknown):Record<string,string>[] {
  if(typeof text!=="string"||Buffer.byteLength(text,"utf8")>250000)issue(1,"file","Choose a CSV up to 250 KB.");
  const rows:string[][]=[];let row:string[]=[],field="",quoted=false,closed=false;
  const input=(text as string).replace(/^\uFEFF/,"");
  for(let i=0;i<input.length;i++) {
    const c=input[i];
    if(quoted) {if(c==='"'){if(input[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
    if(c==='"') {if(field||closed)issue(rows.length+1,"file","Unexpected quote.");quoted=true;continue;}
    if(c===","||c==="\n"||c==="\r") {
      row.push(field);field="";closed=false;
      if(c!==","){if(c==="\r"&&input[i+1]==="\n")i++;rows.push(row);row=[];}
      if(rows.length>201||row.length>inventoryColumns.length)issue(rows.length+1,"file","Maximum 200 vehicles and the template columns.");
    } else {if(closed)issue(rows.length+1,"file","Unexpected text after a quoted field.");field+=c;}
  }
  if(quoted)issue(rows.length+1,"file","Unclosed quoted field.");
  if(field||row.length||closed){row.push(field);rows.push(row);}
  while(rows.length&&rows.at(-1)?.every(c=>!c.trim()))rows.pop();
  const header=rows.shift()?.map(c=>c.trim())??[];
  if(!header.length||new Set(header).size!==header.length||header.some(c=>!inventoryColumns.includes(c as typeof inventoryColumns[number])))issue(1,"file","Use unique column names from the CSV template.");
  const required=inventoryColumns.slice(0,14);
  if(required.some(c=>!header.includes(c)))issue(1,"file","Missing required template columns.");
  if(!rows.length||rows.length>200)issue(1,"file","Provide 1–200 vehicles.");
  return rows.map((r,i)=>{if(r.length!==header.length)issue(i+2,"file","Column count does not match header.");return Object.fromEntries(header.map((h,j)=>[h,r[j]]));});
}

export function normalizeInventoryRows(input:unknown,csv=false):InventoryDraft[] {
  if(!Array.isArray(input)||!input.length||input.length>200)issue(1,"file","Provide 1–200 vehicles.");
  const issues:InventoryValidationError["issues"]=[];const drafts:InventoryDraft[]=[];const stockIds=new Set<string>();
  input.forEach((value,i)=> {
    const row=i+(csv?2:1);
    try {
      if(!value||typeof value!=="object"||Array.isArray(value))issue(row,"vehicle","Expected a vehicle record.");
      const v=value as Record<string,unknown>;
      if(Object.keys(v).some(k=>!inventoryColumns.includes(k as typeof inventoryColumns[number])))issue(row,"vehicle","Unknown or protected vehicle field.");
      const str=(k:string,max=120)=>{if(typeof v[k]!=="string"||!(v[k] as string).trim()||(v[k] as string).length>max)issue(row,k,"Required text is missing or too long.");return (v[k] as string).trim();};
      const num=(k:string,min:number,max:number,integer=false)=>{const raw=v[k];if(typeof raw!=="number"&&(!csv||typeof raw!=="string"||!raw.trim()))issue(row,k,"Enter a valid number.");const n=Number(raw);if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))issue(row,k,"Number is outside the accepted range.");return n;};
      const choice=<T extends string>(k:string,options:readonly T[]):T=>{const s=str(k).toLowerCase();if(!options.includes(s as T))issue(row,k,`Choose ${options.join(", ")}.`);return s as T;};
      const bool=(k:string)=>{if(v[k]===undefined||v[k]==="")return false;if(v[k]===true||v[k]===false)return v[k] as boolean;if(csv&&(v[k]==="true"||v[k]==="false"))return v[k]==="true";return issue(row,k,"Use true or false.");};
      const stockId=str("stockId",64).toUpperCase();if(!/^[A-Z0-9][A-Z0-9_-]*$/.test(stockId))issue(row,"stockId","Use letters, digits, hyphens or underscores.");
      if(stockIds.has(stockId))issue(row,"stockId","Duplicate stock identity in this batch.");
      const price=num("price",0.01,999999999999);if(Math.abs(price*100-Math.round(price*100))>0.001)issue(row,"price","Use at most two decimal places.");
      const imageUrl=v.imageUrl===undefined||v.imageUrl===""?undefined:str("imageUrl",2048);
      if(imageUrl){let url:URL;try{url=new URL(imageUrl);}catch{return issue(row,"imageUrl","Use a public HTTPS image URL.");}if(url.protocol!=="https:"||url.username||url.password||!url.hostname.includes(".")||url.hostname.includes(":")||/^[0-9.]+$/.test(url.hostname)||[".local",".localhost",".internal"].some(s=>url.hostname.endsWith(s))||[...url.searchParams.keys()].some(k=>/token|secret|password|credential|signature|api.?key|authorization/i.test(k)))issue(row,"imageUrl","Use a public HTTPS image URL without credentials or secret query parameters.");}
      const make=str("make"),model=str("model");
      drafts.push({stockId,make,model,variant:str("variant"),year:num("year",1900,new Date().getUTCFullYear()+1,true),price,mileage:num("mileage",0,2000000,true),fuelType:choice("fuelType",["petrol","diesel","hybrid","electric"]),transmission:choice("transmission",["manual","automatic"]),ownership:num("ownership",1,20,true),bodyType:str("bodyType"),condition:choice("condition",["excellent","good","fair"]),exteriorColor:str("exteriorColor"),interiorColor:str("interiorColor"),features:[],specifications:{},media:imageUrl?[{url:imageUrl,alt:`${make} ${model} · ${stockId}`}]:[],availabilityStatus:"available",publishStatus:"draft",source:csv?"csv":"manual",financeEligible:bool("financeEligible"),exchangeEligible:bool("exchangeEligible")});
      stockIds.add(stockId);
    }catch(e){if(e instanceof InventoryValidationError)issues.push(...e.issues);else throw e;}
  });
  if(issues.length)throw new InventoryValidationError(issues);
  return drafts;
}
