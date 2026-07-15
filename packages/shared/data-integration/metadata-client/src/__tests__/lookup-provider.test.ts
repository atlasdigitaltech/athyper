import { afterEach, describe, expect, it, vi } from "vitest";

import type { MetadataClient } from "@athyper/api-client";
import {
  bootstrapHotSet,
  clearLookupCache,
  isDomainCached,
} from "../lookup-provider";

afterEach(() => {
  clearLookupCache();
});

describe("bootstrapHotSet", () => {
  it("clears a failed bootstrap promise so the next call can retry", async () => {
    const client = {
      getHotSetLookups: vi.fn()
        .mockRejectedValueOnce(new Error("lookup service unavailable"))
        .mockResolvedValueOnce([
          {
            domain: { code: "country" },
            values: [],
          },
        ]),
    } as unknown as MetadataClient;

    await expect(bootstrapHotSet(client)).rejects.toThrow("lookup service unavailable");
    await expect(bootstrapHotSet(client)).resolves.toBeUndefined();

    expect(client.getHotSetLookups).toHaveBeenCalledTimes(2);
    expect(isDomainCached("country")).toBe(true);
  });
});
