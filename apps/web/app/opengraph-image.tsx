import { ImageResponse } from "next/og";
import { tenantConfig } from "../lib/config";
export const size={width:1200,height:630};
export const contentType="image/png";
export const alt="Used cars and dealership service";
export default function Image() {
  return new ImageResponse(<div style={{display:"flex",flexDirection:"column",justifyContent:"space-between",width:"100%",height:"100%",padding:80,background:"#0e1723",color:"#f5f1e8"}}><div style={{fontSize:32,color:"#cbd5e1"}}>{tenantConfig.brand.logoText}</div><div style={{fontSize:74,lineHeight:1.1,maxWidth:970}}>Find your next drive.</div><div style={{fontSize:28,color:"#cbd5e1"}}>Explore inventory · Compare cars · Request a test drive</div></div>,size);
}
