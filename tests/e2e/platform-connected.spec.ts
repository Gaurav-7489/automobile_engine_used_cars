import {test,expect} from "@playwright/test";
const platform="http://127.0.0.1:3002/platform";
test("public enquiry changes the same lead count in Command Center and Platform",async({request})=>{
  const before=await request.get(platform+"/api/snapshot");expect(before.status()).toBe(200);
  const initial=(await before.json()).data[0].counts.leads;
  const response=await request.post("/api/leads",{data:{name:"Three surface buyer",phone:"9000000101",intent:"enquiry",vehicleId:"veh-3"}});
  expect(response.status()).toBe(201);const {leadId}=await response.json();
  const command=await request.get("http://127.0.0.1:3001/command/api/snapshot");
  expect((await command.json()).data.leads.some((l:{id:string})=>l.id===leadId)).toBe(true);
  const after=await request.get(platform+"/api/snapshot");expect((await after.json()).data[0].counts.leads).toBe(initial+1);
});
test("platform staff grants persist, reject stale writes and appear in the audit screen",async({request,page},testInfo)=>{
  const member={userId:"staff-"+testInfo.project.name,displayName:"Pilot Staff "+testInfo.project.name,role:"sales",dealershipIds:["dealer-select"],locationIds:["loc-kochi"],enabled:true};
  const create=await request.post(platform+"/api/staff",{data:{tenantId:"tenant-apex",member,expectedVersion:0}});expect(create.status()).toBe(200);
  const grant=(await create.json()).data;expect(grant.version).toBe(1);
  const stale=await request.post(platform+"/api/staff",{data:{tenantId:"tenant-apex",member:{...member,enabled:false},expectedVersion:0}});expect(stale.status()).toBe(409);
  const denied=await request.post(platform+"/api/staff",{data:{tenantId:"other-tenant",member,expectedVersion:0}});expect(denied.status()).toBe(403);
  await page.goto(platform+"/staff");await expect(page.getByText(member.displayName,{exact:true})).toBeVisible();
  const disable=await request.post(platform+"/api/staff",{data:{tenantId:"tenant-apex",member:{...member,enabled:false},expectedVersion:1}});expect(disable.status()).toBe(200);
  await page.goto(platform+"/audit");await expect(page.getByText("staff.disable",{exact:true}).first()).toBeVisible();
  const readiness=await request.get(platform+"/api/readiness");expect(readiness.status()).toBe(503);expect((await readiness.json()).database.ready).toBe(false);
});
test("staff access form saves and disables a persistent grant",async({request,page},testInfo)=>{
  const userId="form-staff-"+testInfo.project.name;
  await page.goto(platform+"/staff");
  await page.getByLabel("Cognito subject ID").fill(userId);
  await page.getByLabel("Staff name").fill("Form staff "+testInfo.project.name);
  await page.getByLabel("Role",{exact:true}).selectOption("viewer");
  await page.getByRole("group",{name:"Dealership access"}).getByRole("checkbox").first().check();
  await page.getByRole("group",{name:"Location access"}).getByRole("checkbox").first().check();
  await page.getByRole("button",{name:"Save staff access"}).click();
  await expect(page.getByRole("status")).toContainText("Staff access saved");
  await page.getByLabel("Access enabled").uncheck();
  await page.getByRole("button",{name:"Save staff access"}).click();
  await expect.poll(async()=>{
    const snapshot=await request.get(platform+"/api/snapshot");
    return (await snapshot.json()).data[0].staff.find((m:{userId:string})=>m.userId===userId)?.enabled;
  }).toBe(false);
  await page.reload();
  await expect(page.getByText("viewer · disabled · version 2",{exact:true})).toBeVisible();
});
