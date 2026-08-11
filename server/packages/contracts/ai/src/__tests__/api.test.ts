import { describe, expectTypeOf, it } from "vitest";
import type { AtlasCredentialAdministration, AtlasModelBinding, AtlasRunRepository, AtlasToolManifest, AtlasUsageLedgerEntry } from "../index.js";

describe("Atlas AI contract", () => {
  it("keeps provider binding and policy revisions explicit", () => {
    expectTypeOf<AtlasModelBinding>().toHaveProperty("upstreamModelId");
    expectTypeOf<AtlasModelBinding>().toHaveProperty("bindingRevision");
    expectTypeOf<AtlasRunRepository>().toHaveProperty("begin");
  });
  it("models only registered command mutations and content-free ledgers", () => {
    expectTypeOf<AtlasToolManifest>().toHaveProperty("commandBinding");
    expectTypeOf<AtlasUsageLedgerEntry>().not.toHaveProperty("prompt");
    expectTypeOf<AtlasUsageLedgerEntry>().not.toHaveProperty("response");
    expectTypeOf<AtlasCredentialAdministration>().not.toHaveProperty("readSecret");
  });
});
