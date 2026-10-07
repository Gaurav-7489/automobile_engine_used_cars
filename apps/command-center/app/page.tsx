import Link from "next/link";
import { metrics } from "@vandlabs/data";
import { commandData } from "../lib/data";
import { shortDateTime } from "../lib/format";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await commandData();
  const {leads, appointments, vehicles} = data;
  const analyticsSnapshot = metrics(data);
  const vehicleById = (id?: string) => vehicles.find(v=>v.id===id);
  const openTasks = data.tasks.filter((task) => !task.completed);
  const todaysAppointments = appointments.filter(
    (appointment) => appointment.status === "scheduled",
  );
  const recentLeads = leads.slice(0, 5);

  return (
    <main className="main">
      <div className="topline">
        <div>
          <p className="eyebrow">Dealership Growth / Sales OS</p>
          <h1>Today, at a glance.</h1>
          <p className="muted">
            Kochi + Bengaluru · operational signals from the V1 reference
            dealership.
          </p>
        </div>
        <div className="scope-pill">Organization → Dealership → Location</div>
      </div>

      <section className="metrics" aria-label="Operational metrics">
        <article className="metric-card">
          <span>Open leads</span>
          <strong>{leads.filter((lead) => !["won", "lost"].includes(lead.stage)).length}</strong>
          <small>{leads.filter((lead) => lead.stage === "new").length} awaiting first contact</small>
        </article>
        <article className="metric-card">
          <span>Available cars</span>
          <strong>{analyticsSnapshot.available}</strong>
          <small>{analyticsSnapshot.reserved} reserved</small>
        </article>
        <article className="metric-card">
          <span>Scheduled</span>
          <strong>{analyticsSnapshot.appointments}</strong>
          <small>appointments / test drives</small>
        </article>
        <article className="metric-card">
          <span>Negotiations</span>
          <strong>{leads.filter((lead) => lead.stage === "negotiation").length}</strong>
          <small>{leads.filter((lead) => lead.stage === "won").length} recorded win</small>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Lead inbox</p>
              <h2>Needs attention</h2>
            </div>
            <Link href="/leads">Open all →</Link>
          </div>
          <div className="stack-list">
            {recentLeads.map((lead) => {
              const vehicle = vehicleById(lead.vehicleId);
              return (
                <Link className="list-row" key={lead.id} href={"/leads/" + lead.id}>
                  <div>
                    <strong>{lead.name}</strong>
                    <span>
                      {vehicle
                        ? vehicle.make + " " + vehicle.model
                        : "General enquiry"}
                    </span>
                  </div>
                  <div className="right">
                    <span className={"stage " + lead.stage}>{lead.stage}</span>
                    <small>{lead.source}</small>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Follow-up</p>
              <h2>Open tasks</h2>
            </div>
            <Link href="/tasks">View tasks →</Link>
          </div>
          <div className="stack-list">
            {openTasks.map((task) => (
              <div className="list-row" key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <span>{leads.find((lead) => lead.id === task.leadId)?.name}</span>
                </div>
                <div className="right">
                  <span>{task.owner}</span>
                  <small>{shortDateTime(task.dueAt)}</small>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel wide-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Appointments</p>
              <h2>Next on the floor</h2>
            </div>
            <Link href="/appointments">Calendar →</Link>
          </div>
          <div className="appointment-grid">
            {todaysAppointments.map((appointment) => {
              const lead = leads.find((item) => item.id === appointment.leadId);
              const vehicle = vehicleById(appointment.vehicleId);
              return (
                <article key={appointment.id}>
                  <span className="meta">{appointment.type.replace("_", " ")}</span>
                  <strong>{shortDateTime(appointment.scheduledAt)}</strong>
                  <p>{lead?.name}</p>
                  <small>
                    {vehicle?.make} {vehicle?.model}
                  </small>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
