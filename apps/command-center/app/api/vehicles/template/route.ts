import { requireCapability } from "@vandlabs/contracts";
import { InputError } from "@vandlabs/data";
import { inventoryCsvTemplate, inventoryXlsxTemplate } from "@vandlabs/data/inventory-template";
import { resolvePrincipal } from "../../../../lib/auth";
import { api } from "../../../../lib/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(async () => {
    const principal = await resolvePrincipal(request); requireCapability(principal, "inventory:read");
    const format = new URL(request.url).searchParams.get("format") ?? "xlsx";
    if (format !== "csv" && format !== "xlsx") throw new InputError();
    return new Response(format === "csv" ? inventoryCsvTemplate() : new Uint8Array(inventoryXlsxTemplate()), { headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="vandlabs-inventory-template.${format}"`,
      "X-Content-Type-Options": "nosniff",
    } });
  });
}
