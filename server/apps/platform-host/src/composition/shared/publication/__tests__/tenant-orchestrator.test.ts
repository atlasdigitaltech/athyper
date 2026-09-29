import { expect, it } from "vitest";
import type { Kysely } from "kysely";
import type { PublicationArtifactLoader } from "@athyper/server-contract-publication";
import { TenantPublicationOrchestrator } from "../tenant-orchestrator.js";

it("rejects publication application without an explicit tenant coordinate", async () => {
  const unavailable = {} as Kysely<Record<string, never>>;
  const orchestrator = new TenantPublicationOrchestrator(
    unavailable,
    unavailable,
    {} as PublicationArtifactLoader,
  );
  await expect(orchestrator.deploy("deployment")).rejects.toThrow(
    "PUBLICATION_APPLIER_TENANT_REQUIRED",
  );
});
