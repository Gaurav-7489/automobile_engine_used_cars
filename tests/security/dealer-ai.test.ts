import { test } from "node:test";
import assert from "node:assert/strict";
import { explainAcquisition } from "../../packages/data/src/dealer-ai";
import type { AcquisitionReport } from "../../packages/contracts/src/index";
const report: AcquisitionReport = { version:"v2",generatedAt:new Date().toISOString(),candidates:0,options:[],notices:[],demo:false };
test("optional AI never replaces deterministic recommendations when unavailable", async () => {
  const beforeURL = process.env.DEALER_AI_URL, beforeToken = process.env.DEALER_AI_SERVICE_TOKEN;
  try {
    delete process.env.DEALER_AI_URL; delete process.env.DEALER_AI_SERVICE_TOKEN;
    const result = await explainAcquisition(report);
    assert.equal(result.ai?.status, "not_configured"); assert.deepEqual(result.options, report.options);
    process.env.DEALER_AI_URL="https://example.test/explain";process.env.DEALER_AI_SERVICE_TOKEN="test";
    assert.equal((await explainAcquisition(report)).ai?.status,"unavailable");
  } finally { if(beforeURL===undefined)delete process.env.DEALER_AI_URL;else process.env.DEALER_AI_URL=beforeURL; if(beforeToken===undefined)delete process.env.DEALER_AI_SERVICE_TOKEN;else process.env.DEALER_AI_SERVICE_TOKEN=beforeToken; }
});
