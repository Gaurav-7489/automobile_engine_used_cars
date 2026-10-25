// Local-only "one product address": mirrors the Cloudflare gateway's path routing so the website, Intelligence,
// Command Center and Platform are all reached at http://127.0.0.1:8080. Never expose it publicly.
import { createServer, request as httpRequest } from "node:http";
import { connect } from "node:net";

export const GATEWAY_PORT = 8080;
const routes = [["/command", 3001], ["/platform", 3002], ["/intelligence", 3003]];

/** Same path-boundary rule as infra/cloudflare/src/admission-core.ts `surface`. */
export function targetPort(path) {
  const pathname = path.split("?")[0];
  for (const [prefix, port] of routes) if (pathname === prefix || pathname.startsWith(prefix + "/")) return port;
  return 3000;
}

/** Absolute redirects from an app (built from its own host) are mapped back onto the gateway address. */
export function rewriteLocation(location, gatewayOrigin) {
  return typeof location === "string" ? location.replace(/^http:\/\/(127\.0\.0\.1|localhost):300[0-3](?=\/|$)/, gatewayOrigin) : location;
}

export function startGateway(port = GATEWAY_PORT) {
  const origin = `http://127.0.0.1:${port}`;
  const server = createServer((req, res) => {
    const target = targetPort(req.url ?? "/");
    // The app sees its own host (Next dev rejects foreign hosts for its assets); the public host travels as
    // x-forwarded-host, which same-origin checks compare against the browser's Origin.
    const headers = { ...req.headers, host: `127.0.0.1:${target}`, "x-forwarded-host": `127.0.0.1:${port}`, "x-forwarded-proto": "http" };
    const upstream = httpRequest({ host: "127.0.0.1", port: target, method: req.method, path: req.url, headers }, (reply) => {
      const out = { ...reply.headers };
      if (out.location) out.location = rewriteLocation(out.location, origin);
      res.writeHead(reply.statusCode ?? 502, out);
      reply.pipe(res);
    });
    upstream.on("error", () => { if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" }); res.end("This section is still starting. Retry in a moment."); });
    req.pipe(upstream);
  });
  // Hot reload websockets for each app.
  server.on("upgrade", (req, socket, head) => {
    const target = targetPort(req.url ?? "/");
    const upstream = connect(target, "127.0.0.1", () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (const [key, value] of Object.entries({ ...req.headers, host: `127.0.0.1:${target}`, origin: `http://127.0.0.1:${target}` })) lines.push(`${key}: ${value}`);
      upstream.write(lines.join("\r\n") + "\r\n\r\n");
      if (head?.length) upstream.write(head);
      upstream.pipe(socket); socket.pipe(upstream);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });
  server.listen(port, "127.0.0.1");
  return server;
}
