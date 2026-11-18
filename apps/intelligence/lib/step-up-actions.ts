/**
 * The sensitive operations that need a fresh Google confirmation. A confirmation is bound to one action and one resource (for
 * example one dealership), lasts a few minutes and works once. The server checks all of it again when the operation runs.
 * Plain constants (no "use client"), so the server and the client dialogs share one list.
 */
export const STEP_UP_ACTIONS = [
  "access.decide", "workspace.create", "workspace.owner", "workspace.entitlements", "workspace.sources", "workspace.websites",
  "user.update", "settings.api-keys", "settings.business-keys", "settings.messaging", "settings.two-factor", "workspace.commands", "advertising.launch",
] as const;
export type StepUpAction = (typeof STEP_UP_ACTIONS)[number];

export const isStepUpAction = (value: unknown): value is StepUpAction => typeof value === "string" && (STEP_UP_ACTIONS as readonly string[]).includes(value);

/** A resource is an id such as a dealership, request or campaign. Empty means the action has no particular resource. */
export const isStepUpResource = (value: unknown): value is string => typeof value === "string" && value.length <= 80 && /^[A-Za-z0-9_.:-]*$/.test(value);

/** How long a confirmation stays usable. It is also single-use, so this only bounds how long an unused one can wait. */
export const STEP_UP_TTL_SECONDS = 5 * 60;
