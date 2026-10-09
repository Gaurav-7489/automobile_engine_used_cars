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
  "inventory:read", "inventory:write", "lead:read", "lead:write", "task:write", "analytics:read", "capital:read", "capital:write", "platform:admin",
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
    clientId: env.COGNITO_CLIENT_IDS?.split(",").map(v=>v.trim()).filter(Boolean) ?? env.COGNITO_CLIENT_ID,
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
  if(value.platformTenantIds!==undefined && (!stringList(value.platformTenantIds)||value.platformTenantIds.length===0||!value.capabilities.includes("platform:admin"))) {
    throw new AuthenticationError(503,"Staff authorization is not configured.");
  }
  if(value.assignedLeadOnly!==undefined&&typeof value.assignedLeadOnly!=="boolean")throw new AuthenticationError(503,"Staff authorization is not configured.");
  return {
    userId: sub, tenantId: value.tenantId,
    dealershipIds: [...value.dealershipIds], locationIds: [...value.locationIds],
    capabilities: [...value.capabilities] as Capability[],
    ...(value.platformTenantIds ? {platformTenantIds:[...value.platformTenantIds as string[]]} : {}),
    ...(value.assignedLeadOnly===true?{assignedLeadOnly:true}:{}),
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
  lookupPrincipal?: (sub:string)=>Promise<AuthenticatedPrincipal|null>;
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
    if(env.AUTH_REGISTRY_MODE === "database") {
      // Only platform bootstrap administrators can bypass the database staff registry.
      let bootstrap:AuthenticatedPrincipal|undefined;
      if(env.AUTH_PRINCIPALS_JSON) {
        try {bootstrap=provisionedPrincipal(sub,env.AUTH_PRINCIPALS_JSON);}
        catch(error) {if(!(error instanceof AuthorizationError))throw error;}
      }
      if(bootstrap?.capabilities.includes("platform:admin"))return bootstrap;
      if(!options.lookupPrincipal)throw new AuthenticationError(503,"Staff authorization is not configured.");
      const principal=await options.lookupPrincipal(sub);
      if(!principal || principal.userId!==sub)throw new AuthorizationError();
      // Apply the same validation to persisted grants as to the server-owned bootstrap registry.
      return provisionedPrincipal(sub,JSON.stringify({[sub]:principal}));
    }
    if(env.AUTH_REGISTRY_MODE && env.AUTH_REGISTRY_MODE!=="environment")throw new AuthenticationError(503,"Staff authorization is not configured.");
    return provisionedPrincipal(sub, env.AUTH_PRINCIPALS_JSON);
  };
}

export function requireLeadAccess(
  principal: AuthenticatedPrincipal,
  lead: { tenantId: string; dealershipId: string; locationId?: string; assignedTo?:string },
  capability: Capability,
) {
  requireCapability(principal, capability);
  requireTenant(principal, lead.tenantId);
  requireDealership(principal, lead.dealershipId);
  if (lead.locationId) requireLocation(principal, lead.locationId);
  if(principal.assignedLeadOnly&&lead.assignedTo!==principal.userId)throw new AuthorizationError();
}

export function accessError(error: unknown): { status: number; message: string } | null {
  if (error instanceof AuthenticationError) return { status: error.status, message: error.message };
  if (error instanceof AuthorizationError) return { status: 403, message: "Forbidden." };
  return null;
}
