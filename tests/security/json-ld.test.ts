import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeJsonLd, vehicleJsonLd } from "../../apps/web/lib/seo";
import { vehicles, tenantConfig } from "../../packages/demo-data/src/index";
test("user-managed vehicle and branding text cannot terminate JSON-LD scripts",()=> {
  const name='</script><script>alert("stock")</script>';
  const data=vehicleJsonLd({...vehicles[0],make:name},tenantConfig);
  const encoded=serializeJsonLd(data);
  assert.ok(!encoded.includes("<"));assert.ok(!encoded.includes("</script>"));assert.deepEqual(JSON.parse(encoded),data);
  assert.deepEqual(JSON.parse(serializeJsonLd({brand:name})),{brand:name});
});
