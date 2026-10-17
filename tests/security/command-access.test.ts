import { test } from "node:test";
import assert from "node:assert/strict";
import { commandCapabilities, commandNavigation, commandLanding, requireCommandPage, staffPrincipal, AuthorizationError, type StaffRole } from "../../packages/contracts/src/index";
const principal = (role: StaffRole) => staffPrincipal({userId:"staff",tenantId:"tenant",dealershipIds:["dealer"],locationIds:["location"],displayName:"Staff",enabled:true,role,version:1,updatedAt:"2026-10-15T00:00:00Z",updatedBy:"admin"});
test("acquisition and marketing roles have bounded capabilities and meaningful landing pages", () => {
  const acquisition = principal("acquisition"), marketing = principal("marketing");
  for (const p of [acquisition,marketing]) {
    assert.ok(!p.capabilities.includes("lead:read")); assert.ok(!p.capabilities.includes("commerce:manage"));
    assert.ok(!p.capabilities.includes("capital:write")); assert.ok(!p.capabilities.includes("platform:admin"));
    requireCommandPage(p,"/command/market"); requireCommandPage(p,"/command/inventory");
    for (const path of ["/command/leads", "/command/customers", "/command/tasks", "/command/analytics", "/command/developer", "/command/subscriptions", "/command/capital"]) assert.throws(() => requireCommandPage(p,path),AuthorizationError,path);
  }
  requireCommandPage(acquisition,"/command/acquisition");
  assert.throws(() => requireCommandPage(marketing,"/command/acquisition"),AuthorizationError);
  assert.equal(commandLanding(acquisition),"/command/acquisition"); assert.equal(commandLanding(marketing),"/command/market");
  assert.equal(commandLanding(principal("owner")),"/command");
});
test("menu visibility and page policy agree, including nested and encoded paths", () => {
  for (const role of ["owner","manager","sales","viewer","acquisition","marketing"] as const) {
    const p = principal(role);
    for (const [,path] of commandNavigation(p)) requireCommandPage(p,path);
  }
  const marketing = principal("marketing");
  assert.ok(!commandNavigation(marketing).some(([name]) => name === "Leads" || name === "Acquisition"));
  assert.throws(() => requireCommandPage(marketing,"/command/%6ceads/lead-1"),AuthorizationError);
  assert.throws(() => commandCapabilities("/%broken"),AuthorizationError);
  assert.deepEqual(commandCapabilities("/command/market"),["inventory:read","analytics:read","analytics:read"]);
  const sales = principal("sales"); assert.equal(sales.assignedLeadOnly,true);
  assert.ok(!commandNavigation(sales).some(([name]) => name === "Capital" || name === "Business API"));
});

test("unmapped command paths fail closed for roles without CRM access", () => {
  for (const role of ["acquisition","marketing"] as const) {
    const p = principal(role);
    for (const path of ["/command/unlisted", "/command//leads", "/command/Leads", "/command/leads%2f..%2fmarket"]) assert.throws(() => requireCommandPage(p,path),AuthorizationError,`${role} ${path}`);
  }
  requireCommandPage(principal("owner"),"/command/unlisted");
  assert.deepEqual(commandCapabilities("/command"),["inventory:read","analytics:read"]);
});
