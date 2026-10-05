import type { VehicleRepository, TenantRepository, AnalyticsRepository } from "@vandlabs/contracts";
import { publicInventory, tenantConfig, metrics } from "@vandlabs/data";
export const vehicleRepository: VehicleRepository = {
  listPublished: publicInventory,
  async findPublishedBySlug(slug) { return (await publicInventory()).find(v=>v.slug===slug)??null; },
  async findByIds(ids) { return (await publicInventory()).filter(v=>ids.includes(v.id)); },
};
export const tenantRepository: TenantRepository = { async getActive(){ return tenantConfig; } };
export const analyticsRepository: AnalyticsRepository = { async getSnapshot(){
  return metrics({vehicles:await publicInventory(),leads:[],tasks:[],appointments:[],activities:[],events:[],rules:[],runs:[]});
} };
