import { afterEach, describe, expect, it, vi } from "vitest";
import { applyServerDefaultsResolve } from "./apply-client-source-change";
import type { EntityFieldDefaults } from "@athyper/cascade";
import { setBffClientPlane } from "../client/csrf";

describe("applyServerDefaultsResolve", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts one source-change batch request and returns server patches", async () => {
    setBffClientPlane("neon");
    vi.stubGlobal("document", { cookie: "__csrf=csrf-123" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        ok: true,
        valueUpdates: { billfrom_address_id: "addr-new", remitto_address_id: "remit-new" },
        derivedFields: ["billfrom_address_id", "remitto_address_id"],
        clearedFields: [],
        warnings: {},
        errors: {},
        intents: [],
        explain: [{ resolver: "picker.first_option" }],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );

    const defaultsByField: Record<string, EntityFieldDefaults> = {
      billfrom_address_id: {
        on_source_change: [{
          sources: ["supplier_id"],
          action: "rederive",
          mode: "always",
          resolver: "picker.first_option",
          layers: ["client_on_change"],
        }],
      },
    };

    const result = await applyServerDefaultsResolve({
      entityCode: "purchase_invoice",
      recordId: "inv-1",
      changedFields: ["supplier_id"],
      oldValues: { supplier_id: "sup-old" },
      newValues: { supplier_id: "sup-new" },
      provenance: { supplier_id: "loaded" },
      defaultsByField,
    });

    expect(result.valueUpdates).toEqual({
      billfrom_address_id: "addr-new",
      remitto_address_id: "remit-new",
    });
    expect(result.derivedFields).toEqual(["billfrom_address_id", "remitto_address_id"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/runtime/v1/entities/purchase_invoice/defaults/resolve",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: expect.objectContaining({
          "X-CSRF-Token": "csrf-123",
        }),
      }),
    );
  });

  it("does not fall back to client-side resolver fan-out when batch fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "FAILED" }), { status: 500 }),
    );

    const result = await applyServerDefaultsResolve({
      entityCode: "purchase_invoice",
      changedFields: ["supplier_id"],
      oldValues: { supplier_id: "sup-old" },
      newValues: { supplier_id: "sup-new" },
      provenance: {},
      defaultsByField: {},
    });

    expect(result.valueUpdates).toEqual({});
    expect(result.derivedFields).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
