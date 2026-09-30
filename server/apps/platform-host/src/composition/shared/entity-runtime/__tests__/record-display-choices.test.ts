import { describe, expect, it, vi } from "vitest";
import {
  createRecordDisplayChoices,
  type PublishedLookupProvider,
} from "../record-display-choices.js";

const context = { planeKey: "neon", tenantId: "tenant", principalId: "principal" } as never;

describe("published lookup providers", () => {
  it("uses only a registered provider and rejects unregistered lookup codes", async () => {
    const choices = vi.fn(async () => [
      { value: "active", label: { labelKey: "lookup.status.active", defaultText: "Active" } },
    ]);
    const provider: PublishedLookupProvider = {
      accepts: (catalog) => catalog === "control.status",
      choices,
    };
    const transactions = {
      run: vi.fn(async (_plane, _context, work) => work({})),
    } as never;
    const resolve = createRecordDisplayChoices(transactions, [provider]);

    await expect(resolve(context, "control.status", ["active"])).resolves.toEqual([
      { value: "active", label: { labelKey: "lookup.status.active", defaultText: "Active" } },
    ]);
    expect(choices).toHaveBeenCalledWith({}, "control.status", ["active"]);
    await expect(resolve(context, "master.unpublished_lookup")).rejects.toThrow(
      "ENTITY_LOOKUP_PROVIDER_UNREGISTERED",
    );
  });
});
