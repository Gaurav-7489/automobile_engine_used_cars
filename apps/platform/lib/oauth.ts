import { createOAuthHandlers } from "@vandlabs/server-auth/oauth";
import { authorizePlatform } from "./auth";
export const oauth = createOAuthHandlers("/platform", authorizePlatform);
