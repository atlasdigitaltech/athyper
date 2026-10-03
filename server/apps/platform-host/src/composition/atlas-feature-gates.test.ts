import { afterEach, describe, expect, it, vi } from "vitest";
import type { Application, Request, RequestHandler, Response } from "express";
import type {
  AtlasPlaneAdmissionDecision,
  AtlasRegisteredTool,
} from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { KyselyAtlasToolProposalStore } from "@athyper/server-platform-ai";
import { loadConfig } from "../config/environment.js";
import { createContainer } from "../kernel/container.js";
import {
  registerAtlas,
  type ServiceRegistrationDependencies,
} from "./register-services.js";

const context: VerifiedRequestContext = {
  tenantId: "10000000-0000-4000-8000-000000000001",
  principalId: "10000000-0000-4000-8000-000000000002",
  planeKey: "neon",
  realmKey: "neon",
  authEpoch: 1,
  requestId: "request",
  profileHash: "profile",
  permissions: {
    tenantId: "10000000-0000-4000-8000-000000000001",
    principalId: "10000000-0000-4000-8000-000000000002",
    planeKey: "neon",
    profileHash: "profile",
    principalFingerprint: "principal",
    schemaHash: "schema",
    resolvedAt: 1,
    allowed: ["neon.ai.agent.use"],
    denied: [],
    planLocked: [],
    planeExcluded: [],
    entries: [],
    authorizationScopes: [],
  },
};
const ownerAdmission: AtlasPlaneAdmissionDecision = {
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
const mutation: AtlasRegisteredTool = {
  manifest: {
    schema: "atlas-tool-manifest/1",
    toolCode: "test_owner_mutation",
    version: "1",
    displayName: "Test command",
    description: "Registered test owner command",
    access: "mutation",
    risk: "high",
    allowedPlanes: ["neon"],
    requiredPermissions: ["neon.ai.agent.use"],
    featureKey: "atlas_tools_mutation_enabled",
    inputSchema: {},
    resultSchema: {},
    timeoutMs: 1000,
    maxResultBytes: 1000,
    commandBinding: "test.owner.command",
    confirmation: "explicit_user",
  },
  validatePreview: vi.fn(async () => {}),
};
const read: AtlasRegisteredTool = {
  manifest: {
    ...mutation.manifest,
    toolCode: "test_owner_read",
    access: "read",
    risk: "low",
    commandBinding: undefined,
    confirmation: "none",
  },
  readHandler: { execute: vi.fn(async () => ({ data: {}, sources: [] })) },
};

function providerDependencies(): NonNullable<
  ServiceRegistrationDependencies["ai"]
> {
  // No I/O is required to compose the full provider branch. Unused ports stay inert.
  return {
    admission: { resolve: vi.fn(async () => ownerAdmission) },
    threadRepository: {} as never,
    threadAuthorizer: { authorize: async () => true },
    retention: {
      resolve: async () => ({
        policyId: "default",
        retentionDays: 30,
        displayText: "30 days",
      }),
    },
    modelPolicy: {
      evaluate: async () => ({
        allowed: true,
        policyRevision: "owner-policy-1",
        promptRevision: "1",
      }),
    },
    bindings: [],
    providers: [],
    credentials: { resolve: async () => null },
    runs: {} as never,
    usageLedger: { append: vi.fn() },
    prompts: { resolve: async () => ({ revision: "1", systemText: "Test" }) },
    registeredTools: [mutation, read],
    toolAuthority: {
      authorize: vi.fn(async () => ({
        allowed: true,
        policyRevision: "owner-policy-1",
      })),
    },
    recordGateway: { query: vi.fn() },
    confirmations: { verify: vi.fn(async () => true) },
    commands: {
      execute: vi.fn(async () => ({
        commandId: context.principalId,
        revision: "2",
      })),
    },
    credentialCipher: {
      encrypt: async () => ({ payload: "ciphertext", keyVersion: 1 }),
      decrypt: async () => "secret",
    },
    credentialInvalidation: { publish: vi.fn() },
    knowledgeIndex: {
      index: vi.fn(async () => []),
      search: vi.fn(async () => []),
      remove: vi.fn(),
      health: async () => ({ healthy: true }),
    },
    policyInvalidation: { publish: vi.fn() },
    driftAlerts: { publish: vi.fn() },
    knowledgeJobAuthority: { load: vi.fn() },
  };
}

function compose(
  mutationsEnabled: boolean,
  toolsEnabled = true,
  ownerAllowed = true,
) {
  const container = createContainer();
  const dependencies = providerDependencies();
  dependencies.toolAuthority.authorize = vi.fn(async () => ({
    allowed: ownerAllowed,
    policyRevision: "owner-policy-1",
  }));
  const config = loadConfig();
  registerAtlas(
    container,
    {
      ...config,
      atlas: {
        enabled: true,
        persistenceEnabled: true,
        generationEnabled: true,
        toolsEnabled,
        mutationsEnabled,
      },
    },
    dependencies,
    { neon: {} as never },
    { run: vi.fn() } as never,
    { authenticate: vi.fn() } as never,
  );
  return { container, dependencies };
}

async function resolveAdmission(container: ReturnType<typeof createContainer>) {
  const routes = new Map<string, RequestHandler>();
  const register = (path: string, ...handlers: RequestHandler[]) =>
    routes.set(path, handlers.at(-1)!);
  const app = {
    get: register,
    post: register,
    put: register,
    patch: register,
    delete: register,
  } as unknown as Application;
  for (const registrar of container.platform.httpRegistrars) registrar(app);
  const json = vi.fn();
  const response = {
    locals: { verifiedRequestContext: context },
    status: vi.fn().mockReturnThis(),
    json,
  };
  const next = vi.fn();
  await routes.get("/api/atlas/admission")!(
    {} as Request,
    response as unknown as Response,
    next,
  );
  expect(next).not.toHaveBeenCalled();
  expect(json).toHaveBeenCalledOnce();
  return json.mock.calls[0]![0] as AtlasPlaneAdmissionDecision;
}

function preview(
  container: ReturnType<typeof createContainer>,
  tool = mutation,
) {
  return container.platform.ai!.tools!.preview({
    context,
    threadId: context.tenantId,
    runId: context.principalId,
    callId: tool.manifest.toolCode,
    toolCode: tool.manifest.toolCode,
    toolVersion: "1",
    arguments: {},
    summary: "Test owner tool",
    ...(tool.manifest.access === "mutation"
      ? {
          affectedEntityType: "test_entity",
          affectedEntityId: context.principalId,
          expectedRowVersion: 1,
        }
      : {}),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("Atlas full-provider deployment gates", () => {
  it("denies mutation admission and direct preview despite permissive injected owner ports", async () => {
    vi.spyOn(
      KyselyAtlasToolProposalStore.prototype,
      "propose",
    ).mockImplementation(async ({ proposal }) => ({
      kind: "created",
      proposal,
    }));
    const deny = vi
      .spyOn(KyselyAtlasToolProposalStore.prototype, "deny")
      .mockResolvedValue({ kind: "conflict", proposal: null });
    const { container, dependencies } = compose(false);
    expect(await resolveAdmission(container)).toMatchObject({
      chatAllowed: true,
      readToolsAllowed: true,
      mutationToolsAllowed: false,
    });
    await expect(preview(container)).rejects.toMatchObject({
      code: "TOOL_DENIED",
    });
    expect(deny).toHaveBeenCalledOnce();
    expect(mutation.validatePreview).not.toHaveBeenCalled();
    expect(dependencies.commands.execute).not.toHaveBeenCalled();
    expect(await preview(container, read)).toMatchObject({
      access: "read",
      confirmationRequired: false,
    });
  });

  it("reauthorizes an outstanding confirmed proposal after recomposition with mutations disabled", async () => {
    const propose = vi
      .spyOn(KyselyAtlasToolProposalStore.prototype, "propose")
      .mockImplementation(async ({ proposal }) => ({
        kind: "created",
        proposal,
      }));
    const enabled = compose(true);
    const approved = await preview(enabled.container);
    const proposal = {
      ...propose.mock.calls[0]![0].proposal,
      status: "confirmed" as const,
    };
    vi.spyOn(KyselyAtlasToolProposalStore.prototype, "get").mockResolvedValue(
      proposal,
    );
    const deny = vi
      .spyOn(KyselyAtlasToolProposalStore.prototype, "deny")
      .mockResolvedValue({
        kind: "transitioned",
        proposal: { ...proposal, status: "denied" },
      });
    const begin = vi.spyOn(
      KyselyAtlasToolProposalStore.prototype,
      "beginExecution",
    );
    const disabled = compose(false);
    await expect(
      disabled.container.platform.ai!.tools!.run({
        context,
        proposalId: approved.proposalId,
        arguments: {},
      }),
    ).rejects.toMatchObject({ code: "TOOL_DENIED" });
    expect(deny).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "policy_revision_changed" }),
    );
    expect(begin).not.toHaveBeenCalled();
    expect(disabled.dependencies.commands.execute).not.toHaveBeenCalled();

    vi.mocked(KyselyAtlasToolProposalStore.prototype.get).mockResolvedValue({
      ...proposal,
      status: "completed",
    });
    await expect(
      disabled.container.platform.ai!.tools!.run({
        context,
        proposalId: approved.proposalId,
        arguments: {},
      }),
    ).rejects.toMatchObject({ code: "TOOL_DENIED" });
  });

  it("retains confirmation and owner denial when the mutation deployment gate is enabled", async () => {
    vi.spyOn(
      KyselyAtlasToolProposalStore.prototype,
      "propose",
    ).mockImplementation(async ({ proposal }) => ({
      kind: "created",
      proposal,
    }));
    vi.spyOn(KyselyAtlasToolProposalStore.prototype, "deny").mockResolvedValue({
      kind: "conflict",
      proposal: null,
    });
    const allowed = compose(true);
    expect(await resolveAdmission(allowed.container)).toMatchObject({
      readToolsAllowed: true,
      mutationToolsAllowed: true,
    });
    expect(await preview(allowed.container)).toMatchObject({
      confirmationRequired: true,
      autonomyDecision: "assist",
    });
    const denied = compose(true, true, false);
    await expect(preview(denied.container)).rejects.toMatchObject({
      code: "TOOL_DENIED",
    });
    expect(denied.dependencies.commands.execute).not.toHaveBeenCalled();
  });

  it("disables both tool types when the tools deployment gate is off", async () => {
    vi.spyOn(
      KyselyAtlasToolProposalStore.prototype,
      "propose",
    ).mockImplementation(async ({ proposal }) => ({
      kind: "created",
      proposal,
    }));
    vi.spyOn(KyselyAtlasToolProposalStore.prototype, "deny").mockResolvedValue({
      kind: "conflict",
      proposal: null,
    });
    const { container } = compose(true, false);
    expect(await resolveAdmission(container)).toMatchObject({
      chatAllowed: true,
      readToolsAllowed: false,
      mutationToolsAllowed: false,
    });
    await expect(preview(container)).rejects.toMatchObject({
      code: "TOOL_DENIED",
    });
    await expect(preview(container, read)).rejects.toMatchObject({
      code: "TOOL_DENIED",
    });
  });
});
