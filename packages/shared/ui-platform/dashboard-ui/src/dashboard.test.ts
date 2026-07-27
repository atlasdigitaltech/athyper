import { describe, expect, it } from "vitest";
import type { DashboardWidgetRegistration } from "./dashboard";
import { isDashboardResultStale, visibleDashboardRegistrations } from "./dashboard";

const registrations: DashboardWidgetRegistration[] = [
  { id: "public", title: "Public", kind: "metric", layout: { columnSpan: 1 }, query: { key: "public", freshnessMs: 1_000 } },
  { id: "secure", title: "Secure", kind: "metric", layout: { columnSpan: 1 }, permission: "dashboard.secure", query: { key: "secure", freshnessMs: 1_000 } },
];

describe("dashboard registration policy", () => {
  it("removes widgets without the required permission", () => {
    expect(visibleDashboardRegistrations(registrations, []).map((item) => item.id)).toEqual(["public"]);
    expect(visibleDashboardRegistrations(registrations, ["dashboard.secure"]).map((item) => item.id)).toEqual(["public", "secure"]);
  });

  it("honors the explicit wildcard grant", () => {
    expect(visibleDashboardRegistrations(registrations, ["*"])).toHaveLength(2);
  });
});

describe("dashboard freshness", () => {
  it("marks expired or server-stale results stale", () => {
    const base = { id: "metric", data: { value: 4 }, generatedAt: "2026-07-25T00:00:00.000Z", staleAt: "2026-07-25T00:01:00.000Z" } as const;
    expect(isDashboardResultStale({ ...base, state: "ready" }, Date.parse("2026-07-25T00:00:30.000Z"))).toBe(false);
    expect(isDashboardResultStale({ ...base, state: "ready" }, Date.parse("2026-07-25T00:02:00.000Z"))).toBe(true);
    expect(isDashboardResultStale({ ...base, state: "stale" }, Date.parse("2026-07-25T00:00:30.000Z"))).toBe(true);
  });
});
