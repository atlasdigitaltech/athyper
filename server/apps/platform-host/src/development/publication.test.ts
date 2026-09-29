import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import express from "express";
import { Kysely, PostgresDialect } from "kysely";
import {
  DevelopmentPublicationWorkflow,
  type DevelopmentPublicationPorts,
} from "@athyper/server-plane-studio";
import {
  loadDevPublicationConfiguration,
  registerDevPublicationRoutes,
  verifyDevPublicationCredential,
} from "./publication.js";

const author = randomBytes(32).toString("base64url"),
  publisher = randomBytes(32).toString("base64url");
const credential = (role: string, secret: string) => ({
  principalId: randomUUID(),
  code: `dev.metadata.${role}`,
  authEpoch: 0,
  digest: createHash("sha256").update(secret).digest("hex"),
});
const config = {
  schemaVersion: 1 as const,
  instance: "dev" as const,
  tenantId: randomUUID(),
  tenantCode: "cirrusatlantic",
  entityCode: "business_partner",
  targets: ["neon" as const],
  author: credential("author", author),
  publisher: credential("publisher", publisher),
};
const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function env(value = config) {
  const dir = mkdtempSync(join(tmpdir(), "dev-publication-test-"));
  directories.push(dir);
  const path = join(dir, "server.json");
  writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  return {
    ATHYPER_ENV: "local",
    ATHYPER_DOMAIN_SUFFIX: "dev.athyper.test",
    ATHYPER_DEV_PRESET: "devfull",
    ATHYPER_DEV_PUBLICATION_CONFIG: path,
  };
}
describe("DEVFULL workload boundary", () => {
  it("is disabled by default and requires explicit DEVFULL configuration", () => {
    expect(loadDevPublicationConfiguration({}, "local")).toBeUndefined();
    expect(loadDevPublicationConfiguration(env(), "local")).toEqual(config);
    for (const patch of [
      { ATHYPER_ENV: "production" },
      { ATHYPER_DOMAIN_SUFFIX: "qa.athyper.test" },
      { ATHYPER_DEV_PRESET: "devsimple" },
    ])
      expect(() =>
        loadDevPublicationConfiguration({ ...env(), ...patch }, "local"),
      ).toThrow("DEVFULL_ONLY");
    expect(() => loadDevPublicationConfiguration(env(), "production")).toThrow(
      "DEVFULL_ONLY",
    );
  });
  it("rejects writable configuration and a shared author/publisher identity", () => {
    const settings = env();
    chmodSync(settings.ATHYPER_DEV_PUBLICATION_CONFIG, 0o666);
    expect(() => loadDevPublicationConfiguration(settings, "local")).toThrow(
      "CONFIG_UNTRUSTED",
    );
    expect(() =>
      loadDevPublicationConfiguration(
        env({
          ...config,
          publisher: {
            ...config.publisher,
            principalId: config.author.principalId,
          },
        }),
        "local",
      ),
    ).toThrow("DISTINCT_IDENTITIES");
  });
  it("authenticates each secret independently", () => {
    expect(() =>
      verifyDevPublicationCredential(author, config.author),
    ).not.toThrow();
    for (const invalid of [undefined, "", publisher, "catl.admin"])
      expect(() =>
        verifyDevPublicationCredential(invalid, config.author),
      ).toThrow("AUTH_REQUIRED");
  });
  it("rejects a missing publisher credential before accessing the database or service", async () => {
    const app = express();
    app.use(express.json());
    const transaction = vi.fn();
    registerDevPublicationRoutes(app, {
      config,
      database: { transaction } as never,
      service: {} as never,
      audit: {} as never,
    });
    const server = createServer(app);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const response = await fetch(
        `http://127.0.0.1:${(server.address() as { port: number }).port}/api/dev-publication/publish`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${author}`,
            "content-type": "application/json",
          },
          body: "{}",
        },
      );
      expect(response.status).toBe(403);
      expect(transaction).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("checks live principal revocation, tenant scope, and persists approval evidence with a transaction", async () => {
    let revoked = false;
    const query = vi.fn(async (text: string, parameters?: unknown[]) => ({
      rows: text.includes("FROM master.principal")
        ? revoked
          ? []
          : [
              {
                auth_epoch: 0,
                metadata: {
                  devPublication: {
                    role: parameters?.includes(config.author.principalId)
                      ? "author"
                      : "publisher",
                    instance: "dev",
                  },
                },
              },
            ]
        : [],
    }));
    const database = new Kysely<Record<string, never>>({
      dialect: new PostgresDialect({
        pool: {
          connect: async () => ({ query, release: () => {} }),
          end: async () => {},
        } as never,
      }),
    });
    const record = vi.fn(async () => ({}));
    // Exercise the real HTTP authentication/context/audit adapter; workflow behavior has separate contract tests.
    vi.spyOn(
      DevelopmentPublicationWorkflow.prototype,
      "run",
    ).mockImplementation(async function (this: DevelopmentPublicationWorkflow) {
      await (
        this as unknown as { ports: DevelopmentPublicationPorts }
      ).ports.record({
        event: "metadata.development_publication.approved",
        savedHash: "verified-hash",
        mode: "development_auto_approval",
      });
      return { status: "planned" } as never;
    });
    const app = express();
    app.use(express.json());
    registerDevPublicationRoutes(app, {
      config,
      database,
      service: {} as never,
      audit: { record } as never,
    });
    const server = createServer(app);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const body = {
      entityCode: config.entityCode,
      scope: { kind: "tenant", tenantId: config.tenantId },
      targets: ["neon"],
      overlay: "intake-presentation",
    };
    const post = (data: unknown) =>
      fetch(
        `http://127.0.0.1:${(server.address() as { port: number }).port}/api/dev-publication/publish`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${author}`,
            "x-dev-publisher-credential": publisher,
            "content-type": "application/json",
          },
          body: JSON.stringify(data),
        },
      );
    try {
      expect((await post({ ...body, scope: { kind: "product" } })).status).toBe(
        409,
      );
      expect(record).not.toHaveBeenCalled();
      revoked = true;
      expect((await post(body)).status).toBe(403);
      expect(record).not.toHaveBeenCalled();
      revoked = false;
      expect((await post(body)).status).toBe(200);
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventCode: "metadata.development_publication.approved",
          actor: { kind: "service", principalId: config.publisher.principalId },
          metadata: expect.objectContaining({
            authorId: config.author.principalId,
            savedHash: "verified-hash",
            mode: "development_auto_approval",
          }),
        }),
        expect.objectContaining({ isTransaction: true }),
      );
      expect(query.mock.calls.some((c) => c[0] === "commit")).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await database.destroy();
    }
  });
});

describe("pinned DEV intake prerequisites", () => {
  it("requires independent review, exact scope/revision/hash and all intake surfaces", async () => {
    const { admitDevIntakePrerequisite } = await import("./publication.js");
    const { sha256 } = await import("@athyper/server-plane-studio");
    const graph = {
      entity: { entityCode: "business_partner" },
      surfaces: ["intake_partner", "intake_details", "intake_review"].map(
        (surfaceKey) => ({ surfaceKey, status: "active" }),
      ),
    } as any;
    const source = {
      id: randomUUID(),
      tenantId: config.tenantId,
      entityCode: config.entityCode,
      status: "approved",
      revision: 63,
      createdBy: randomUUID(),
      submittedBy: randomUUID(),
      approvedBy: randomUUID(),
    } as any;
    const pinned = {
      ...config,
      intakePrerequisite: {
        changeSetId: source.id,
        revision: 63,
        contractHash: sha256(graph),
      },
    };
    expect(
      admitDevIntakePrerequisite(pinned, source, graph).surfaces,
    ).toHaveLength(3);
    for (const patch of [
      { status: "draft" },
      { revision: 64 },
      { tenantId: randomUUID() },
      { entityCode: "other" },
      { approvedBy: source.createdBy },
      { approvedBy: source.submittedBy },
    ])
      expect(() =>
        admitDevIntakePrerequisite(pinned, { ...source, ...patch }, graph),
      ).toThrow("DEV_PUBLICATION_PREREQUISITE_REVIEW_REQUIRED");
    expect(() =>
      admitDevIntakePrerequisite(pinned, source, { ...graph, surfaces: [] }),
    ).toThrow("DEV_PUBLICATION_PREREQUISITE_CHANGED");
    const incomplete = { ...graph, surfaces: [] };
    expect(() =>
      admitDevIntakePrerequisite(
        {
          ...pinned,
          intakePrerequisite: {
            ...pinned.intakePrerequisite,
            contractHash: sha256(incomplete),
          },
        },
        source,
        incomplete,
      ),
    ).toThrow("DEV_PUBLICATION_INTAKE_SURFACES_NOT_PUBLISHED");
  });
});

describe("intake prerequisite retry", () => {
  it("reuses the reviewed projection after authoring IDs are regenerated, but rejects descriptor drift", async () => {
    const { reusePublishedIntakePrerequisite } =
      await import("./publication.js");
    const { baselineJsonHash } = await import("@athyper/server-plane-studio");
    const descriptor = { intakeSurfaces: [{ key: "intake_partner" }] };
    const marker = {
      publicationKey: "intake-test",
      descriptor,
      descriptorHash: baselineJsonHash(descriptor),
    };
    const proposed = {
      entity: { entityCode: "business_partner" },
      surfaces: [
        { id: "source", layoutConfig: { runtimeRestoration: marker } },
      ],
    } as any;
    const published = structuredClone(proposed);
    published.surfaces[0].id = "persisted";
    expect(reusePublishedIntakePrerequisite(published, proposed)).toBe(
      published,
    );
    published.surfaces[0].layoutConfig.runtimeRestoration.descriptor.intakeSurfaces =
      [];
    expect(reusePublishedIntakePrerequisite(published, proposed)).toBe(
      proposed,
    );
  });
});
