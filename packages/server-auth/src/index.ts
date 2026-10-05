import { CognitoJwtVerifier } from "aws-jwt-verify";
import {
  AuthorizationError,
  requireCapability,
  requireDealership,
  requireLocation,
  requireTenant,
  type AuthenticatedPrincipal,
  type Capability,
} from "@vandlabs/contracts";

type Environment = Record<string, string | undefined>;
type TokenVerifier = (token: string) => Promise<{ sub: string }>;
const capabilities: Capability[] = [
  "inventory:read", "lead:read", "lead:write", "task:write", "analytics:read", "platform:admin",
];

export class AuthenticationError extends Error {
  constructor(public readonly status: 401 | 503, message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export function authMode(env: Environment = process.env): "demo" | "cognito" {
  if (env.AUTH_MODE === "cognito" || env.AUTH_MODE === "demo") return env.AUTH_MODE;
  if (!env.AUTH_MODE && env.NODE_ENV !== "production" && env.DATA_MODE !== "aurora") return "demo";
  throw new AuthenticationError(503, "Staff authentication is not configured.");
}

export function createCognitoVerifier(env: Environment = process.env) {
  if (!env.COGNITO_USER_POOL_ID || !env.COGNITO_CLIENT_ID) {
    throw new AuthenticationError(503, "Staff authentication is not configured.");
  }
  return CognitoJwtVerifier.create({
    userPoolId: env.COGNITO_USER_POOL_ID,
    clientId: env.COGNITO_CLIENT_ID,
    tokenUse: "access",
  });
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

// This registry is server-owned provisioning data, never a browser/JWT role claim.
function provisionedPrincipal(sub: string, registry: string | undefined): AuthenticatedPrincipal {
  if (!registry) throw new AuthenticationError(503, "Staff authorization is not configured.");
  let entries: unknown;
  try { entries = JSON.parse(registry); } catch {
    throw new AuthenticationError(503, "Staff authorization is not configured.");
  }
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    throw new AuthenticationError(503, "Staff authorization is not configured.");
  }
  const entry = Object.hasOwn(entries, sub) ? (entries as Record<string, unknown>)[sub] : undefined;
  if (!entry || typeof entry !== "object") throw new AuthorizationError();
  const value = entry as Record<string, unknown>;
  if (typeof value.tenantId !== "string" || !value.tenantId.trim() ||
      !stringList(value.dealershipIds) || !stringList(value.locationIds) ||
      !stringList(value.capabilities) ||
      !value.capabilities.every((item) => capabilities.includes(item as Capability))) {
    throw new AuthenticationError(503, "Staff authorization is not configured.");
  }
  return {
    userId: sub, tenantId: value.tenantId,
    dealershipIds: [...value.dealershipIds], locationIds: [...value.locationIds],
    capabilities: [...value.capabilities] as Capability[],
  };
}

function accessToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization !== null) {
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match) throw new AuthenticationError(401, "Authentication required.");
    return { token: match[1], cookie: false };
  }
  const matches = (request.headers.get("cookie") ?? "").split(";")
    .map((part) => part.trim()).filter((part) => part.startsWith("__Host-vandlabs-access-token="));
  if (matches.length !== 1 || !matches[0].split("=")[1]) {
    throw new AuthenticationError(401, "Authentication required.");
  }
  return { token: matches[0].slice("__Host-vandlabs-access-token=".length), cookie: true };
}

export function createPrincipalResolver(options: {
  demoPrincipal: AuthenticatedPrincipal;
  env?: Environment;
  verifyToken?: TokenVerifier;
}) {
  let verifyToken = options.verifyToken;
  return async (request: Request): Promise<AuthenticatedPrincipal> => {
    const env = options.env ?? process.env;
    if (authMode(env) === "demo") {
      if (env.DATA_MODE === "aurora") throw new AuthenticationError(503, "Production data requires Cognito authentication.");
      return structuredClone(options.demoPrincipal);
    }
    const credential = accessToken(request);
    if (credential.cookie && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (request.headers.get("origin") !== new URL(request.url).origin ||
          request.headers.get("sec-fetch-site") === "cross-site") {
        throw new AuthorizationError("Invalid request origin");
      }
    }
    if (!verifyToken) {
      const verifier = createCognitoVerifier(env);
      verifyToken = (token) => verifier.verify(token);
    }
    let sub: string;
    try { sub = (await verifyToken(credential.token)).sub; } catch {
      throw new AuthenticationError(401, "Authentication required.");
    }
    if (!sub) throw new AuthenticationError(401, "Authentication required.");
    return provisionedPrincipal(sub, env.AUTH_PRINCIPALS_JSON);
  };
}

export function requireLeadAccess(
  principal: AuthenticatedPrincipal,
  lead: { tenantId: string; dealershipId: string; locationId?: string },
  capability: Capability,
) {
  requireCapability(principal, capability);
  requireTenant(principal, lead.tenantId);
  requireDealership(principal, lead.dealershipId);
  if (lead.locationId) requireLocation(principal, lead.locationId);
}

export function accessError(error: unknown): { status: number; message: string } | null {
  if (error instanceof AuthenticationError) return { status: error.status, message: error.message };
  if (error instanceof AuthorizationError) return { status: 403, message: "Forbidden." };
  return null;
}
