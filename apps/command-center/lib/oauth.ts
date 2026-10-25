import { createOAuthHandlers } from "@vandlabs/server-auth/oauth";
import { linkFederatedLogin } from "@vandlabs/data";
import { resolvePrincipal } from "./auth";
export const oauth = createOAuthHandlers("/command", resolvePrincipal, { linkIdentity: linkFederatedLogin });
