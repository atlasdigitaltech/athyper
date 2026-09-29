import { expect, it, vi } from "vitest";
import type { SharedReferenceDirectory } from "@athyper/server-contract-master-data";
import { sharedReferenceFilterChoices } from "./shared-reference-directory.js";

it("collects every authorized reference filter page without silently truncating it", async () => {
  const lookup = vi.fn(async ({ cursor }: { cursor?: string }) =>
    cursor
      ? {
          sourceKey: "iso.country" as const,
          items: [{ value: "MY", label: "Malaysia", recordId: "2" }],
        }
      : {
          sourceKey: "iso.country" as const,
          items: [{ value: "US", label: "United States", recordId: "1" }],
          nextCursor: "next",
        },
  );
  const directory = { lookup } as unknown as SharedReferenceDirectory;
  await expect(
    sharedReferenceFilterChoices(directory, "iso.country"),
  ).resolves.toEqual([
    { value: "US", label: "United States" },
    { value: "MY", label: "Malaysia" },
  ]);
  expect(lookup).toHaveBeenCalledTimes(2);
  await expect(
    sharedReferenceFilterChoices(directory, "iso.country", 1),
  ).rejects.toThrow("ENTITY_FILTER_CHOICES_REQUIRES_SEARCH");
});
