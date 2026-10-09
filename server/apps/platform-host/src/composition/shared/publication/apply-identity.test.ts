import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { coordinatedApplyPrincipal } from "./apply-identity.js";

it("selects the enrolled publisher for recovered local deployments and rejects invalid authority", async () => {
  const configuration = {
    environment: "local",
    instance: "dev",
    domainSuffix: "dev.athyper.test",
    tenantId: "tenant",
    realmKey: "platform-control",
    author: {
      principalId: "author",
      code: "author",
      authEpoch: 1,
      credentialSha256: "a".repeat(64),
    },
    publisher: {
      principalId: "publisher",
      code: "publisher",
      authEpoch: 1,
      credentialSha256: "b".repeat(64),
    },
    localAuthority: { id: "authority", version: 1, hash: "c".repeat(64) },
  };

  const metadata: Record<string, unknown> = {
    approvalBasis: "local_development_authority",
    localPublicationRequest: {
      authority: configuration.localAuthority,
      admission: {
        publisherWorkloadId: "publisher",
        authorWorkloadId: "author",
      },
    },
  };
  let actorActive = true;
  const query = vi.fn(async (text: string) => ({
    rows: text.includes("FROM publication.deployment")
      ? [{ metadata, created_by: "publisher" }]
      : text.includes("FROM master.principal") && actorActive
        ? [{ id: "publisher" }]
        : [],
  }));
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  const options = {
    authority: db,
    target: db,
    configuration,
    execution: {
      planeKey: "studio" as const,
      scope: "tenant" as const,
      tenantId: "tenant",
      principalId: configuration.publisher.principalId,
    },
    plane: "neon" as const,
    deploymentId: "deployment",
  };
  try {
    await expect(coordinatedApplyPrincipal(options)).resolves.toBe("publisher");
    await expect(
      coordinatedApplyPrincipal({
        ...options,
        execution: { ...options.execution, principalId: "generic-worker" },
      }),
    ).rejects.toThrow("LOCAL_PUBLICATION_APPLIER_MISMATCH");
    await expect(
      coordinatedApplyPrincipal({ ...options, configuration: undefined }),
    ).rejects.toThrow("LOCAL_PUBLICATION_AUTHORITY_NOT_CONFIGURED");
    await expect(
      coordinatedApplyPrincipal({
        ...options,
        configuration: { ...configuration, instance: "qa" },
      }),
    ).rejects.toThrow("DEV_ONLY");
    actorActive = false;
    await expect(coordinatedApplyPrincipal(options)).rejects.toThrow(
      "WORKLOAD_REVOKED",
    );
    actorActive = true;
    delete metadata.approvalBasis;
    delete metadata.localPublicationRequest;
    await expect(coordinatedApplyPrincipal(options)).resolves.toBeUndefined();
  } finally {
    await db.destroy();
  }
});
