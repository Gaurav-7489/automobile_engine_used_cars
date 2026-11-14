import { resolvePrincipal, signIn } from "../../apps/intelligence/lib/server/identity";
import { loadVluceDemoCollection } from "../../apps/intelligence/lib/server/demo-collection";

/**
 * Loads the VLuce website template's 25 demo cars into a workspace, so the Intelligence demo and the website demo show
 * the same stock. Signs in as the workspace owner; the password is read from the environment, never from arguments.
 *
 *   DATABASE_URL=... OWNER_PASSWORD=... node --import tsx scripts/intelligence/load-vluce-demo.ts --owner-email owner@example.com
 *
 * Safe to run again: cars already loaded are skipped.
 */
const at = process.argv.indexOf("--owner-email");
const email = at > 0 ? process.argv[at + 1] : "";
const password = process.env.OWNER_PASSWORD ?? "";
if (!email || !password) throw new Error("Pass --owner-email and set OWNER_PASSWORD.");

const login = await signIn(email, password);
if (!login.ok) throw new Error(`Sign-in failed: ${login.code}`);
const owner = await resolvePrincipal(login.userId, login.tenantId, Math.floor(Date.now() / 1000));
if (!owner || owner.role !== "owner") throw new Error("Sign in as the workspace owner.");
const result = await loadVluceDemoCollection(owner);
console.log(`Added ${result.added}, published ${result.published}, already present ${result.skipped}.`);
for (const f of result.failed) console.log(`Not loaded ${f.ref}: ${f.message}`);
process.exit(result.failed.length ? 1 : 0);
