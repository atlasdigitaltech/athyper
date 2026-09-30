/** Opt-in qualification of deployed Postgres, MinIO, Gotenberg and ClamAV.
 * Supply a dedicated seeded tenant and the application's runtime credentials.
 * Uses production repositories and committed transactions; never disables RLS.
 */
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Kysely, sql, type Transaction } from "kysely";
import {
  createPostgresDialect,
  createPostgresPool,
  stampTransactionActor,
} from "@athyper/server-adapter-db-core";
import { createClamAvMalwareScanner } from "@athyper/server-adapter-malware-clamav";
import { createS3ObjectStorageAdapter } from "@athyper/server-adapter-object-storage-s3";
import { createGotenbergRenderer } from "@athyper/server-adapter-rendering";
import {
  createAttachmentLifecycle,
  createKyselyAttachmentRepository,
  createKyselyAttachmentQuotaLedger,
  createConfiguredAttachmentQuotaPolicyResolver,
} from "@athyper/server-service-attachments";
import {
  createDocumentService,
  createKyselyDocumentArtifactRepository,
  createKyselyDocumentTemplateRepository,
  createNotificationAttachmentResolver,
} from "@athyper/server-service-documents";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import { eicar, faultProxy } from "./qualify-document-malware.js";

type DB = Record<string, never>;
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

async function main() {
  assert(
    process.env.QUALIFY_RUNTIME_ENV_FILE &&
      process.env.QUALIFY_SEED_FILE &&
      process.env.QUALIFY_OUTPUT,
    "QUALIFY_RUNTIME_ENV_FILE, QUALIFY_SEED_FILE and QUALIFY_OUTPUT are required",
  );
  const env = JSON.parse(
    await readFile(process.env.QUALIFY_RUNTIME_ENV_FILE, "utf8"),
  ) as Record<string, string>;
  const seed = JSON.parse(
    await readFile(process.env.QUALIFY_SEED_FILE, "utf8"),
  ) as {
    tenantId: string;
    principalId: string;
    otherTenantId: string;
    runId: string;
  };
  for (const value of Object.values(seed))
    assert(/^[a-f0-9-]{36}$/.test(value));
  const output = resolve(process.env.QUALIFY_OUTPUT);
  const { tenantId, principalId, otherTenantId } = seed;
  const planeKey = "neon" as const,
    entityId = randomUUID();
  const identity = (attachmentId: string) => ({
    planeKey,
    tenantId,
    principalId,
    attachmentId,
  });
  const db = new Kysely<DB>({
    dialect: createPostgresDialect(
      createPostgresPool({ connectionString: env.DATABASE_URL!, max: 3 }),
    ),
  });
  const transactions: PlaneTransactionCoordinator<Transaction<DB>> = {
    run: async (plane, actor, work) => {
      assert.equal(plane, "neon");
      return db.transaction().execute(async (tx) => {
        await stampTransactionActor(tx, actor);
        return work(tx);
      });
    },
  };
  const runtimeStorage = createS3ObjectStorageAdapter({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION ?? "us-east-1",
    bucket: env.S3_BUCKET_DOCUMENTS!,
    accessKeyId: env.APP_S3_ACCESS_KEY,
    secretAccessKey: env.APP_S3_SECRET_KEY,
    forcePathStyle: true,
  });
  const keys = new Set<string>(),
    ids = new Set<string>();
  const storage: ObjectStorage = {
    get: (key) => runtimeStorage.get(key),
    getStream: (key, options) => runtimeStorage.getStream(key, options),
    exists: (key) => runtimeStorage.exists(key),
    delete: (key) => runtimeStorage.delete(key),
    put: async (key, bytes, options) => {
      keys.add(key);
      await runtimeStorage.put(key, bytes, options);
    },
    copy: async (source, target) => {
      keys.add(target);
      await runtimeStorage.copy(source, target);
    },
    createUploadUrl: (key, ttl) => {
      keys.add(key);
      return runtimeStorage.createUploadUrl(key, ttl);
    },
    createDownloadUrl: (key, ttl) => runtimeStorage.createDownloadUrl(key, ttl),
  };
  const proxy = await faultProxy(
    env.CLAMD_HOST!,
    Number(env.CLAMD_PORT ?? 3310),
  );
  const scanner = createClamAvMalwareScanner({
    host: "127.0.0.1",
    port: proxy.port,
    timeoutMs: 30000,
    signatureCheckIntervalMs: 1,
  });
  const renderer = createGotenbergRenderer({
    baseUrl: env.DOCRENDER_BASE_URL!,
  });
  const repository = createKyselyAttachmentRepository(env.S3_BUCKET_DOCUMENTS!);
  const artifacts = createKyselyDocumentArtifactRepository();
  // No scheduler/outbox dispatch: qualification must not send notifications or start unrelated jobs.
  const outbox = { append: async () => undefined };
  const lifecycle = createAttachmentLifecycle({
    transactions,
    repository,
    storage,
    scanner,
    outbox,
    quota: createKyselyAttachmentQuotaLedger(),
    quotaPolicies: createConfiguredAttachmentQuotaPolicyResolver({
      limitBytes: 100 * 1024 * 1024,
      limitItems: 1000,
    }),
  });
  const context: VerifiedRequestContext = {
    planeKey,
    tenantId,
    principalId,
    realmKey: "athyper",
    authEpoch: 1,
    profileHash: "qualification",
    requestId: randomUUID(),
    permissions: {
      planeKey,
      tenantId,
      principalId,
      principalFingerprint: "qualification",
      profileHash: "qualification",
      schemaHash: "qualification",
      resolvedAt: Date.now(),
      allowed: ["documents.render", "documents.download"],
      denied: [],
      entries: [],
      authorizationScopes: [],
      planLocked: [],
      planeExcluded: [],
    },
  };
  let contaminate = false,
    rendered = new Uint8Array(),
    attemptedId = randomUUID();
  const documents = createDocumentService({
    transactions,
    storage,
    storageBucket: env.S3_BUCKET_DOCUMENTS!,
    artifacts,
    templates: createKyselyDocumentTemplateRepository(),
    malwareScanner: scanner,
    outbox,
    createId: () => attemptedId,
    authorizer: { authorize: async () => ({ allowed: true }) },
    audit: {
      record: async (input) => ({
        ...input,
        id: randomUUID(),
        occurredAt: new Date().toISOString(),
        severity: input.severity ?? "info",
      }),
    },
    metadata: {
      getEntityDescriptor: async () => ({
        schema: "athyper.entity-runtime-descriptor/1.0",
        entityCode: "qualification",
        planeKey,
        releaseId: "qualification",
        releaseNo: 1,
        contractHash: "a".repeat(64),
        compiledHash: "b".repeat(64),
        storage: {
          schema: "document",
          object: "qualification",
          idField: "id",
          tenantField: "tenant_id",
        },
        fields: [],
        operations: {
          print: { code: "print", permissionCode: "documents.render" },
        },
      }),
    },
    renderer: {
      renderPdf: async (request) => {
        const result = await renderer.renderPdf(request);
        assert.equal(
          Buffer.from(result.bytes).subarray(0, 5).toString(),
          "%PDF-",
        );
        if (contaminate) {
          const pdf = await PDFDocument.load(result.bytes);
          await pdf.attach(eicar, "eicar.com", {
            mimeType: "application/octet-stream",
          });
          rendered = Buffer.from(await pdf.save({ useObjectStreams: false }));
        } else rendered = Buffer.from(result.bytes);
        return { ...result, bytes: rendered };
      },
    },
  });
  const notifications = createNotificationAttachmentResolver({
    transactions,
    artifacts,
    storage,
    access: { authorize: async () => true },
  });
  const notify = (id: string, accessMode: "content" | "link") =>
    notifications.resolveForDelivery({
      planeKey,
      tenantId,
      actorPrincipalId: principalId,
      recipientPrincipalId: principalId,
      attachmentId: id,
      versionPolicy: "current",
      accessMode,
      purpose: "notification_delivery",
      deliveryId: randomUUID(),
    });
  const state = (id: string) =>
    transactions.run(
      planeKey,
      identity(id),
      async (tx) =>
        (
          await sql<{
            status: string;
            is_virus_scanned: boolean;
            storage_key: string;
            sha256: string;
          }>`
    SELECT status,is_virus_scanned,storage_key,sha256 FROM document.attachment WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid`.execute(
            tx,
          )
        ).rows[0],
    );
  async function denied(id: string) {
    await assert.rejects(lifecycle.createAuthorizedDownload(identity(id)));
    await assert.rejects(documents.createDownload({ context, documentId: id }));
    await assert.rejects(notify(id, "content"));
    await assert.rejects(notify(id, "link"));
  }
  async function accessible(id: string, expected: Uint8Array, path: string) {
    const stored = await state(id);
    assert(stored);
    assert.equal(stored.status, "active");
    assert.equal(stored.is_virus_scanned, true);
    assert.equal(stored.sha256, hash(expected));
    const download =
      path === "render"
        ? await documents.createDownload({ context, documentId: id })
        : await lifecycle.createAuthorizedDownload(identity(id));
    const response = await fetch(download.url);
    assert.equal(response.status, 200);
    assert.equal(
      hash(new Uint8Array(await response.arrayBuffer())),
      hash(expected),
    );
    const embedded = await notify(id, "content");
    assert(embedded.content);
    assert.equal(hash(embedded.content), hash(expected));
    const link = await notify(id, "link");
    assert(link.downloadUrl);
    const linked = await fetch(link.downloadUrl);
    assert.equal(linked.status, 200);
    assert.equal(
      hash(new Uint8Array(await linked.arrayBuffer())),
      hash(expected),
    );
    const publicUrl = new URL(download.url);
    publicUrl.search = "";
    assert.equal(
      (await fetch(publicUrl)).status,
      403,
      "deployed bucket must deny unsigned reads",
    );
    const foreign = await transactions.run(
      planeKey,
      { tenantId: otherTenantId, principalId },
      async (tx) =>
        (
          await sql`SELECT id FROM document.attachment WHERE id=${id}::uuid`.execute(
            tx,
          )
        ).rows,
    );
    assert.equal(
      foreign.length,
      0,
      "RLS must hide rows without an explicit tenant predicate",
    );
  }
  const results: { passed: boolean; [key: string]: unknown }[] = [],
    quarantined: string[] = [];
  const report = {
    stage: 6,
    scope:
      "deployed dev Postgres/RLS, MinIO, Gotenberg and ClamAV; service entrypoints",
    seed,
    results,
    passed: false,
    startedAt: new Date().toISOString(),
  };
  try {
    const role = await sql<{
      role: string;
      superuser: boolean;
      bypass_rls: boolean;
    }>`SELECT current_user AS role,rolsuper AS superuser,rolbypassrls AS bypass_rls FROM pg_roles WHERE rolname=current_user`.execute(
      db,
    );
    assert(role.rows[0]);
    assert.equal(role.rows[0].superuser, false);
    assert.equal(role.rows[0].bypass_rls, false);
    const initialHealth = await scanner.health();
    assert.equal(initialHealth.status, "healthy");
    assert.equal((await scanner.scan({ content: eicar })).status, "infected");
    await runtimeStorage.validateAccess();
    assert.equal((await renderer.health()).status, "healthy");
    Object.assign(report, {
      databaseRole: role.rows[0],
      initialHealth,
      bucket: env.S3_BUCKET_DOCUMENTS,
      renderingEndpoint: env.DOCRENDER_BASE_URL,
      objectStorageEndpoint: env.S3_ENDPOINT,
    });
    const clean = (
      await renderer.renderPdf({ html: "<h1>Qualification upload</h1>" })
    ).bytes;
    for (const path of ["upload", "render"])
      for (const scenario of [
        "clean",
        "eicar",
        "outage",
        "scan-outage",
        "stale",
      ] as const) {
        const mode =
          scenario === "clean" || scenario === "eicar" ? "healthy" : scenario;
        await proxy.setMode(mode);
        await scanner.health();
        const id = randomUUID();
        attemptedId = id;
        ids.add(id);
        contaminate = scenario === "eicar";
        const bytes = contaminate ? eicar : clean;
        const objectCount = keys.size;
        try {
          const operation = async () =>
            path === "upload"
              ? lifecycle.finalize(identity(id), "application/pdf")
              : documents.render({
                  context,
                  entityType: "qualification",
                  entityId,
                  operationCode: "print",
                  data: { message: seed.runId },
                });
          if (path === "upload") {
            const staged = await lifecycle.stage({
              ...identity(id),
              fileName: "qualification.pdf",
              contentType: "application/pdf",
              sizeBytes: bytes.length,
              entityType: "qualification",
              entityId,
            });
            const upload = await fetch(staged.uploadUrl, {
              method: "PUT",
              body: Buffer.from(bytes),
            });
            assert.equal(upload.status, 200);
            assert.equal(
              (await fetch(staged.uploadUrl)).status,
              403,
              "PUT grant cannot authorize GET",
            );
            await denied(id);
          }
          if (scenario === "clean") {
            await operation();
            await accessible(id, path === "upload" ? bytes : rendered, path);
          } else {
            await assert.rejects(operation(), (error: unknown) => {
              assert(error instanceof Error);
              if (scenario === "eicar")
                assert(
                  path === "upload"
                    ? /quarantined/.test(error.message)
                    : "code" in error &&
                        error.code === "DOCUMENT_MALWARE_DETECTED",
                );
              else {
                assert("code" in error);
                assert(
                  [
                    "MALWARE_SCANNER_SIGNATURE_STALE",
                    "MALWARE_SCANNER_UNAVAILABLE",
                    "MALWARE_SCANNER_PROTOCOL",
                  ].includes(String(error.code)),
                );
              }
              return true;
            });
            await denied(id);
            if (path === "render") {
              assert.equal(keys.size, objectCount);
              assert.equal(await state(id), undefined);
            } else {
              const row = await state(id);
              assert(row);
              assert.equal(
                row.status,
                scenario === "eicar" ? "quarantined" : "uploading",
              );
              assert.equal(row.is_virus_scanned, false);
              if (scenario === "eicar") {
                quarantined.push(id);
                assert(await storage.exists(row.storage_key));
              }
            }
            if (scenario !== "eicar") {
              await proxy.setMode("healthy");
              assert.equal((await scanner.health()).status, "healthy");
              await operation();
              await accessible(id, path === "upload" ? bytes : rendered, path);
            }
          }
          for (const blocked of quarantined) {
            await denied(blocked);
            const row = await state(blocked);
            assert(row);
            assert(await storage.exists(row.storage_key));
            const raw = new URL(
              await runtimeStorage.createDownloadUrl(row.storage_key),
            );
            raw.search = "";
            assert.equal((await fetch(raw)).status, 403);
          }
          results.push({
            path,
            scenario,
            passed: true,
            id,
            recoveredSameRequest: !["clean", "eicar"].includes(scenario),
          });
          console.log(`PASS deployed ${path}: ${scenario}`);
        } catch (error) {
          results.push({
            path,
            scenario,
            id,
            passed: false,
            failure: error instanceof Error ? error.message : String(error),
            persistedState: await state(id),
          });
          console.log(`FAIL deployed ${path}: ${scenario}`);
        }
      }
    report.passed = results.every((result) => result.passed);
    assert(
      report.passed,
      "Infrastructure qualification has failing scenarios; see evidence",
    );
  } catch (error) {
    Object.assign(report, {
      failure: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    const cleanupErrors: string[] = [];
    for (const id of ids)
      try {
        if (await state(id)) {
          await lifecycle.deactivate(identity(id), "qualification_cleanup");
          await lifecycle.purge(identity(id));
        }
      } catch (error) {
        cleanupErrors.push(
          `row:${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    for (const key of keys)
      try {
        await runtimeStorage.delete(key);
        assert.equal(await runtimeStorage.exists(key), false);
      } catch {
        cleanupErrors.push(`object:${key}`);
      }
    lifecycle.close();
    scanner.close();
    await proxy.close();
    runtimeStorage.close();
    await db.destroy();
    if (cleanupErrors.length) report.passed = false;
    await mkdir(dirname(output), { recursive: true });
    await writeFile(
      output,
      JSON.stringify(
        {
          ...report,
          cleanup: {
            removedObjects: keys.size,
            retainedDatabaseEvidence: true,
            errors: cleanupErrors,
          },
          finishedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`Evidence: ${output}`);
    assert.equal(
      cleanupErrors.length,
      0,
      "Qualification cleanup failed; see report",
    );
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
