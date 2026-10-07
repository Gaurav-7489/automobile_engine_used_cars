import { createOAuthHandlers } from "@vandlabs/server-auth/oauth";
import { resolvePrincipal } from "./auth";
export const oauth = createOAuthHandlers("/command", resolvePrincipal);
