import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
const ports = vi.hoisted(() => ({ resolve: vi.fn(), actor: vi.fn() }));
vi.mock("./local-publication-policy.js", () => ({
  resolveLocalPublicationAuthority: ports.resolve,
}));
vi.mock("./deployment-recovery-authority.js", () => ({
  assertPublicationWorkloadActor: ports.actor,
}));
import { installLocalPublicationConfiguration } from "./local-publication-installation.js";
it("installs only a current reviewed authority, preserves host identity and replays without policy writes", async () => {
  const host = {
    environment: "local",
    instance: "dev",
    domainSuffix: "dev.athyper.test",
  };
  const config = {
    ...host,
    tenantId: "tenant",
    realmKey: "platform-control",
    author: { principalId: "author" },
    publisher: { principalId: "publisher" },
    localAuthority: { id: "policy", version: 1, hash: "a".repeat(64) },
  };
  const authority = {
    host,
    authorWorkloadId: "author",
    publisherWorkloadId: "publisher",
  };
  let stored: unknown;
  const query = vi.fn(async (text: string) => ({
    rows:
      text.includes("SELECT identity") && stored ? [{ identity: stored }] : [],
  }));
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  const run = (value = config) =>
    db
      .transaction()
      .execute((tx) =>
        installLocalPublicationConfiguration(tx, value as never),
      );
  ports.resolve.mockResolvedValue(authority);
  try {
    await expect(run()).resolves.toMatchObject({
      host,
      authority: config.localAuthority,
      reused: false,
    });
    expect(
      query.mock.calls.filter(([q]) => q.startsWith("INSERT")),
    ).toHaveLength(1);
    stored = host;
    await expect(run()).resolves.toMatchObject({ reused: true });
    expect(
      query.mock.calls.filter(([q]) => q.startsWith("INSERT")),
    ).toHaveLength(1);
    ports.resolve.mockRejectedValueOnce(Error("inactive policy"));
    await expect(run()).rejects.toThrow("inactive policy");
    await expect(run({ ...config, instance: "qa" })).rejects.toThrow(
      "DEV_ONLY",
    );
    ports.resolve.mockResolvedValueOnce({
      ...authority,
      publisherWorkloadId: "other",
    });
    await expect(run()).rejects.toThrow("SCOPE_MISMATCH");
    stored = { ...host, instance: "qa" };
    await expect(run()).rejects.toThrow("INSTALLED_HOST_MISMATCH");
    expect(query.mock.calls.at(-1)?.[0]).toBe("rollback");
    expect(
      query.mock.calls.some(([q]) =>
        /^(INSERT|UPDATE|DELETE).*control\./.test(q),
      ),
    ).toBe(false);
  } finally {
    await db.destroy();
  }
});
