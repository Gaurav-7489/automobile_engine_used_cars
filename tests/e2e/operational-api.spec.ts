import { test, expect } from "@playwright/test";

test("demo staff API keeps lead and follow-up operations working", async ({ request }) => {
  const created = await request.post("/api/leads", {
    data: { name: "Staff API Regression", phone: "+91 90000 00005", intent: "enquiry",
      vehicleId: "veh-1", whatsappConsent: true, marketingConsent: false },
  });
  expect(created.status()).toBe(201);
  const { leadId } = await created.json();
  const command = "http://127.0.0.1:3001/command/api";
  const updated = await request.patch(`${command}/leads/${leadId}`, { data: { stage: "contacted", notes: "Contact confirmed" } });
  expect(updated.status()).toBe(200);
  expect((await updated.json()).activity[0].actor).toBe("demo-staff");
  const scheduled = await request.post(`${command}/leads/${leadId}/tasks`, {
    data: { title: "Call buyer", owner: "Maya", dueAt: "2030-01-15T10:30:00Z", priority: "normal" },
  });
  expect(scheduled.status()).toBe(201);
  const { data: task } = await scheduled.json();
  for (const completed of [true, false]) {
    const result = await request.patch(`${command}/tasks/${task.id}`, { data: { completed } });
    expect(result.status()).toBe(200);
    const body = await result.json();
    expect(body.data.completed).toBe(completed);
    expect(body.activity.actor).toBe("demo-staff");
  }
});
