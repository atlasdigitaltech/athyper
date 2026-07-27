import { describe, expect, it } from "vitest";

import {
  evaluateGeminiLifecycleAlerts,
  loadGeminiProviderLifecycle,
  validateGeminiProviderLifecycle,
} from "../evals/validate-gemini-provider-lifecycle";

describe("Gemini provider lifecycle", () => {
  it("pins the approved binding, API surface, and SDK version", () => {
    const manifest = loadGeminiProviderLifecycle();

    expect(manifest.selected_binding).toEqual({
      binding_id: "atlas-gemini-eval",
      model_id: "gemini-3.6-flash",
      lifecycle_status: "stable_ga",
      released_on: "2026-07-21",
      published_shutdown_on: null,
      api_surface: "interactions",
      endpoint_version: "v1beta",
      sdk_package: "@google/genai",
      sdk_version: "2.13.0",
    });
    expect(manifest.blocked_model_ids).toEqual(
      expect.arrayContaining([
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
      ]),
    );
  });

  it("has no blocking alert on the reviewed implementation date", () => {
    const alerts = evaluateGeminiLifecycleAlerts(
      loadGeminiProviderLifecycle(),
      new Date("2026-07-23T00:00:00.000Z"),
    );

    expect(alerts.filter((item) => item.severity === "blocking")).toEqual([]);
  });

  it("keeps the checked-in lifecycle review and rehearsal current", () => {
    const blockingAlerts = evaluateGeminiLifecycleAlerts(
      loadGeminiProviderLifecycle(),
    ).filter((item) => item.severity === "blocking");

    expect(blockingAlerts).toEqual([]);
  });

  it("raises blocking alerts after review and rehearsal deadlines", () => {
    const manifest = loadGeminiProviderLifecycle();

    expect(
      evaluateGeminiLifecycleAlerts(
        manifest,
        new Date("2026-08-23T00:00:00.000Z"),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "blocking",
          code: "model_lifecycle_review_overdue",
        }),
      ]),
    );
    expect(
      evaluateGeminiLifecycleAlerts(
        manifest,
        new Date("2026-10-22T00:00:00.000Z"),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "blocking",
          code: "replacement_rehearsal_overdue",
        }),
      ]),
    );
  });

  it("rejects selection of a blocked retirement model", () => {
    const manifest = loadGeminiProviderLifecycle();
    const changed = {
      ...structuredClone(manifest),
      selected_binding: {
        ...manifest.selected_binding,
        model_id: "gemini-2.5-pro",
      },
    };

    expect(() => validateGeminiProviderLifecycle(changed)).toThrow();
  });
});
