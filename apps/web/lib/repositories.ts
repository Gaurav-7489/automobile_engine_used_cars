import { cache } from "react";
import type { VehicleRepository, TenantRepository, AnalyticsRepository } from "@vandlabs/contracts";
import { publicInventory, tenantConfig, metrics } from "@vandlabs/data";
const inventoryForRequest = cache(publicInventory);
export const vehicleRepository: VehicleRepository = {
  listPublished: inventoryForRequest,
  async findPublishedBySlug(slug) { return (await inventoryForRequest()).find(v=>v.slug===slug)??null; },
  async findByIds(ids) { return (await inventoryForRequest()).filter(v=>ids.includes(v.id)); },
};
export const tenantRepository: TenantRepository = { async getActive(){ return tenantConfig; } };
export const analyticsRepository: AnalyticsRepository = { async getSnapshot(){
  return metrics({vehicles:await inventoryForRequest(),leads:[],tasks:[],appointments:[],activities:[],events:[],rules:[],runs:[]});
} };
