import Link from "next/link";
import { notFound } from "next/navigation";
import {
  activeDealership,
  analyticsSnapshot,
  appointments,
  leads as seededLeads,
  tasks,
  tenantConfig,
  vehicleById,
  vehicles,
} from "@vandlabs/demo-data";
import {
  mergeRuntimeLeads,
  mergeRuntimeTasks,
} from "@vandlabs/demo-data/runtime";
import { labelize, money, number, shortDateTime } from "../../lib/format";
import { TaskStatusButton } from "../../components/task-status-button";

export const dynamic = "force-dynamic";

const valid = new Set([
  "leads",
  "pipeline",
  "tasks",
  "appointments",
  "inventory",
  "customers",
  "analytics",
  "settings",
]);

const allLeads = () => mergeRuntimeLeads(seededLeads);

function Header({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="page-head">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="muted">{body}</p>
    </div>
  );
}

function LeadsSection() {
  const leads = allLeads();
  return (
    <>
      <Header
        eyebrow="CRM"
        title="Lead inbox"
        body="Every lead keeps vehicle, source, campaign, intent and human ownership context."
      />
      <section className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Vehicle</th>
                <th>Intent</th>
                <th>Source</th>
                <th>Owner</th>
                <th>Stage</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const vehicle = vehicleById(lead.vehicleId);
                return (
                  <tr key={lead.id}>
                    <td>
                      <Link href={"/leads/" + lead.id}>
                        <strong>{lead.name}</strong>
                        <small>{lead.phone}</small>
                      </Link>
                    </td>
                    <td>
                      {vehicle
                        ? vehicle.make + " " + vehicle.model
                        : "General"}
                    </td>
                    <td>{labelize(lead.intent)}</td>
                    <td>
                      {lead.source}
                      {lead.campaign ? <small>{lead.campaign}</small> : null}
                    </td>
                    <td>{lead.assignedTo ?? "Unassigned"}</td>
                    <td>
                      <span className={"stage " + lead.stage}>
                        {labelize(lead.stage)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function PipelineSection() {
  const leads = allLeads();
  const stages = [
    "new",
    "contacted",
    "qualified",
    "appointment",
    "visited",
    "test_drive",
    "negotiation",
    "won",
    "lost",
    "nurture",
  ] as const;

  return (
    <>
      <Header
        eyebrow="Sales pipeline"
        title="From enquiry to outcome"
        body="The V1 pipeline stays automotive-specific: New → Contacted → Qualified → Appointment → Visited → Test Drive → Negotiation → Won / Lost / Nurture."
      />
      <div className="pipeline-board">
        {stages.map((stage) => {
          const stageLeads = leads.filter((lead) => lead.stage === stage);
          return (
            <section className="pipeline-column" key={stage}>
              <div className="pipeline-head">
                <strong>{labelize(stage)}</strong>
                <span>{stageLeads.length}</span>
              </div>
              {stageLeads.map((lead) => {
                const vehicle = vehicleById(lead.vehicleId);
                return (
                  <Link
                    href={"/leads/" + lead.id}
                    className="pipeline-card"
                    key={lead.id}
                  >
                    <strong>{lead.name}</strong>
                    <span>
                      {vehicle
                        ? vehicle.make + " " + vehicle.model
                        : "General enquiry"}
                    </span>
                    <small>
                      {lead.assignedTo ?? "Unassigned"} · {lead.source}
                    </small>
                  </Link>
                );
              })}
            </section>
          );
        })}
      </div>
    </>
  );
}

function TasksSection() {
  const leads = allLeads();
  const allTasks = mergeRuntimeTasks(tasks);
  return (
    <>
      <Header
        eyebrow="Follow-up"
        title="Tasks & SLA work"
        body="A focused operating list for response, finance, negotiation and handover follow-up."
      />
      <section className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Lead</th>
                <th>Owner</th>
                <th>Due</th>
                <th>Priority</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {allTasks.map((task) => (
                <tr key={task.id}>
                  <td><strong>{task.title}</strong></td>
                  <td>{leads.find((lead) => lead.id === task.leadId)?.name}</td>
                  <td>{task.owner}</td>
                  <td>{shortDateTime(task.dueAt)}</td>
                  <td>
                    <span className={"priority " + task.priority}>
                      {task.priority}
                    </span>
                  </td>
                  <td>
                    <TaskStatusButton
                      taskId={task.id}
                      title={task.title}
                      completed={task.completed}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function AppointmentsSection() {
  const leads = allLeads();
  return (
    <>
      <Header
        eyebrow="Appointments"
        title="Visits & test drives"
        body="Customer, vehicle, studio and schedule remain connected in one workflow."
      />
      <div className="card-grid">
        {appointments.map((appointment) => {
          const lead = leads.find((item) => item.id === appointment.leadId);
          const vehicle = vehicleById(appointment.vehicleId);
          return (
            <article className="panel" key={appointment.id}>
              <span className="meta">{labelize(appointment.type)}</span>
              <h2>{shortDateTime(appointment.scheduledAt)}</h2>
              <p><strong>{lead?.name}</strong></p>
              <p className="muted">
                {vehicle?.make} {vehicle?.model}
              </p>
              <span className="stage appointment">{appointment.status}</span>
            </article>
          );
        })}
      </div>
    </>
  );
}

function InventorySection() {
  return (
    <>
      <Header
        eyebrow="Inventory Hub"
        title="Canonical vehicle operations"
        body="The staff surface reads the same identity, price, availability, location and publish state that power the public experience."
      />
      <section className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Stock</th>
                <th>Location</th>
                <th>Price</th>
                <th>Mileage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((vehicle) => (
                <tr key={vehicle.id}>
                  <td>
                    <strong>
                      {vehicle.make} {vehicle.model}
                    </strong>
                    <small>{vehicle.variant}</small>
                  </td>
                  <td>{vehicle.stockId}</td>
                  <td>
                    {
                      activeDealership.locations.find(
                        (location) => location.id === vehicle.locationId,
                      )?.city
                    }
                  </td>
                  <td>{money(vehicle.price)}</td>
                  <td>{number(vehicle.mileage)} km</td>
                  <td>
                    <span className={"stage " + vehicle.availabilityStatus}>
                      {vehicle.availabilityStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function CustomersSection() {
  const leads = allLeads();
  return (
    <>
      <Header
        eyebrow="Progressive identity"
        title="Known customers & leads"
        body="Anonymous visitor → lead → customer → optional account. V1 never forces signup for browsing or enquiry."
      />
      <div className="card-grid">
        {leads.map((lead) => (
          <Link
            href={"/leads/" + lead.id}
            className="panel customer-card"
            key={lead.id}
          >
            <p className="eyebrow">{lead.channel}</p>
            <h2>{lead.name}</h2>
            <p className="muted">{lead.phone}</p>
            <span className={"stage " + lead.stage}>
              {labelize(lead.stage)}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

function AnalyticsSection() {
  const leads = allLeads();
  const allTasks = mergeRuntimeTasks(tasks);
  const openTasks = allTasks.filter((task) => !task.completed);
  const overdueTasks = openTasks.filter((task) => new Date(task.dueAt).getTime() < Date.now());
  const leadsWithNextAction = new Set(openTasks.map((task) => task.leadId));
  const followUpCoverage = leads.length
    ? Math.round((leads.filter((lead) => leadsWithNextAction.has(lead.id)).length / leads.length) * 100)
    : 0;
  const runtimeCount = leads.filter(
    (lead) => !seededLeads.some((seeded) => seeded.id === lead.id),
  ).length;
  const sourceCounts = leads.reduce<Record<string, number>>((acc, lead) => {
    acc[lead.source] = (acc[lead.source] ?? 0) + 1;
    return acc;
  }, {});
  const maxSource = Math.max(1, ...Object.values(sourceCounts));
  const funnel = [
    ["New", leads.length],
    ["Contacted+", leads.filter((lead) => lead.stage !== "new").length],
    ["Qualified+", leads.filter((lead) => ["qualified", "appointment", "visited", "test_drive", "negotiation", "won"].includes(lead.stage)).length],
    ["Appointment+", leads.filter((lead) => ["appointment", "visited", "test_drive", "negotiation", "won"].includes(lead.stage)).length],
    ["Test drive+", leads.filter((lead) => ["test_drive", "negotiation", "won"].includes(lead.stage)).length],
    ["Won", leads.filter((lead) => lead.stage === "won").length],
  ] as const;
  const maxFunnel = Math.max(1, ...funnel.map(([, count]) => count));

  return (
    <>
      <Header
        eyebrow="Automotive Intelligence"
        title="Evidence, not invented certainty"
        body="Business, acquisition, vehicle-demand, funnel and operational signals use recorded reference data only."
      />
      <section className="metrics">
        <article className="metric-card">
          <span>Leads</span>
          <strong>{leads.length}</strong>
          <small>{runtimeCount} created during this local demo</small>
        </article>
        <article className="metric-card">
          <span>Qualified+</span>
          <strong>{leads.filter((lead) => ["qualified", "appointment", "visited", "test_drive", "negotiation", "won"].includes(lead.stage)).length}</strong>
          <small>current downstream evidence</small>
        </article>
        <article className="metric-card">
          <span>Negotiations</span>
          <strong>{leads.filter((lead) => lead.stage === "negotiation").length}</strong>
          <small>active records</small>
        </article>
        <article className="metric-card">
          <span>Wins</span>
          <strong>{leads.filter((lead) => lead.stage === "won").length}</strong>
          <small>recorded outcome only</small>
        </article>
      </section>

      <section className="metrics">
        <article className="metric-card">
          <span>Open follow-ups</span>
          <strong>{openTasks.length}</strong>
          <small>persisted tasks requiring action</small>
        </article>
        <article className="metric-card">
          <span>Overdue</span>
          <strong>{overdueTasks.length}</strong>
          <small>open tasks past their due time</small>
        </article>
        <article className="metric-card">
          <span>Next-action coverage</span>
          <strong>{followUpCoverage}%</strong>
          <small>leads with an open follow-up</small>
        </article>
        <article className="metric-card">
          <span>Runtime leads</span>
          <strong>{runtimeCount}</strong>
          <small>created during this local demo</small>
        </article>
      </section>

      <div className="detail-layout">
        <section className="panel">
          <p className="eyebrow">Sales funnel</p>
          <h2>Stage progression</h2>
          <div className="bars">
            {funnel.map(([label, count]) => (
              <div className="bar-row" key={label}>
                <span>{label}</span>
                <div><i style={{ width: (count / maxFunnel) * 100 + "%" }} /></div>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
          <p className="notice">
            Counts show recorded progression only. They are not predictive conversion rates.
          </p>
        </section>

        <section className="panel">
          <p className="eyebrow">Acquisition</p>
          <h2>Lead sources</h2>
          <div className="bars">
            {Object.entries(sourceCounts).map(([source, count]) => (
              <div className="bar-row" key={source}>
                <span>{source}</span>
                <div>
                  <i style={{ width: (count / maxSource) * 100 + "%" }} />
                </div>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <p className="eyebrow">Vehicle demand</p>
          <h2>Most active inventory</h2>
          <div className="stack-list">
            {analyticsSnapshot.vehicleDemand.map((item) => {
              const vehicle = vehicleById(item.vehicleId);
              return (
                <div className="list-row" key={item.vehicleId}>
                  <div>
                    <strong>
                      {vehicle?.make} {vehicle?.model}
                    </strong>
                    <span>{item.views} views</span>
                  </div>
                  <strong>{item.enquiries} enquiries</strong>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

function SettingsSection() {
  return (
    <>
      <Header
        eyebrow="Dealership configuration"
        title="Experience, scope & entitlements"
        body="Configuration changes the dealership experience without forking the shared platform."
      />
      <div className="detail-layout">
        <section className="panel">
          <p className="eyebrow">Tenant</p>
          <h2>{tenantConfig.organization.name}</h2>
          <dl className="key-values">
            <div><dt>Dealership</dt><dd>{activeDealership.name}</dd></div>
            <div><dt>Locations</dt><dd>{activeDealership.locations.length}</dd></div>
            <div><dt>Canonical demo domain</dt><dd>{tenantConfig.seo.canonicalBase}</dd></div>
          </dl>
        </section>
        <section className="panel">
          <p className="eyebrow">Entitlements</p>
          <h2>Enabled capabilities</h2>
          <div className="chip-list">
            {tenantConfig.entitlements.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <p className="notice">
            Feature flags control rollout. Entitlements control purchased or
            allowed access. They remain separate systems.
          </p>
        </section>
      </div>
    </>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!valid.has(section)) notFound();

  return (
    <main className="main">
      {section === "leads" ? <LeadsSection /> : null}
      {section === "pipeline" ? <PipelineSection /> : null}
      {section === "tasks" ? <TasksSection /> : null}
      {section === "appointments" ? <AppointmentsSection /> : null}
      {section === "inventory" ? <InventorySection /> : null}
      {section === "customers" ? <CustomersSection /> : null}
      {section === "analytics" ? <AnalyticsSection /> : null}
      {section === "settings" ? <SettingsSection /> : null}
    </main>
  );
}
