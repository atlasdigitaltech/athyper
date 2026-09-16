import { Kysely, DummyDriver, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { VerifiedToken } from "@athyper/server-contract-auth";
import type {
  GeneratedDocument,
  PublishedDocumentTemplate,
} from "@athyper/server-contract-documents";
import { createInMemoryAuditSink } from "@athyper/server-platform-audit";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { loadConfig } from "../../config/index.js";
import { createContainer } from "../create-container.js";
import { registerPlatform } from "../register-platform.js";
import { registerServices } from "../register-services.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

describe("Documents host vertical", () => {
  it("authenticates, renders through the container boundary, persists, and creates a download URL", async () => {
    const tenantId = "11111111-1111-4111-8111-111111111111",
      principalId = "22222222-2222-4222-8222-222222222222",
      entityId = "33333333-3333-4333-8333-333333333333",
      documentId = "44444444-4444-4444-8444-444444444444";
    const token: VerifiedToken = {
      issuer: "https://iam.example/realms/athyper",
      subject: principalId,
      audience: ["athyper-api"],
      claims: {
        iss: "https://iam.example/realms/athyper",
        sub: principalId,
        aud: "athyper-api",
        tenant_id: tenantId,
        principal_id: principalId,
        auth_epoch: 1,
        azp: "neon-web",
        permissions: ["documents.render", "documents.download"],
        resource_access: { "neon-web": { roles: ["AUTHORIZED"] } },
      },
    };
    const template: PublishedDocumentTemplate = {
      bindingId: "55555555-5555-4555-8555-555555555555",
      templateId: "66666666-6666-4666-8666-666666666666",
      templateVersionId: "77777777-7777-4777-8777-777777777777",
      version: 2,
      checksum: "a".repeat(64),
      name: "Invoice",
      engine: "handlebars",
      locale: "en",
      variant: "default",
      html: "<h1>{{invoice.number}}</h1>",
      renderOptions: { format: "A4" },
    };
    const stored = new Map<string, Uint8Array>();
    let artifact: (GeneratedDocument & { storageKey: string }) | undefined;
    // This generic invoice has no supplier process binding. The host now checks
    // that through its transaction port before falling back to document authority.
    const transaction = new Kysely({dialect:{createDriver:()=>new DummyDriver(),createAdapter:()=>new PostgresAdapter(),createIntrospector:db=>new PostgresIntrospector(db),createQueryCompiler:()=>new PostgresQueryCompiler()}});
    const container = createContainer();
    const audit = createInMemoryAuditSink();
    const config = loadConfig();
    registerPlatform(
      container,
      {
        ...config,
        env: "production",
        iam: {
          ...config.iam,
          defaultRealmKey: "athyper",
          claimContextMode: "on",
        },
      },
      {
        tokenVerifier: { verify: async () => token },
        resolveIdentityContext: async () => ({
          tenantId,
          principalId,
          authEpoch: 1,
        }),
        auditSink: audit,
      },
    );
    registerServices(container, {
      metadata: {
        getEntityDescriptor: async () => ({
          schema: "athyper.entity-runtime-descriptor/1.0",
          entityCode: "invoice",
          planeKey: "neon",
          releaseId: "release-1",
          releaseNo: 1,
          contractHash: "a".repeat(64),
          compiledHash: "b".repeat(64),
          storage: {
            schema: "document",
            object: "invoice",
            idField: "id",
            tenantField: "tenant_id",
          },
          fields: [],
          operations: {
            print: { code: "print", permissionCode: "documents.render" },
          },
        }),
      },
      documentTemplateRepository: { resolvePublished: async () => template },
      documentArtifactRepository: {
        save: async (input) => {
          artifact = {
            id: documentId,
            entityType: input.entityType,
            entityId: input.entityId,
            fileName: input.fileName,
            contentType: "application/pdf",
            sizeBytes: input.sizeBytes,
            sha256: input.sha256,
            templateId: template.templateId,
            templateVersionId: template.templateVersionId,
            templateVersion: template.version,
            createdAt: "2026-08-09T00:00:00.000Z",
            storageKey: input.storageKey,
          };
          return artifact;
        },
        findAccessible: async () => artifact ?? null,
        findIdempotent: async () => null,
      },
      documentRenderer: {
        renderPdf: async (request) => {
          expect(request.html).toContain("INV-100");
          return {
            bytes: new TextEncoder().encode("%PDF-host"),
            mediaType: "application/pdf",
            provider: "gotenberg",
            durationMs: 4,
          };
        },
      },
      malwareScanner: {
        scan: async () => ({
          status: "clean",
          scanner: "clamav",
          scannedAt: "2026-08-09T00:00:00.000Z",
          durationMs: 2,
        }),
      },
      objectStorageDocuments: {
        put: async (key, body) => {
          stored.set(
            key,
            typeof body === "string" ? new TextEncoder().encode(body) : body,
          );
        },
        get: async (key) => stored.get(key)!,
        delete: async (key) => {
          stored.delete(key);
        },
        exists: async (key) => stored.has(key),
        createDownloadUrl: async (key) => `https://objects.example/${key}`,
      },
      objectStorageDocumentsBucket: "athyper-local",
      transactions: { run: async (_plane: unknown, _actor: unknown, work: (tx: typeof transaction) => unknown) => work(transaction) } as never,
      outbox: { append: async () => undefined },
    });
    const app = createHttpApplication({
      exposeErrorDetails: true,
      configure(application) {
        for (const register of container.platform.httpRegistrars)
          register(application);
      },
    });
    const baseUrl = await listen(app);
    const rendered = await fetch(`${baseUrl}/api/documents/render`, {
      method: "POST",
      headers: {
        authorization: "Bearer signed-token",
        "x-plane": "neon",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        entityType: "invoice",
        entityId,
        operationCode: "print",
        data: { invoice: { number: "INV-100" } },
      }),
    });
    const renderedPayload = (await rendered.json()) as Record<string, unknown>;
    expect(rendered.status, JSON.stringify(renderedPayload)).toBe(201);
    expect(renderedPayload).toMatchObject({
      entityType: "invoice",
      templateVersion: 2,
    });
    expect(stored.size).toBe(1);
    const download = await fetch(
      `${baseUrl}/api/documents/${documentId}/download`,
      {
        method: "POST",
        headers: { authorization: "Bearer signed-token", "x-plane": "neon" },
      },
    );
    expect(download.status).toBe(200);
    await expect(download.json()).resolves.toMatchObject({
      url: expect.stringContaining("https://objects.example/generated/neon/"),
      expiresInSeconds: 300,
    });
    expect(audit.events.map((event) => event.eventCode)).toEqual(
      expect.arrayContaining([
        "documents.artifact.rendered",
        "documents.download_url.created",
      ]),
    );
  });
});
async function listen(
  app: ReturnType<typeof createHttpApplication>,
): Promise<string> {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}
