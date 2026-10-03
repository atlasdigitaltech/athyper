import { describe, expect, it, vi } from "vitest";
import type {
  AtlasPlaneAdmissionDecision,
  AtlasToolManifest,
} from "@athyper/server-contract-ai";
import {
  createAtlasGatedPlaneAdmission,
  createAtlasGatedToolAuthority,
} from "./tool-feature-gates.js";
import { AtlasToolRegistry, AtlasToolService } from "./tool-service.js";
import { MemoryToolStore } from "./__tests__/tool-store-fixture.js";
import { context } from "./__tests__/review-fixture.js";

const manifest: AtlasToolManifest = {
  schema: "atlas-tool-manifest/1",
  toolCode: "test_mutation",
  version: "1",
  displayName: "Test mutation",
  description: "Test registered owner command",
  access: "mutation",
  risk: "high",
  allowedPlanes: ["neon"],
  requiredPermissions: [],
  featureKey: "atlas_tools_mutation_enabled",
  inputSchema: {},
  resultSchema: {},
  timeoutMs: 1000,
  maxResultBytes: 1000,
  commandBinding: "test.owner.command",
  confirmation: "explicit_user",
};
const admissionDecision: AtlasPlaneAdmissionDecision = {
  schema: "atlas-plane-admission/1",
  planeKey: "neon",
  chatAllowed: true,
  persistenceAllowed: true,
  readToolsAllowed: true,
  mutationToolsAllowed: true,
  invoiceExtractionAllowed: false,
  allowedPublicModelIds: ["atlas-fast"],
  allowedDataClasses: ["internal"],
  policyRevision: "owner-policy-1",
};

describe("Atlas deployment tool gates", () => {
  it("rejects missing owner policy identity before adding deployment identity", async () => {
    const gates = { toolsEnabled: true, mutationsEnabled: true };
    const authority = createAtlasGatedToolAuthority(
      {
        authorize: async () => ({ allowed: true, policyRevision: " " }),
      },
      gates,
    );
    await expect(
      authority.authorize({ context, manifest, phase: "preview" }),
    ).rejects.toMatchObject({ code: "TOOL_INVALID" });
    const admission = createAtlasGatedPlaneAdmission(
      {
        resolve: async () => ({ ...admissionDecision, policyRevision: "" }),
      },
      gates,
    );
    await expect(admission.resolve(context)).rejects.toMatchObject({
      code: "TOOL_INVALID",
    });
  });
  it.each([
    [false, false, false, false],
    [false, true, false, false],
    [true, false, true, false],
    [true, true, true, true],
  ])(
    "bounds admission and both authorization phases with tools=%s mutations=%s",
    async (toolsEnabled, mutationsEnabled, readAllowed, mutationAllowed) => {
      const gates = { toolsEnabled, mutationsEnabled };
      const admission = createAtlasGatedPlaneAdmission(
        { resolve: async () => admissionDecision },
        gates,
      );
      expect(await admission.resolve(context)).toMatchObject({
        chatAllowed: true,
        persistenceAllowed: true,
        readToolsAllowed: readAllowed,
        mutationToolsAllowed: mutationAllowed,
        allowedPublicModelIds: ["atlas-fast"],
        allowedDataClasses: ["internal"],
      });
      const authorize = vi.fn(async () => ({
        allowed: true,
        policyRevision: "owner-policy-1",
      }));
      const authority = createAtlasGatedToolAuthority({ authorize }, gates);
      for (const phase of ["preview", "execute"] as const) {
        expect(
          await authority.authorize({ context, manifest, phase }),
        ).toMatchObject({ allowed: mutationAllowed });
        expect(
          await authority.authorize({
            context,
            manifest: { ...manifest, access: "read" },
            phase,
          }),
        ).toMatchObject({ allowed: readAllowed });
      }
      expect(authorize).toHaveBeenCalledTimes(4);
    },
  );

  it("preserves owner denials and policy evidence when deployment gates are enabled", async () => {
    const gates = { toolsEnabled: true, mutationsEnabled: true };
    const authority = createAtlasGatedToolAuthority(
      {
        authorize: async () => ({
          allowed: false,
          policyRevision: "denied-policy",
          reasonCode: "owner_denied",
          policySnapshot: { decision: "denied" },
          profileRevision: "profile-2",
        }),
      },
      gates,
    );
    expect(
      await authority.authorize({ context, manifest, phase: "execute" }),
    ).toMatchObject({
      allowed: false,
      reasonCode: "owner_denied",
      policySnapshot: { decision: "denied" },
      profileRevision: "profile-2",
    });
    const admission = createAtlasGatedPlaneAdmission(
      {
        resolve: async () => ({
          ...admissionDecision,
          readToolsAllowed: false,
          mutationToolsAllowed: false,
          reasonCode: "owner_denied",
        }),
      },
      gates,
    );
    expect(await admission.resolve(context)).toMatchObject({
      readToolsAllowed: false,
      mutationToolsAllowed: false,
      reasonCode: "owner_denied",
    });
  });

  it("binds stable policy revisions to both the owner decision and deployment gates", async () => {
    const resolve = (policyRevision: string, mutationsEnabled: boolean) =>
      createAtlasGatedPlaneAdmission(
        {
          resolve: async () => ({ ...admissionDecision, policyRevision }),
        },
        { toolsEnabled: true, mutationsEnabled },
      ).resolve(context);
    const first = await resolve("owner-1", true);
    expect((await resolve("owner-1", true)).policyRevision).toBe(
      first.policyRevision,
    );
    expect((await resolve("owner-1", false)).policyRevision).not.toBe(
      first.policyRevision,
    );
    expect((await resolve("owner-2", true)).policyRevision).not.toBe(
      first.policyRevision,
    );
  });

  it("blocks a previously confirmed mutation and completed replay after the mutation gate closes", async () => {
    const store = new MemoryToolStore();
    const commands = {
      execute: vi.fn(async () => ({
        commandId: context.principalId,
        revision: "2",
      })),
    };
    const createService = (mutationsEnabled: boolean) =>
      new AtlasToolService({
        registry: new AtlasToolRegistry([{ manifest }]),
        proposals: store,
        authority: createAtlasGatedToolAuthority(
          {
            authorize: async () => ({
              allowed: true,
              policyRevision: "owner-1",
            }),
          },
          { toolsEnabled: true, mutationsEnabled },
        ),
        confirmations: { verify: async () => true },
        records: { query: vi.fn() },
        commands,
      });
    const enabled = createService(true);
    const preview = await enabled.preview({
      context,
      threadId: "thread-1",
      runId: "run-1",
      callId: "call-1",
      toolCode: manifest.toolCode,
      toolVersion: "1",
      arguments: {},
      summary: "Test command",
      affectedEntityType: "test_entity",
      affectedEntityId: context.principalId,
      expectedRowVersion: 1,
    });
    await expect(
      enabled.run({ context, proposalId: preview.proposalId, arguments: {} }),
    ).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
    const confirmed = {
      ...store.rows.get(preview.proposalId)!,
      status: "confirmed" as const,
    };
    store.rows.set(preview.proposalId, confirmed);
    const disabled = createService(false);
    await expect(
      disabled.run({ context, proposalId: preview.proposalId, arguments: {} }),
    ).rejects.toMatchObject({ code: "TOOL_DENIED" });
    expect(store.rows.get(preview.proposalId)?.status).toBe("denied");
    expect(commands.execute).not.toHaveBeenCalled();

    // A completed receipt is also subject to current authority before replay.
    store.rows.set(preview.proposalId, { ...confirmed, status: "completed" });
    await expect(
      disabled.run({ context, proposalId: preview.proposalId, arguments: {} }),
    ).rejects.toMatchObject({ code: "TOOL_DENIED" });
    expect(commands.execute).not.toHaveBeenCalled();
  });
});
