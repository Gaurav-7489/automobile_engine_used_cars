import type { Metadata } from "next";
import type { TenantConfig, Vehicle } from "@vandlabs/contracts";

// User-managed stock/branding must never terminate a JSON-LD script element.
export function serializeJsonLd(value:unknown) {
  return JSON.stringify(value).replace(/</g,"\\u003c");
}

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
    url: tenant.seo.canonicalBase.replace(/\/$/, "") + "/vehicles/" + vehicle.slug,
    image: vehicle.media.map(item=>item.url),
    brand: {"@type":"Brand", name:vehicle.make},
    model: vehicle.model,
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
          : vehicle.availabilityStatus === "sold" ? "https://schema.org/SoldOut" : "https://schema.org/LimitedAvailability",
      url: tenant.seo.canonicalBase + "/vehicles/" + vehicle.slug,
    },
  };
}

export function pageMetadata(title:string, description:string, path:string):Metadata {
  return {title,description,alternates:{canonical:path},openGraph:{title,description,url:path,type:"website",images:[{url:"/opengraph-image",width:1200,height:630,alt:title}]},twitter:{card:"summary_large_image",title,description,images:["/opengraph-image"]}};
}
