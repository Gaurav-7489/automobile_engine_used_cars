import { AppointmentForm, AppointmentStatus, SaleForm } from "../../../components/business-operations";
import Link from "next/link";
import { notFound } from "next/navigation";
import { commandData } from "../../../lib/data";
import { labelize, shortDateTime } from "../../../lib/format";
import { LeadOperations } from "../../../components/lead-operations";
import { FollowUpForm } from "../../../components/follow-up-form";
import { TaskStatusButton } from "../../../components/task-status-button";

export const dynamic = "force-dynamic";

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await commandData();
  const {appointments, vehicles} = data;
  const lead = data.leads.find((item) => item.id === id);
  if (!lead) notFound();

  const vehicle = vehicles.find(v=>v.id===lead.vehicleId);
  const leadTasks = data.tasks.filter((task) => task.leadId === lead.id);
  const leadAppointments = appointments.filter(
    (appointment) => appointment.leadId === lead.id,
  );
  const sale = data.sales?.find(s=>s.leadId===lead.id);
  const leadActivity = data.activities.filter(a=>a.leadId===lead.id);

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
        <section className="panel wide-panel">
          <p className="eyebrow">Lead operations</p>
          <h2>Move the opportunity forward</h2>
          <LeadOperations
            leadId={lead.id}
            initialStage={lead.stage}
            initialOwner={lead.assignedTo}
            initialNotes={lead.notes}
          />
        </section>

        <section className="panel wide-panel">
          <p className="eyebrow">Next action</p>
          <h2>Schedule follow-up</h2>
          <FollowUpForm leadId={lead.id} initialOwner={lead.assignedTo} />
        </section>

        <section className="panel wide-panel"><p className="eyebrow">Visits & test drives</p><h2>Schedule a confirmed visit</h2><AppointmentForm leadId={lead.id}/>{leadAppointments.map(a=><div className="list-row" key={a.id}><span>{labelize(a.type)} · {shortDateTime(a.scheduledAt)}</span><AppointmentStatus appointment={a}/></div>)}</section>
        {vehicle && data.capabilities?.includes("inventory:write") && data.capabilities?.includes("lead:write") ? <section className="panel wide-panel"><p className="eyebrow">Sales outcome</p><h2>Record a verified sale</h2><SaleForm leadId={lead.id} sale={sale}/></section> : null}
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
          <p className="eyebrow">Journey context</p>
          <h2>Attribution</h2>
          <dl className="key-values">
            <div><dt>First touch</dt><dd>{lead.journey?.firstTouch?.source ?? lead.source}</dd></div>
            <div><dt>Last touch</dt><dd>{lead.journey?.lastTouch?.source ?? lead.source}</dd></div>
            <div><dt>Campaign</dt><dd>{lead.campaign ?? "—"}</dd></div>
            <div><dt>Vehicle interests</dt><dd>{lead.journey?.vehicleInterestHistory.length ?? lead.vehicleIds.length}</dd></div>
          </dl>
        </section>

        <section className="panel">
          <p className="eyebrow">Tasks / appointments</p>
          <h2>Next action</h2>
          {leadTasks.length ? (
            <div className="stack-list">
              {leadTasks.map((task) => (
                <div className="list-row" key={task.id}>
                  <div><strong>{task.title}</strong><span>{task.owner}</span></div>
                  <div className="right">
                    <small>{shortDateTime(task.dueAt)}</small>
                    <TaskStatusButton
                      taskId={task.id}
                      title={task.title}
                      completed={task.completed}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : leadAppointments.length ? (
            <div className="stack-list">
              {leadAppointments.map((appointment) => (
                <div className="list-row" key={appointment.id}>
                  <div><strong>{labelize(appointment.type)}</strong><span>{appointment.status}</span></div>
                  <small>{shortDateTime(appointment.scheduledAt)}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No next action is seeded yet. Assign a human follow-up.</p>
          )}
        </section>

        <section className="panel wide-panel">
          <p className="eyebrow">Audit trail</p>
          <h2>Lead activity</h2>
          <div className="stack-list activity-list">
            {leadActivity.map((activity) => (
              <div className="list-row" key={activity.id}>
                <div>
                  <strong>{activity.description}</strong>
                  <span>{activity.actor}</span>
                </div>
                <small>{shortDateTime(activity.occurredAt)}</small>
              </div>
            ))}
            <div className="list-row">
              <div>
                <strong>Lead captured</strong>
                <span>{labelize(lead.channel)} · {lead.source}</span>
              </div>
              <small>{shortDateTime(lead.createdAt)}</small>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
