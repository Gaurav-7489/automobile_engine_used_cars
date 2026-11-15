/**
 * Password, password-reset, authenticator-code and website-password-connect endpoints from before Google-only sign-in.
 *
 * They stay in the code for a safe migration and rollback, and are off unless LEGACY_PASSWORD_LOGIN=enabled. Rollout:
 * deploy with LEGACY_PASSWORD_LOGIN=enabled, sign in with Google as the administrator and an owner, then remove it (or set
 * "disabled") and redeploy. Rolling back is setting it to "enabled" again; no data changes.
 */
export const legacyPasswordLogin = (env: Record<string, string | undefined> = process.env): boolean => env.LEGACY_PASSWORD_LOGIN?.trim().toLowerCase() === "enabled";

export const LEGACY_OFF_MESSAGE = "Password sign-in has been replaced by Google sign-in. Use Continue with Google.";
