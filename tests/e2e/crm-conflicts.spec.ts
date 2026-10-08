import {test,expect} from "@playwright/test";
const api="http://127.0.0.1:3001/command/api";
test("two staff screens cannot overwrite newer notes; follow-up versions reject stale actions",async({page,request})=> {
 const response=await request.post("/api/leads",{data:{name:"Two-editor buyer",phone:"123",whatsappConsent:false,marketingConsent:false}});expect(response.status()).toBe(201);const {leadId}=await response.json();
 await page.goto(`http://127.0.0.1:3001/command/leads/${leadId}`);
 const other=await page.context().newPage();await other.goto(`http://127.0.0.1:3001/command/leads/${leadId}`);
 await other.getByLabel("Internal note").fill("New verified note");await other.getByRole("button",{name:"Save changes",exact:true}).click();await expect(other.getByRole("status",{name:"Lead update status"})).toHaveText("Saved");
 await page.getByLabel("Internal note").fill("Older screen draft");await page.getByRole("button",{name:"Save changes",exact:true}).click();
 await expect(page.getByRole("status",{name:"Lead update status"})).toHaveText("This lead changed. Reload and review before saving.");await expect(page.getByRole("button",{name:"Save changes",exact:true})).toBeDisabled();
 const snapshot=(await (await request.get(`${api}/snapshot`)).json()).data;expect(snapshot.leads.find((l:{id:string})=>l.id===leadId).notes).toBe("New verified note");
 expect((await request.patch(`${api}/leads/${leadId}`,{data:{notes:"Missing version"}})).status()).toBe(400);
 await page.getByRole("button",{name:"Reload current lead",exact:true}).click();await expect(page.getByLabel("Internal note")).toHaveValue("New verified note");
 const task=snapshot.tasks.find((t:{leadId:string})=>t.leadId===leadId);expect(task).toBeTruthy();
 expect((await request.patch(`${api}/tasks/${task.id}`,{data:{completed:true,expectedVersion:task.version??0}})).status()).toBe(200);
 expect((await request.patch(`${api}/tasks/${task.id}`,{data:{completed:false,expectedVersion:task.version??0}})).status()).toBe(409);
 expect((await request.patch(`${api}/tasks/${task.id}`,{data:{completed:false}})).status()).toBe(400);
 await other.close();
});
