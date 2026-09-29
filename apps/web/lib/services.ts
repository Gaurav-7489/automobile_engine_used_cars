import {
  analyticsRepository,
  leadRepository,
  tenantRepository,
  vehicleRepository,
} from "./repositories";

export const dealershipService = {
  async home() {
    const [tenant, vehicles, snapshot] = await Promise.all([
      tenantRepository.getActive(),
      vehicleRepository.listPublished(),
      analyticsRepository.getSnapshot(),
    ]);
    return {
      tenant,
      snapshot,
      featured: vehicles
        .filter((vehicle) => vehicle.availabilityStatus === "available")
        .slice(0, 6),
    };
  },
  async inventory() {
    return vehicleRepository.listPublished();
  },
  async vehicle(slug: string) {
    return vehicleRepository.findPublishedBySlug(slug);
  },
  async compare(ids: string[]) {
    return vehicleRepository.findByIds(ids);
  },
};

export const commandService = {
  async dashboard() {
    const [tenant, metrics, activity] = await Promise.all([
      tenantRepository.getActive(),
      analyticsRepository.getSnapshot(),
      leadRepository.listRecent(),
    ]);
    return { tenant, metrics, activity };
  },
};
