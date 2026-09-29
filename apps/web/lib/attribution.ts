export interface ClientAttribution {
  sessionId: string;
  firstTouch?: {
    source: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
    landingPath: string;
    capturedAt: string;
  };
  lastTouch?: {
    source: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
    landingPath: string;
    capturedAt: string;
  };
}

const KEY = "vl-auto-attribution";
const SESSION_KEY = "vl-auto-session";

const safeParse = (value: string | null): ClientAttribution | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as ClientAttribution;
  } catch {
    return null;
  }
};

const ensureSessionId = () => {
  if (typeof window === "undefined") return "server";
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : "session-" + Date.now();
  sessionStorage.setItem(SESSION_KEY, id);
  return id;
};

export function readAttribution(): ClientAttribution {
  if (typeof window === "undefined") return { sessionId: "server" };
  return (
    safeParse(sessionStorage.getItem(KEY)) ?? {
      sessionId: ensureSessionId(),
    }
  );
}

export function captureAttribution(path: string, params: URLSearchParams) {
  if (typeof window === "undefined") return;
  const existing = readAttribution();
  const touch = {
    source:
      params.get("utm_source") ||
      (document.referrer ? "referral" : "direct"),
    medium: params.get("utm_medium") || undefined,
    campaign: params.get("utm_campaign") || undefined,
    term: params.get("utm_term") || undefined,
    content: params.get("utm_content") || undefined,
    landingPath: path,
    capturedAt: new Date().toISOString(),
  };
  const next: ClientAttribution = {
    sessionId: existing.sessionId || ensureSessionId(),
    firstTouch: existing.firstTouch ?? touch,
    lastTouch: touch,
  };
  sessionStorage.setItem(KEY, JSON.stringify(next));
}

export async function recordJourneyEvent(
  type: string,
  payload: Record<string, unknown> = {},
) {
  if (typeof window === "undefined") return;
  const attribution = readAttribution();
  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        type,
        sessionId: attribution.sessionId,
        source: attribution.lastTouch?.source,
        campaign: attribution.lastTouch?.campaign,
        path: window.location.pathname,
        ...payload,
      }),
    });
  } catch {
    // Analytics must never block the customer journey.
  }
}
