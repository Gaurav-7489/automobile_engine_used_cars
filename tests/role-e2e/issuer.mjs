import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const directory = process.env.VANDLABS_ROLE_FIXTURE_DIR;
if (!directory) throw new Error("Missing isolated identity fixture directory");
const server = createServer({ key: readFileSync(join(directory, "tls.key")), cert: readFileSync(join(directory, "tls.crt")) }, (request, response) => {
  response.writeHead(request.url === "/jwks" ? 200 : 404, { "content-type": "application/json" });
  response.end(request.url === "/jwks" ? readFileSync(join(directory, "jwks.json")) : "{}");
});
server.listen(3443, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
