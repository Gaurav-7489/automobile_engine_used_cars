import type { TenantConfig, Vehicle } from "@vandlabs/contracts";

export function dealershipJsonLd(tenant: TenantConfig) {
  const dealership = tenant.organization.dealerships.find(
    (item) => item.id === tenant.activeDealershipId,
  );
  return {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    name: dealership?.name ?? tenant.brand.logoText,
    url: tenant.seo.canonicalBase,
    telephone: tenant.contact.phone,
    email: tenant.contact.email,
    areaServed: dealership?.locations.map((location) => location.city),
  };
}

export function vehicleJsonLd(vehicle: Vehicle, tenant: TenantConfig) {
  return {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    name:
      vehicle.year +
      " " +
      vehicle.make +
      " " +
      vehicle.model +
      " " +
      vehicle.variant,
    vehicleModelDate: String(vehicle.year),
    mileageFromOdometer: {
      "@type": "QuantitativeValue",
      value: vehicle.mileage,
      unitCode: "KMT",
    },
    fuelType: vehicle.fuelType,
    vehicleTransmission: vehicle.transmission,
    color: vehicle.exteriorColor,
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: vehicle.price,
      availability:
        vehicle.availabilityStatus === "available"
          ? "https://schema.org/InStock"
          : "https://schema.org/LimitedAvailability",
      url: tenant.seo.canonicalBase + "/vehicles/" + vehicle.slug,
    },
  };
}
