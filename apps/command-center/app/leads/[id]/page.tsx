import Link from "next/link";
import { notFound } from "next/navigation";
import {
  appointments,
  leadById,
  tasks,
  vehicleById,
} from "@vandlabs/demo-data";
import { labelize, shortDateTime } from "../../../lib/format";

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = leadById(id);
  if (!lead) notFound();

  const vehicle = vehicleById(lead.vehicleId);
  const leadTasks = tasks.filter((task) => task.leadId === lead.id);
  const leadAppointments = appointments.filter(
    (appointment) => appointment.leadId === lead.id,
  );

  return (
    <main className="main">
      <Link className="back" href="/leads">
        ← Lead inbox
      </Link>
      <div className="lead-title">
        <div>
          <p className="eyebrow">Lead profile · {lead.id}</p>
          <h1>{lead.name}</h1>
          <p className="muted">
            {lead.phone}
            {lead.email ? " · " + lead.email : ""}
          </p>
        </div>
        <span className={"stage large " + lead.stage}>
          {labelize(lead.stage)}
        </span>
      </div>

      <div className="detail-layout">
        <section className="panel">
          <p className="eyebrow">Vehicle interest</p>
          <h2>{vehicle ? vehicle.make + " " + vehicle.model : "General enquiry"}</h2>
          <dl className="key-values">
            <div><dt>Intent</dt><dd>{labelize(lead.intent)}</dd></div>
            <div><dt>Channel</dt><dd>{labelize(lead.channel)}</dd></div>
            <div><dt>Source</dt><dd>{lead.source}</dd></div>
            <div><dt>Campaign</dt><dd>{lead.campaign ?? "—"}</dd></div>
            <div><dt>Assigned to</dt><dd>{lead.assignedTo ?? "Unassigned"}</dd></div>
            <div><dt>Created</dt><dd>{shortDateTime(lead.createdAt)}</dd></div>
          </dl>
          {vehicle ? (
            <div className="vehicle-context">
              <span>{vehicle.stockId}</span>
              <strong>{vehicle.variant}</strong>
              <small>{vehicle.availabilityStatus}</small>
            </div>
          ) : null}
        </section>

        <section className="panel">
          <p className="eyebrow">Permissions & handoff</p>
          <h2>Contact context</h2>
          <dl className="key-values">
            <div><dt>WhatsApp consent</dt><dd>{lead.consent.whatsapp ? "Yes" : "No"}</dd></div>
            <div><dt>Marketing consent</dt><dd>{lead.consent.marketing ? "Yes" : "No"}</dd></div>
            <div><dt>Human owner</dt><dd>{lead.assignedTo ?? "Assign salesperson"}</dd></div>
          </dl>
          <p className="notice">
            AI or automation may summarize and assist later, but the buyer always
            keeps a direct path to a salesperson.
          </p>
        </section>

        <section className="panel">
          <p className="eyebrow">Tasks</p>
          <h2>Follow-up</h2>
          {leadTasks.length ? (
            <div className="stack-list">
              {leadTasks.map((task) => (
                <div className="list-row" key={task.id}>
                  <div>
                    <strong>{task.title}</strong>
                    <span>{task.owner}</span>
                  </div>
                  <small>{shortDateTime(task.dueAt)}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No open task in the seeded demo.</p>
          )}
        </section>

        <section className="panel">
          <p className="eyebrow">Appointments</p>
          <h2>Visit / test drive</h2>
          {leadAppointments.length ? (
            <div className="stack-list">
              {leadAppointments.map((appointment) => (
                <div className="list-row" key={appointment.id}>
                  <div>
                    <strong>{labelize(appointment.type)}</strong>
                    <span>{appointment.status}</span>
                  </div>
                  <small>{shortDateTime(appointment.scheduledAt)}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No appointment scheduled.</p>
          )}
        </section>
      </div>
    </main>
  );
}
