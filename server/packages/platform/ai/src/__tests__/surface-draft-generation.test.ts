import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { describe, expect, it, vi } from "vitest";
import { AtlasSurfaceDraftGenerator } from "../surface-draft-generation.js";

const context: VerifiedRequestContext = {
  planeKey: "studio", realmKey: "studio", tenantId: "10000000-0000-4000-8000-000000000001", principalId: "20000000-0000-4000-8000-000000000001", authEpoch: 1, requestId: "request-1", profileHash: "profile-1",
  permissions: { planeKey: "studio", tenantId: "10000000-0000-4000-8000-000000000001", principalId: "20000000-0000-4000-8000-000000000001", principalFingerprint: "principal-1", profileHash: "profile-1", schemaHash: "schema-1", resolvedAt: 1, allowed: ["studio.platform.catalog.manage"], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] },
};

const definition = { schema: "athyper-experience-surface/1", id: "neon.home", revision: 1, scope: { kind: "home", plane: "neon" }, title: "Home", blocks: [] };

function generator(output: string, saveSurfaceDraft = vi.fn(async (_context, input) => ({ id: "release-1", ...input }))) {
  return { saveSurfaceDraft, generator: new AtlasSurfaceDraftGenerator({
    admission: { resolve: async () => ({ schema: "atlas-plane-admission/1", planeKey: "studio", chatAllowed: true, persistenceAllowed: true, readToolsAllowed: false, mutationToolsAllowed: false, invoiceExtractionAllowed: false, allowedPublicModelIds: ["atlas-balanced"], allowedDataClasses: ["internal"], policyRevision: "policy-1" }) },
    threads: { create: async () => ({ threadId: "thread-1" }) },
    runtime: { async *run() { yield { protocol: "atlas.sse/1", sequence: 1, runId: "run-1", threadId: "thread-1", emittedAt: "2026-08-31T00:00:00Z", event: { type: "message.delta", messageId: "message-1", text: output } } as const; yield { protocol: "atlas.sse/1", sequence: 2, runId: "run-1", threadId: "thread-1", emittedAt: "2026-08-31T00:00:01Z", event: { type: "run.completed", messageId: "message-1", reason: "stop" } } as const; } },
    surfaces: { saveSurfaceDraft }, createRequestId: () => "request-generated-1",
  }) };
}

describe("Atlas experience surface draft generation", () => {
  it("persists generated JSON only through the governed Atlas draft source", async () => {
    const fixture = generator(JSON.stringify(definition));
    const result = await fixture.generator.generate(context, { targetPlane: "neon", layer: "tenant", surfaceKey: "neon.home", instruction: "Create a concise welcome surface." });
    expect(fixture.saveSurfaceDraft).toHaveBeenCalledWith(context, { targetPlane: "neon", layer: "tenant", definition, source: "atlas" });
    expect(result).toMatchObject({ release: { id: "release-1", source: "atlas" }, generation: { threadId: "thread-1", publicModelId: "atlas-balanced", policyRevision: "policy-1" } });
  });

  it("does not persist malformed model output", async () => {
    const fixture = generator("not-json");
    await expect(fixture.generator.generate(context, { targetPlane: "neon", layer: "tenant", surfaceKey: "neon.home", instruction: "Create a surface." })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(fixture.saveSurfaceDraft).not.toHaveBeenCalled();
  });

  it("requires Studio catalog authority before inference", async () => {
    const fixture = generator(JSON.stringify(definition));
    await expect(fixture.generator.generate({ ...context, planeKey: "neon", permissions: { ...context.permissions, planeKey: "neon", allowed: [] } }, { targetPlane: "neon", layer: "tenant", surfaceKey: "neon.home", instruction: "Create a surface." })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(fixture.saveSurfaceDraft).not.toHaveBeenCalled();
  });
});
