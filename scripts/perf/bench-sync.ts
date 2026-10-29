import { tenantTx } from "../../apps/intelligence/lib/server/db";
import { resetReadModel, syncReadModel } from "../../apps/intelligence/lib/server/read-model";

/** Times the read-model rebuild (first run) and the no-change freshness check (steady state). */
const tenantId = process.argv[2];
if (!tenantId) throw new Error("usage: bench-sync.ts <tenantId>");
await tenantTx(tenantId, (c) => resetReadModel(c, tenantId));
let t = performance.now();
const rebuilt = await tenantTx(tenantId, (c) => syncReadModel(c, tenantId, { force: true }));
const full = performance.now() - t;
const steady: number[] = [];
for (let i = 0; i < 5; i++) { t = performance.now(); await tenantTx(tenantId, (c) => syncReadModel(c, tenantId, { force: true })); steady.push(performance.now() - t); }
steady.sort((a, b) => a - b);
console.log(JSON.stringify({ tenantId, rowsRebuilt: rebuilt, fullRebuildMs: Math.round(full), steadyCheckMsMedian: Math.round(steady[2]) }));
process.exit(0);
