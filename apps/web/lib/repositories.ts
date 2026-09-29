import type {
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

const createdLeads: Lead[] = [];

export const vehicleRepository: VehicleRepository = {
  async listPublished() {
    return vehicles.filter((vehicle) => vehicle.publishStatus === "published");
  },
  async findPublishedBySlug(slug) {
    return (
      vehicles.find(
        (vehicle) => vehicle.slug === slug && vehicle.publishStatus === "published",
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
    return [...createdLeads, ...leads].slice(0, 20);
  },
  async findById(id) {
    return [...createdLeads, ...leads].find((lead) => lead.id === id) ?? null;
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
    createdLeads.unshift(lead);
    return lead;
  },
};

export const analyticsRepository: AnalyticsRepository = {
  async getSnapshot() {
    return {
      ...analyticsSnapshot,
      leads: analyticsSnapshot.leads + createdLeads.length,
      uncontacted: analyticsSnapshot.uncontacted + createdLeads.length,
    };
  },
};
