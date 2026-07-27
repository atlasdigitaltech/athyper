export const SURFACE_EVENT_NAMES = [
  "surface_opened",
  "surface_load_failed",
  "widget_load_failed",
  "work_item_actioned",
  "setting_changed",
  "saved_view_opened",
  "setup_destination_opened",
  "content_downloaded",
  "document_actioned",
] as const;

export type SurfaceEventName = (typeof SURFACE_EVENT_NAMES)[number];
export type SurfaceEventResult =
  | "success"
  | "failure"
  | "denied"
  | "unavailable"
  | "conflict"
  | "cancelled";

export interface SurfaceEventInput {
  name: SurfaceEventName;
  plane: "admin" | "neon" | "mesh";
  scopeType: "tenant" | "organization" | "purchasing_org" | "network_account" | "platform";
  scopeId?: string;
  surfaceCode: string;
  route: string;
  durationMs: number;
  result: SurfaceEventResult;
  correlationId?: string;
}

export interface SurfaceEvent extends Omit<SurfaceEventInput, "correlationId"> {
  schemaVersion: 1;
  correlationId: string;
  occurredAt: string;
}

export type SurfaceEventSink = (event: SurfaceEvent) => void | Promise<void>;
export type SurfaceEventTransport = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

let sink: SurfaceEventSink | undefined;

export function setSurfaceEventSink(next: SurfaceEventSink | undefined): void {
  sink = next;
}

export function configureSurfaceEventTransport(
  transport: SurfaceEventTransport,
  endpoint = "/api/relay/platform/surface-events",
): void {
  setSurfaceEventSink(async (event) => {
    await transport(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    });
  });
}

/**
 * Fixed-schema diagnostics deliberately have no arbitrary metadata field, so
 * record values and confidential fields cannot be attached by callers.
 */
export function emitSurfaceEvent(input: SurfaceEventInput): SurfaceEvent {
  const event: SurfaceEvent = Object.freeze({
    schemaVersion: 1,
    name: input.name,
    plane: input.plane,
    scopeType: input.scopeType,
    ...(input.scopeId ? { scopeId: safeIdentifier(input.scopeId) } : {}),
    surfaceCode: safeCode(input.surfaceCode),
    route: safeRoute(input.route),
    durationMs: safeDuration(input.durationMs),
    result: input.result,
    correlationId: safeIdentifier(input.correlationId ?? createCorrelationId()),
    occurredAt: new Date().toISOString(),
  });
  try {
    const pending = sink?.(event);
    if (pending && typeof pending.catch === "function") pending.catch(() => undefined);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("athyper:surface-event", { detail: event }));
    }
  } catch {
    // Diagnostics must never break the user interaction.
  }
  return event;
}

export function createCorrelationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `corr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function safeCode(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_").slice(0, 120) || "unknown";
}

function safeIdentifier(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.:-]+/g, "_").slice(0, 160) || "unknown";
}

function safeRoute(value: string): string {
  const pathname = value.split("?")[0]?.split("#")[0] ?? "/";
  return `/${pathname.replace(/^\/+/, "").split("/").map((segment) =>
    /^[0-9a-f-]{20,}$/i.test(segment) ? ":id" : safeCode(segment)).join("/")}`.slice(0, 240);
}

function safeDuration(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : 0;
}
