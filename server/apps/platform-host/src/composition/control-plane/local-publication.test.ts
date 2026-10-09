import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { LocalPublicationRequest } from "@athyper/server-contract-publication";
const ports = vi.hoisted(() => ({
  authorize: vi.fn(),
  gate: vi.fn(),
  authority: vi.fn(),
  inputs: vi.fn(),
}));
vi.mock("@athyper/server-platform-iam", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@athyper/server-platform-iam")>();
  return {
    createPermissionAuthorizer: (options: any) => {
      ports.gate(options.policyGate);
      return {
        authorize: async (input: any) => {
          const policy = await options.policyGate.evaluate(input);
          if (!policy.allowed) return { allowed: false };
          const decision = await actual
            .createPermissionAuthorizer(options)
            .authorize(input);
          return decision.allowed ? ports.authorize(input) : decision;
        },
      };
    },
    createIamAuthenticationMiddleware: vi.fn(),
    readVerifiedRequestContext: vi.fn(),
  };
});
vi.mock("../shared/publication/local-publication-policy.js", () => ({
  resolveLocalPublicationAuthority: ports.authority,
}));
vi.mock("../shared/publication/local-publication-inputs.js", () => ({
  resolveLocalPublicationInputs: ports.inputs,
}));
import { createLocalPublicationAdmission } from "./local-publication.js";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
it("admission commits one server-built request, replays exactly and rejects caller-selected pins", async () => {
  const host = {
    environment: "local",
    instance: "dev",
    domainSuffix: "dev.athyper.test",
  };
  const configuration = {
    ...host,
    tenantId: id(1),
    realmKey: "platform-control",
    author: {
      principalId: id(3),
      code: "dev.metadata.author",
      authEpoch: 1,
      credentialSha256: "a".repeat(64),
    },
    publisher: {
      principalId: id(4),
      code: "dev.metadata.publisher",
      authEpoch: 1,
      credentialSha256: "b".repeat(64),
    },
    localAuthority: { id: id(5), version: 1, hash: "a".repeat(64) },
  };
  const authority = {
    schema: "athyper.local-development-authority/1",
    ...configuration.localAuthority,
    active: true,
    enrollmentReceiptId: "fixture",
    validFrom: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    host,
    scope: { kind: "product" },
    developerPrincipalIds: [id(2)],
    authorWorkloadId: id(3),
    publisherWorkloadId: id(4),
    actions: ["publish"],
    destinations: [{ plane: "studio", instance: "dev" }],
  };
  ports.authorize.mockResolvedValue({ allowed: true });
  ports.authority.mockResolvedValue(authority);
  ports.inputs.mockResolvedValue({
    changeSetId: id(6),
    revision: 1,
    sourceHash: "b".repeat(64),
    compilerHash: "c".repeat(64),
    resourceHashes: [],
    targets: [
      {
        plane: "studio",
        instance: "dev",
        predecessorHash: null,
        artifactHash: "d".repeat(64),
      },
    ],
  });
  let stored: LocalPublicationRequest | null = null;
  const query = vi.fn(async (text: string, params: unknown[] = []) => {
    if (text.includes("admit_local_publication_command")) {
      stored = JSON.parse(params[0] as string);
      return { rows: [{ hash: stored!.hash }] };
    }
    return {
      rows: text.includes("FROM master.principal")
        ? [{ id: id(2) }]
        : text.includes("read_local_publication_admission")
          ? [{ request: stored }]
          : text.includes("read_native_product_review_source")
            ? [{ revision: 1, status: "draft" }]
            : [],
    };
  });
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  const audit = {
    record: vi.fn(async (input: any) => ({ ...input, id: "audit" })),
  };
  const context = {
    planeKey: "studio",
    tenantId: id(1),
    principalId: id(2),
    realmKey: "platform-control",
    assurance: "standard",
    authEpoch: 1,
    permissions: {
      tenantId: id(1),
      principalId: id(2),
      planeKey: "studio",
      allowed: ["studio.metadata.contract.edit"],
      denied: [],
      planLocked: [],
      planeExcluded: [],
      authorizationScopes: [],
      requirements: [
        {
          permissionCode: "studio.metadata.contract.edit",
          riskTier: "high",
          requiresMfa: false,
          requiresSod: false,
          entitled: true,
        },
      ],
    },
  } as unknown as VerifiedRequestContext;
  try {
    const admit = createLocalPublicationAdmission({
      database: db,
      authority: {
        tenantId: id(1),
        realmKey: "platform-control",
        issuer: "https://identity.dev.athyper.test/realms/platform-control",
        audience: "athyper-platform-control-api",
      },
      audit,
      configuration,
      source: vi.fn().mockResolvedValue({}),
    });
    const command = { requestId: id(7), expectedRevision: 1 };
    const first = await admit(context, id(6), command);
    expect(first).toMatchObject({ stage: "admitted", replayed: false });
    expect(
      (stored as unknown as LocalPublicationRequest).admission
        .developerPrincipalId,
    ).toBe(id(2));
    expect(query.mock.calls.some(([sql]) => sql === "commit")).toBe(true);
    expect(await admit(context, id(6), command)).toEqual({
      ...first,
      replayed: true,
    });
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: "metadata.entity.local.admission",
        actor: { kind: "user", principalId: context.principalId },
        metadata: expect.objectContaining({
          basis: "local_development_authority",
        }),
      }),
      expect.anything(),
    );
    const gate = ports.gate.mock.calls[0]![0];
    expect(
      await gate.evaluate({
        context,
        permissionCode: "studio.metadata.contract.edit",
        resource: { tenantId: id(1), changeSetId: id(99) },
      }),
    ).toEqual({ allowed: false });
    ports.authority.mockResolvedValueOnce({
      ...authority,
      hash: "e".repeat(64),
    });
    await expect(admit(context, id(6), command)).rejects.toThrow("request ID");
    ports.authority.mockResolvedValueOnce({
      ...authority,
      developerPrincipalIds: [id(99)],
    });
    await expect(admit(context, id(6), command)).rejects.toThrow(
      "authoring authority",
    );
    await expect(
      admit(context, id(6), { ...command, expectedRevision: 2 }),
    ).rejects.toThrow("request ID");
    await expect(
      admit(context, id(6), { ...command, authority: { active: true } } as any),
    ).rejects.toThrow("saved revision");
    const denied = {
      ...context,
      permissions: {
        ...context.permissions,
        denied: ["studio.metadata.contract.edit"],
      },
    };
    await expect(admit(denied, id(6), command)).rejects.toThrow(
      "authoring authority",
    );
    ports.authorize.mockResolvedValue({ allowed: false });
    query.mockClear();
    await expect(admit(context, id(6), command)).rejects.toThrow(
      "authoring authority",
    );
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes("read_local_publication_admission"),
      ),
    ).toBe(false);
  } finally {
    await db.destroy();
  }
});
