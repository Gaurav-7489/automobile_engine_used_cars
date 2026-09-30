import type {
  AnalyticsSnapshot,
  AnalyticsRepository,
  Lead,
  LeadRepository,
  TenantRepository,
  VehicleRepository,
} from "@vandlabs/contracts";
import {
  analyticsSnapshot,
  leads,
  tenantConfig,
  vehicles,
} from "@vandlabs/demo-data";
import {
  mergeRuntimeLeads,
  persistRuntimeLead,
} from "@vandlabs/demo-data/runtime";

const allLeads = () => mergeRuntimeLeads(leads);

export const vehicleRepository: VehicleRepository = {
  async listPublished() {
    return vehicles.filter((vehicle) => vehicle.publishStatus === "published");
  },
  async findPublishedBySlug(slug) {
    return (
      vehicles.find(
        (vehicle) =>
          vehicle.slug === slug && vehicle.publishStatus === "published",
      ) ?? null
    );
  },
  async findByIds(ids) {
    return vehicles.filter((vehicle) => ids.includes(vehicle.id));
  },
};

export const tenantRepository: TenantRepository = {
  async getActive() {
    return tenantConfig;
  },
};

export const leadRepository: LeadRepository = {
  async listRecent() {
    return allLeads().slice(0, 20);
  },
  async findById(id) {
    return allLeads().find((lead) => lead.id === id) ?? null;
  },
  async create(input) {
    const timestamp = new Date().toISOString();
    const lead: Lead = {
      ...input,
      id: "lead-demo-" + Date.now(),
      stage: "new",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    persistRuntimeLead(lead);
    return lead;
  },
};

export const analyticsRepository: AnalyticsRepository = {
  async getSnapshot() {
    const currentLeads = allLeads();
    const stageCounts = currentLeads.reduce<AnalyticsSnapshot["stageCounts"]>(
      (counts, lead) => {
        counts[lead.stage] = (counts[lead.stage] ?? 0) + 1;
        return counts;
      },
      {},
    );
    const sourceCounts = currentLeads.reduce<Record<string, number>>(
      (counts, lead) => {
        counts[lead.source] = (counts[lead.source] ?? 0) + 1;
        return counts;
      },
      {},
    );

    return {
      ...analyticsSnapshot,
      leads: currentLeads.length,
      uncontacted: currentLeads.filter((lead) => lead.stage === "new").length,
      qualified: currentLeads.filter((lead) =>
        ["qualified", "appointment", "visited", "test_drive", "negotiation", "won"].includes(lead.stage),
      ).length,
      testDrives: currentLeads.filter((lead) =>
        ["test_drive", "negotiation", "won"].includes(lead.stage),
      ).length,
      negotiations: currentLeads.filter((lead) => lead.stage === "negotiation").length,
      wins: currentLeads.filter((lead) => lead.stage === "won").length,
      stageCounts,
      sourceCounts,
    };
  },
};
