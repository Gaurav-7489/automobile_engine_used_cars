import type { StockCost } from "@vandlabs/contracts";
type Input=Pick<StockCost,"acquiredOn"|"purchasePrice"|"reconditioningCost"|"transferCost"|"otherCost"|"dailyHoldingCost"|"reference">;
export function DesktopCostRecord({record,busy,onSave}:{record?:StockCost;busy:boolean;onSave:(input:Input)=>void}) {
  return <details><summary>{record?"Amend verified costs":"Record verified costs"}</summary><form key={record?.version??0} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);onSave({acquiredOn:String(f.get("acquiredOn")),purchasePrice:Number(f.get("purchasePrice")),reconditioningCost:Number(f.get("reconditioningCost")),transferCost:Number(f.get("transferCost")),otherCost:Number(f.get("otherCost")),dailyHoldingCost:f.get("dailyHoldingCost")===""?null:Number(f.get("dailyHoldingCost")),reference:String(f.get("reference"))});}}>
    <label>Acquired on<input name="acquiredOn" type="date" required defaultValue={record?.acquiredOn}/></label>
    {(["purchasePrice","reconditioningCost","transferCost","otherCost"] as const).map(k=><label key={k}>{k.replace(/([A-Z])/g," $1")} (INR)<input name={k} type="number" min={k==="purchasePrice"?0.01:0} step="0.01" required defaultValue={record?.[k]}/></label>)}
    <label>Daily holding assumption (optional)<input name="dailyHoldingCost" type="number" min="0" step="0.01" defaultValue={record?.dailyHoldingCost??undefined}/></label>
    <label>Invoice / internal reference<input name="reference" maxLength={120} required defaultValue={record?.reference}/></label>
    <label><input type="checkbox" required/> I verified these costs and am authorized to record them.</label><button disabled={busy}>Save verified costs</button>
  </form></details>;
}
