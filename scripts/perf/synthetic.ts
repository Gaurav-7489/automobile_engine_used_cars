import type { SqlClient } from "../../packages/data/src/postgres";

/** SYNTHETIC rows for isolated test databases only (see seed-synthetic.ts, which refuses non-local connections). */
export async function seedSynthetic(client: SqlClient, tenantId: string, ids: { dealership_id: string; locs: string[] }, { vehicles, leads, sales }: { vehicles: number; leads: number; sales: number }): Promise<void> {
  await client.query(
    `INSERT INTO vehicles(tenant_id, dealership_id, location_id, slug, stock_id, payload, publish_status, availability_status, created_at, updated_at)
     SELECT $1, $2, ($3::uuid[])[1 + (g % 3)], 'syn-' || g, 'SYN-' || g,
       jsonb_build_object('make', (ARRAY['Maruti','Hyundai','Tata','Honda','Toyota','Mahindra','Kia','BMW'])[1 + g % 8], 'model', 'Model ' || (g % 40), 'variant', 'V' || (g % 6), 'year', 2012 + g % 13,
         'fuelType', (ARRAY['petrol','diesel','cng','electric'])[1 + g % 4], 'transmission', (ARRAY['manual','automatic'])[1 + g % 2], 'mileage', 8000 + (g * 37) % 140000, 'ownership', 1 + g % 3,
         'price', 250000 + (g * 7919) % 2500000, 'media', CASE WHEN g % 4 = 0 THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('url', 'https://example.invalid/' || g || '.jpg')) END, 'specifications', jsonb_build_object('registration', 'KL-' || (g % 99))),
       CASE WHEN g % 10 < 8 THEN 'published' ELSE 'draft' END, CASE WHEN g <= $5 THEN 'sold' WHEN g % 17 = 0 THEN 'reserved' ELSE 'available' END,
       now() - make_interval(days => (g * 13) % 320), now() - make_interval(days => (g * 13) % 320)
     FROM generate_series(1, $4) g`,
    [tenantId, ids.dealership_id, ids.locs, vehicles, sales],
  );
  await client.query(
    `INSERT INTO stock_costs(tenant_id, vehicle_id, version, payload)
     SELECT tenant_id, id, 1, jsonb_build_object('purchasePrice', 200000 + (row_number() OVER ()) * 311 % 2000000, 'reconditioningCost', 8000 + (row_number() OVER ()) % 30000, 'transferCost', 3000, 'otherCost', 1500, 'acquiredOn', to_char(created_at, 'YYYY-MM-DD'))
     FROM vehicles WHERE tenant_id = $1`, [tenantId]);
  await client.query(
    `INSERT INTO leads(tenant_id, dealership_id, location_id, vehicle_id, payload, stage, source, campaign, created_at, updated_at)
     SELECT $1, $2, ($3::uuid[])[1 + (g % 3)], v.id,
       jsonb_build_object('name', 'Lead ' || g, 'phone', '+91 90000 ' || lpad((g % 100000)::text, 5, '0'), 'email', 'lead' || g || '@synthetic.invalid', 'assignedTo', 'Unassigned', 'consent', jsonb_build_object('marketing', g % 2 = 0)),
       (ARRAY['new','contacted','qualified','appointment','visited','test_drive','negotiation','won','lost','nurture'])[1 + g % 10], (ARRAY['Website','Walk-in','Referral','Campaign'])[1 + g % 4], NULL,
       now() - make_interval(hours => (g * 7) % 7000), now() - make_interval(hours => (g * 5) % 7000)
     FROM generate_series(1, $5) g JOIN vehicles v ON v.tenant_id = $1 AND v.stock_id = 'SYN-' || (1 + g % $4)`, [tenantId, ids.dealership_id, ids.locs, vehicles, leads]);
  await client.query(
    `INSERT INTO tasks(tenant_id, lead_id, payload, due_at, completed)
     SELECT $1, id, jsonb_build_object('title', 'Follow up'), now() + make_interval(hours => (n % 200)::int - 100), n % 3 = 0
     FROM (SELECT id, row_number() OVER (ORDER BY id) n FROM leads WHERE tenant_id = $1) x WHERE n % 2 = 0`, [tenantId]);
  await client.query(
    `INSERT INTO sales(id, tenant_id, lead_id, vehicle_id, payload, amount, sold_at)
     SELECT gen_random_uuid(), $1, l.id, l.vehicle_id, '{}'::jsonb, 300000 + (n * 977) % 2400000, now() - make_interval(days => (n % 300)::int)
     FROM (SELECT DISTINCT ON (l.vehicle_id) l.id, l.vehicle_id, row_number() OVER (ORDER BY l.vehicle_id) n
           FROM leads l JOIN vehicles v ON v.id = l.vehicle_id AND v.availability_status = 'sold' WHERE l.tenant_id = $1 ORDER BY l.vehicle_id, l.created_at) l`, [tenantId]);
}
