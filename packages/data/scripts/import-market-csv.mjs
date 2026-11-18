#!/usr/bin/env node
/**
 * Import authorized listing observations, never an OLX scraper.
 * Run under a migration/operator DB role that can write the protected tables.
 * See docs/authorized-used-car-data.md.
 */
import { readFile } from "node:fs/promises";
import { Client } from "pg";

function csvRows(input) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') {
      if (field.length) throw new Error("Unexpected quote in CSV");
      quoted = true;
    } else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(x => x.length)) rows.push(row);
      row = [];
    } else field += c;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) throw new Error("CSV is empty");
  const [headers, ...data] = rows;
  const names = headers.map(x => x.trim().replace(/^\uFEFF/, ""));
  if (new Set(names).size !== names.length) throw new Error("Duplicate CSV headers");
  return data.map((values, i) => {
    if (values.length !== names.length) throw new Error(`Row ${i + 2}: column count mismatch`);
    return Object.fromEntries(names.map((name, j) => [name, values[j].trim()]));
  });
}
const arg = (name) => {
  const position = process.argv.indexOf(`--${name}`);
  return position >= 0 ? process.argv[position + 1] : undefined;
};
const required = (name) => {
  const value = arg(name);
  if (!value || value.startsWith("--")) throw new Error(`Missing --${name}`);
  return value;
};
function number(value, name, line, min, max, optional = false) {
  if (optional && value === "") return null;
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < min || n > max) throw new Error(`Row ${line}: invalid ${name}`);
  return n;
}
function validate(row, line) {
  const need = (name, max) => {
    const value = row[name] ?? "";
    if (!value || value.length > max) throw new Error(`Row ${line}: invalid ${name}`);
    return value;
  };
  const optional = (name, max) => {
    const value = row[name] ?? "";
    if (value.length > max) throw new Error(`Row ${line}: ${name} too long`);
    return value;
  };
  const sourceUrl = optional("source_url", 2000);
  if (sourceUrl && (!sourceUrl.startsWith("https://") || !URL.canParse(sourceUrl))) throw new Error(`Row ${line}: invalid HTTPS source_url`);
  const observed = new Date(need("observed_at", 60));
  if (!Number.isFinite(observed.getTime()) || observed.getTime() > Date.now() + 300000) throw new Error(`Row ${line}: invalid observed_at`);
  return [
    need("external_id", 160), need("make", 80), need("model", 100), optional("variant", 120),
    number(row.year ?? "", "year", line, 1950, 2100, true),
    optional("fuel", 40), optional("transmission", 40),
    number(row.km ?? "", "km", line, 0, 2000000, true),
    number(row.owners ?? "", "owners", line, 1, 20, true),
    need("city", 100), optional("state", 100),
    number(row.asking_price_inr ?? "", "asking_price_inr", line, 1, 1000000000, true),
    sourceUrl || null, observed.toISOString(),
  ];
}
async function main() {
  const path = required("csv");
  const sourceId = required("source-id");
  const sourceName = required("source-name");
  const agreement = required("agreement");
  const expiresAt = new Date(required("expires-at"));
  if (!/^[a-z0-9_-]{2,64}$/.test(sourceId) || sourceName.length < 2 || sourceName.length > 120 || agreement.length < 3 || agreement.length > 250) throw new Error("Invalid source metadata");
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) throw new Error("Source agreement must have a future expiry");
  if (!process.argv.includes("--confirm-licensed-dealer-use")) throw new Error("Pass --confirm-licensed-dealer-use only when your agreement permits this commercial use");
  const url = process.env.MARKET_IMPORT_DATABASE_URL;
  if (!url) throw new Error("Set MARKET_IMPORT_DATABASE_URL to an authorized operator database connection. Never commit the URL.");
  const rows = csvRows(await readFile(path, "utf8")).map((r, i) => validate(r, i + 2));
  const unique = new Set(rows.map(row => row[0]));
  if (unique.size !== rows.length) throw new Error("Duplicate external_id in CSV");
  if (!rows.length) throw new Error("No data rows to import");
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO intelligence_market_sources
      (id,name,agreement_reference,dealer_use,enabled,expires_at)
      VALUES ($1,$2,$3,true,true,$4)
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, agreement_reference=EXCLUDED.agreement_reference,
      dealer_use=true, enabled=true, expires_at=EXCLUDED.expires_at, updated_at=now()`,
      [sourceId, sourceName, agreement, expiresAt.toISOString()]);
    for (const row of rows) {
      await client.query(`INSERT INTO intelligence_market_observations
        (source_id,external_id,make,model,variant,year,fuel,transmission,km,owners,city,state,asking_price_inr,source_url,observed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (source_id,external_id) DO UPDATE SET
        make=EXCLUDED.make,model=EXCLUDED.model,variant=EXCLUDED.variant,year=EXCLUDED.year,
        fuel=EXCLUDED.fuel,transmission=EXCLUDED.transmission,km=EXCLUDED.km,
        owners=EXCLUDED.owners,city=EXCLUDED.city,state=EXCLUDED.state,
        asking_price_inr=EXCLUDED.asking_price_inr,source_url=EXCLUDED.source_url,
        observed_at=EXCLUDED.observed_at,imported_at=now()`, [sourceId, ...row]);
    }
    await client.query("COMMIT");
    console.log(`Imported ${rows.length} authorized observations from ${sourceId}.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { await client.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
