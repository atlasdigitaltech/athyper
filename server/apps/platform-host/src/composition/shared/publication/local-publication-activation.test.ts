import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { authorizeLocalPublicationActivation } from "./local-publication-activation.js";
it("rechecks current local authority and each destination before the shared activation protocol", async () => {
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
  const request = {
    authority: configuration.localAuthority,
    admission: { publisherWorkloadId: "publisher", authorWorkloadId: "author" },
    inputs: { targets: [{ plane: "neon", instance: "dev" }] },
  };
  const row = {
    release_id: "release",
    metadata: { approvalBasis: "local_development_authority" },
    target_plane: "neon",
    target_environment: "local",
    target_instance: "dev",
  };
  let revoked = false;
  const query = vi.fn(async (text: string) => {
    if (text.includes("local_publication_execution_context") && revoked)
      throw Error("authority revoked");
    return {
      rows: text.includes("FROM publication.deployment")
        ? [row]
        : text.includes("FROM master.principal")
          ? [{ id: "publisher" }]
          : text.includes("local_publication_execution_context")
            ? [{ value: { request } }]
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
  const options = {
    authority: db,
    target: db,
    deploymentId: "deployment",
    configuration,
  };
  try {
    await expect(
      authorizeLocalPublicationActivation(options),
    ).resolves.toBeUndefined();
    row.target_instance = "qa";
    await expect(authorizeLocalPublicationActivation(options)).rejects.toThrow(
      "ACTIVATION_DENIED",
    );
    row.target_instance = "dev";
    await expect(
      authorizeLocalPublicationActivation({
        ...options,
        configuration: { ...configuration, instance: "qa" },
      }),
    ).rejects.toThrow("DEV_ONLY");
    request.authority = { ...configuration.localAuthority, version: 2 };
    await expect(authorizeLocalPublicationActivation(options)).rejects.toThrow(
      "ACTIVATION_DENIED",
    );
    request.authority = configuration.localAuthority;
    revoked = true;
    await expect(authorizeLocalPublicationActivation(options)).rejects.toThrow(
      "authority revoked",
    );
  } finally {
    await db.destroy();
  }
});
