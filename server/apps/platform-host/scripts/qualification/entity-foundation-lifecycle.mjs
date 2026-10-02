/** Called only by the runner-owned ci-integrity databases. No CLI/deployed target. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createHash,
  randomUUID,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import {
  compileTableEntityProduct,
  parseTableEntityProduct,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import {
  lowerNativeRuntimePublication,
  KyselyLocalProjectionRepository,
  KyselyPublicationAuthorityRepository,
  PublicationOrchestrator,
  VerifiedPublicationArtifactLoader,
  KyselyPublicationRecoveryDiscovery,
  createPublicationRecoveryHandler,
  createPublicationApplyHandler,
} from "@athyper/server-service-publication";
import { compileRuntimePublication } from "@athyper/server-service-publication/compilation/compiled-runtime";
import {
  createRuntimeMetaCompiledEntityReleaseSource,
  PinnedCompiledEntityReader,
  createCompiledMetadataReader,
} from "@athyper/server-platform-metadata";
import {
  canonicalBytes,
  sha256,
} from "@athyper/server-adapter-publication-signing";
import { createKeycloakAuthAdapter } from "@athyper/server-adapter-auth-keycloak";
import {
  createIamService,
  createIamConfig,
  createIamAuthenticationMiddleware,
  readVerifiedRequestContext,
  createPermissionAuthorizer,
} from "@athyper/server-platform-iam";
import {
  createPublishedTenantRecordAuthorizer,
  createKyselyRecordRepository,
  createRecordQueryService,
  createRecordListExecutor,
  createEntityListService,
  registerEntityListRoutes,
  createRecordTransferService,
  registerRecordTransferRoutes,
} from "@athyper/server-service-records";
import { createRecordOwnerAccessAdapter } from "@athyper/server-service-records";
import { createEntityAuthorizationRegistrations } from "../../src/composition/shared/entity-runtime/read-registrations.ts";
import { createPublicationRuntimeQualification } from "../../src/composition/shared/publication/runtime-qualification.ts";
import { KyselyTransactionRunner } from "@athyper/server-adapter-db-core/transaction";

const planes = ["studio", "neon", "mesh"];
const code = "principal";
const key = `metadata.entity.${code}`;
const canonical = { canonicalBytes, sha256 };
const hash = (value) => canonical.sha256(canonical.canonicalBytes(value));

export async function qualifyEntityFoundationLifecycle({
  adminUrls,
  runtimeUrls,
  fixture,
  root,
  pass,
}) {
  // Only the parent-created loopback CI targets are eligible. Never discover DEV credentials.
  for (const plane of planes) {
    const url = new URL(adminUrls[plane]);
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(url.pathname, `/athyper_${plane}`);
  }
  const connect = (url) =>
    new Kysely({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: url, max: 4 }),
      }),
    });
  const admins = Object.fromEntries(
    planes.map((p) => [p, connect(adminUrls[p])]),
  );
  const runtimes = Object.fromEntries(
    planes.map((p) => [p, connect(runtimeUrls[p])]),
  );
  const artifacts = new Map();
  const signing = generateKeyPairSync("ed25519");
  const signingKeyId = "isolated-foundation-key";
  const loader = new VerifiedPublicationArtifactLoader({
    store: {
      get: async ({ uri }) => {
        const bytes = artifacts.get(uri);
        assert.ok(bytes);
        return bytes;
      },
    },
    canonicalizer: canonical,
    runtimeVersion: "1.0.0",
    authorizationRuntime: {
      qualify: (profile, bindings) =>
        createPublicationRuntimeQualification({
          registrations: createEntityAuthorizationRegistrations(
            queries,
            profile,
          ),
          sourceConstraints: accessAuthority.checkSourceConstraints,
        }).qualify(profile, bindings),
    },
    verifier: {
      verify: async (input) =>
        input.keyId === signingKeyId &&
        input.algorithm === "Ed25519" &&
        verify(
          null,
          input.bytes,
          signing.publicKey,
          Buffer.from(input.signature, "base64"),
        ),
    },
  });
  const sourceEntityId = randomUUID();
  let permissionRows = [];
  const authority = new KyselyPublicationAuthorityRepository(admins.studio);
  const local = (plane) =>
    new Proxy(
      {},
      {
        get(_target, method) {
          return (...args) =>
            admins[plane]
              .transaction()
              .execute((tx) =>
                new KyselyLocalProjectionRepository(tx)[method](...args),
              );
        },
      },
    );
  const context = (plane) => ({
    planeKey: plane,
    tenantId: fixture.tenant,
    principalId: fixture.principal,
  });
  const source = createRuntimeMetaCompiledEntityReleaseSource({
    databases: runtimes,
    withTenantTransaction: (plane, actor, work) =>
      new KyselyTransactionRunner(runtimes[plane]).run(work, actor),
  });
  const metadata = createCompiledMetadataReader(
    new PinnedCompiledEntityReader({ source, cacheTtlMs: 1 }),
  );
  const transactions = {
    run: (plane, actor, work) =>
      new KyselyTransactionRunner(runtimes[plane]).run(work, actor),
  };
  const accessAuthority = createPermissionAuthorizer();
  const authorizer = createPublishedTenantRecordAuthorizer({
    metadata,
    authority: accessAuthority,
    ownerAccess: true,
    refreshContext: async (ctx) => ctx,
    exists: async (ctx, d, id) =>
      transactions.run(
        ctx.planeKey,
        ctx,
        async (tx) =>
          (
            await sql`SELECT id FROM master.principal WHERE id=${id}::uuid AND tenant_id=${ctx.tenantId}::uuid AND id=${ctx.principalId}::uuid`.execute(
              tx,
            )
          ).rows.length === 1,
      ),
  });
  const repository = createKyselyRecordRepository({ databases: runtimes });
  const options = {
    metadata,
    authorizer,
    repository,
    transactions,
    ownerAccess: createRecordOwnerAccessAdapter(authorizer),
  };
  const queries = createRecordQueryService(options);
  let server;
  try {
    permissionRows = (
      await sql`SELECT id::text,canonical_code AS code,permission_kind AS kind FROM authz.permission WHERE canonical_code LIKE 'common.identity.principal.%'`.execute(
        admins.studio,
      )
    ).rows.map((p) => ({ ...p, scopeKinds: ["tenant"] }));
    assert.ok(
      permissionRows.length >= 1,
      "canonical Principal permissions required",
    );
    for (const plane of planes) {
      await sql`SELECT set_config('app.current_tenant_id',${fixture.tenant},false),set_config('app.current_principal_id',${fixture.principal},false)`.execute(
        admins[plane],
      );
      await sql`UPDATE master.principal SET name='isolated-secret-canary' WHERE tenant_id=${fixture.tenant}::uuid AND id=${fixture.principal}::uuid`.execute(
        admins[plane],
      );
    }
    const release1 = await publish(1, false);
    for (const plane of planes)
      await new PublicationOrchestrator(authority, local(plane), loader).deploy(
        release1[plane],
      );
    const baseline = {};
    for (const plane of planes)
      baseline[plane] = await local(plane).findActive(key);
    pass(
      "publication: signed Principal baseline activated on three disposable targets",
    );

    const release2 = await publish(2, true);
    await new PublicationOrchestrator(
      authority,
      local("studio"),
      loader,
    ).deploy(release2.studio);
    // Fail before Mesh activation, then lose Neon acknowledgement after its head commits.
    const failMesh = new Proxy(local("mesh"), {
      get(target, method) {
        return method === "activate"
          ? async () => {
              throw Object.assign(Error("injected target interruption"), {
                code: "ECONNRESET",
              });
            }
          : target[method];
      },
    });
    await assert.rejects(
      new PublicationOrchestrator(authority, failMesh, loader).deploy(
        release2.mesh,
      ),
      (error) => error.retryable === true,
    );
    const failAck = new Proxy(authority, {
      get(target, method) {
        return method === "acknowledge"
          ? async () => {
              throw Object.assign(Error("injected acknowledgement loss"), {
                code: "ECONNRESET",
              });
            }
          : typeof target[method] === "function"
            ? target[method].bind(target)
            : target[method];
      },
    });
    await assert.rejects(
      new PublicationOrchestrator(failAck, local("neon"), loader).deploy(
        release2.neon,
      ),
      (error) => error.retryable === true,
    );
    assert.equal((await local("mesh").findActive(key)).id, baseline.mesh.id);
    assert.equal((await local("neon").findActive(key)).sourceReleaseNo, 2);
    assert.equal(
      (await authority.getDeployment(release2.mesh)).deploymentStatus,
      "verified",
    );
    assert.equal(
      (await authority.getDeployment(release2.neon)).deploymentStatus,
      "activated",
    );
    pass(
      "publication: partial target activation preserves failed target head and survives lost acknowledgement",
    );
    // Make only these isolated interruption fixtures eligible for the scheduler.
    await sql`UPDATE publication.deployment SET created_at=clock_timestamp()-interval '3 minutes' WHERE id IN (${release2.mesh}::uuid,${release2.neon}::uuid)`.execute(
      admins.studio,
    );
    const discovery = {
      page: (after, limit) =>
        admins.studio.transaction().execute(async (tx) => {
          await sql`SET LOCAL ROLE athyper_publication_recovery`.execute(tx);
          return new KyselyPublicationRecoveryDiscovery(tx).page(after, limit);
        }),
    };
    const recovered = [];
    const recovery = createPublicationRecoveryHandler(
      discovery,
      {
        enqueue: async (_queue, _name, data, options) => {
          recovered.push({ data, execution: options.execution });
          return randomUUID();
        },
      },
      async (c) => ({
        scope: "tenant",
        planeKey: c.targetPlane,
        tenantId: c.tenantId,
        principalId: fixture.principal,
      }),
    );
    await recovery.handle({
      id: randomUUID(),
      data: {},
      execution: {
        scope: "plane",
        planeKey: "studio",
        principalId: fixture.principal,
      },
    });
    assert.deepEqual(
      recovered.map((job) => job.data.deploymentId).sort(),
      [release2.mesh, release2.neon].sort(),
    );
    const apply = createPublicationApplyHandler(
      Object.fromEntries(
        planes.map((plane) => [
          plane,
          new PublicationOrchestrator(
            new KyselyPublicationAuthorityRepository(admins.studio),
            local(plane),
            loader,
          ),
        ]),
      ),
    );
    for (const job of recovered) await apply.handle(job);
    assert.equal(
      (await discovery.page(undefined, 200)).length,
      0,
      "acknowledged deployments must leave recovery discovery",
    );
    pass(
      "publication: least-privilege scheduler discovery and apply handler recover both interrupted activation and acknowledgement",
    );
    for (const plane of planes) {
      await new PublicationOrchestrator(authority, local(plane), loader).deploy(
        release2[plane],
      );
      assert.equal((await local(plane).findActive(key)).sourceReleaseNo, 2);
      const events = (
        await sql`SELECT count(*)::int AS n FROM runtime_meta.release_activation_event WHERE publication_key=${key}`.execute(
          admins[plane],
        )
      ).rows[0].n;
      assert.equal(events, 2, "retry must not duplicate activation");
      const acks = (
        await sql`SELECT count(*)::int AS n FROM publication.deployment_acknowledgement WHERE deployment_id=${release2[plane]}::uuid`.execute(
          admins.studio,
        )
      ).rows[0].n;
      assert.equal(acks, 1, "retry must not duplicate acknowledgement");
      const descriptor = await metadata.getEntityDescriptor(
        context(plane),
        code,
      );
      assert.equal(descriptor.releaseNo, 2);
      assert.equal(
        descriptor.authorization.fieldPolicies.find((p) =>
          p.fields.includes("name"),
        ).representation,
        "masked",
      );
    }
    pass(
      "publication: durable partial-activation recovery, idempotent heads and exactly one acknowledgement",
    );
    // A stale replay cannot move the head back to release 1.
    await assert.rejects(
      new PublicationOrchestrator(authority, local("mesh"), loader).deploy(
        release1.mesh,
      ),
    );
    assert.equal((await local("mesh").findActive(key)).sourceReleaseNo, 2);
    pass("publication: superseded deployment cannot regress active metadata");

    await disclose();
  } finally {
    if (server)
      await new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      });
    await Promise.all(
      [...Object.values(admins), ...Object.values(runtimes)].map((db) =>
        db.destroy(),
      ),
    );
  }

  async function publish(releaseNo, masked) {
    const releaseId = randomUUID(),
      revisionId = randomUUID(),
      generatedAt = new Date().toISOString();
    await sql`INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,created_by)
      VALUES(${releaseId}::uuid,${fixture.tenant}::uuid,${key},${releaseNo},'publish','preparing','backward_compatible',${hash({ releaseId })},${hash({ revisionId })},${fixture.principal}::uuid)`.execute(
      admins.studio,
    );
    const ids = {};
    for (const plane of planes) {
      const product = JSON.parse(
        readFileSync(
          `${root}/metadata/products/shared/entities/${code}/definition.json`,
          "utf8",
        ),
      );
      const replace = (value) => {
        if (!value || typeof value !== "object") return;
        if (masked && Array.isArray(value.sort))
          value.sort = value.sort.filter((item) => item.field !== "name");
        if (
          masked &&
          value.representation === "plain" &&
          value.fields?.includes("name")
        ) {
          value.representation = "masked";
          value.queryUses = [];
        }
        for (const item of Object.values(value)) replace(item);
      };
      replace(product);
      const { graph, artifact } = compileTableEntityProduct(
        parseTableEntityProduct(product),
        plane,
      );
      const profile = graph.runtimeProfiles[0];
      const prior = await local(plane).findActive(key);
      const head = prior
        ? (
            await sql`SELECT row_version FROM runtime_meta.release_activation_head WHERE publication_key=${key}`.execute(
              admins[plane],
            )
          ).rows[0]
        : null;
      const input = {
        releaseId,
        releaseNo,
        publicationKey: key,
        plane,
        tenantId: null,
        entityCode: code,
        revisionId,
        sourceEntityId,
        sourceReleaseHash: artifact.descriptorHash,
        sourceContractHash: artifact.contractHash,
        sourceDescriptorHash: artifact.descriptorHash,
        generatedAt,
        native: artifact.descriptor,
        contract: graph,
        ...(prior
          ? {
              expectedPredecessor: {
                plane,
                environment: "local",
                instance: "dev",
                publicationKey: key,
                appliedReleaseId: prior.id,
                sourceReleaseId: prior.sourceReleaseId,
                sourceReleaseNo: prior.sourceReleaseNo,
                artifactHash: prior.artifactHash,
                headVersion: Number(head.row_version),
              },
            }
          : {}),
      };
      const registry = {
        sourceObjects: new Set([`master.${code}`]),
        permissions: new Set(permissionRows.map((p) => p.code)),
        handlers: new Set([
          "entity.record.list.v1",
          "entity.record.read.v1",
          "entity.record.create.v1",
          "entity.record.patch.v1",
        ]),
        resolvers: new Set(["tenant.record.v1"]),
        renderers: new Set(),
        evaluators: new Set(),
      };
      const unsigned = await compileRuntimePublication(
        input,
        {
          lower: async (source) =>
            lowerNativeRuntimePublication(source, {
              registration: {
                entityCode: code,
                plane,
                storage: {
                  schema: "master",
                  object: profile.storageObject,
                  idField: "id",
                  tenantField: "tenant_id",
                  ...(profile.recordVersionFieldKey
                    ? { versionField: profile.recordVersionFieldKey }
                    : {}),
                },
                columns: graph.fields.map((f) => f.storagePath),
                detailRouteTemplate: `/app/entity/${code}/:recordId`,
              },
              permissions: permissionRows,
            }),
          registry: async () => registry,
          // Isolated synthetic review input; this harness does not qualify maker/checker enrollment.
          qualify: async () => ({
            receiptSha256: hash({ releaseId, revisionId, plane, masked }),
          }),
        },
        canonical,
        signingKeyId,
      );
      const signature = sign(
        null,
        canonical.canonicalBytes(unsigned),
        signing.privateKey,
      ).toString("base64");
      const document = { ...unsigned, signature },
        bytes = canonical.canonicalBytes(document),
        artifactId = randomUUID(),
        uri = `s3://isolated-foundation/${releaseId}/${plane}`;
      artifacts.set(uri, bytes);
      await sql`INSERT INTO publication.artifact(id,publication_release_id,plane_code,artifact_kind,artifact_uri,content_hash,status,created_by)
        VALUES(${artifactId}::uuid,${releaseId}::uuid,${plane},'compiled_entity_runtime',${uri},${canonical.sha256(bytes)},'compiled',${fixture.principal}::uuid)`.execute(
        admins.studio,
      );
      await sql`SELECT publication.fn_transition_artifact(${artifactId}::uuid,'validated')`.execute(
        admins.studio,
      );
      await sql`SELECT publication.fn_transition_artifact(${artifactId}::uuid,'signed','Ed25519',${signingKeyId},${signature})`.execute(
        admins.studio,
      );
      ids[plane] = { artifactId };
    }
    await sql`SELECT publication.fn_transition_release(${releaseId}::uuid,'approved',${fixture.principal}::uuid)`.execute(
      admins.studio,
    );
    await sql`SELECT publication.fn_transition_release(${releaseId}::uuid,'published',${fixture.principal}::uuid)`.execute(
      admins.studio,
    );
    for (const plane of planes) {
      const commandId = randomUUID();
      await sql`SELECT publication.fn_create_deployment(${commandId}::uuid,${ids[plane].artifactId}::uuid,${plane},'local','dev',1,${randomUUID()}::uuid,${fixture.principal}::uuid)`.execute(
        admins.studio,
      );
      ids[plane] = (
        await sql`SELECT id::text FROM publication.deployment WHERE command_id=${commandId}::uuid`.execute(
          admins.studio,
        )
      ).rows[0].id;
    }
    return ids;
  }

  async function disclose() {
    const app = express();
    app.use(express.json());
    const identityKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
    app.get("/jwks", (_req, res) =>
      res.json({
        keys: [
          {
            ...identityKey.publicKey.export({ format: "jwk" }),
            kid: "isolated-user",
            alg: "RS256",
            use: "sig",
          },
        ],
      }),
    );
    server = createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const tokenVerifier = createKeycloakAuthAdapter({
      defaultRealm: {
        issuerUrl: origin,
        audience: "foundation-test",
        jwksUrl: origin + "/jwks",
      },
    });
    let revoked = false;
    const iam = createIamService({
      tokenVerifier,
      audit: { record: async () => {} },
      config: createIamConfig({
        environment: "local",
        defaultRealmKey: "foundation",
        claimContextMode: "enforce",
        requireAuthorizedRole: true,
      }),
      // Exercise live grant revocation independently of the still-valid bearer token.
      permissionResolver: {
        resolve: async (ctx) => ({
          ...ctx.permissions,
          allowed: revoked ? [] : ctx.permissions.allowed,
          denied: revoked ? ctx.permissions.allowed : [],
          profileHash: hash({ revoked }),
        }),
      },
    });
    const authenticate = createIamAuthenticationMiddleware(iam);
    const lists = createEntityListService({
      metadata,
      authorizer,
      queries,
      listExecutor: createRecordListExecutor(options),
      filterChoices: async () => {
        throw Error("MASKED_CHOICE_PROVIDER_CALLED");
      },
    });
    registerEntityListRoutes(app, {
      authenticate,
      readContext: readVerifiedRequestContext,
      lists,
    });
    // Real transfer entrypoint: Profile has no export capability, so no job/artifact may be created.
    const forbidden = () => {
      throw Error("EXPORT_SIDE_EFFECT");
    };
    const transfers = createRecordTransferService({
      metadata,
      authorizer,
      transactions,
      staging: new Proxy({}, { get: () => forbidden }),
      validator: { validate: forbidden },
      jobs: { enqueue: forbidden },
      audit: { record: forbidden },
      outbox: { append: forbidden },
      adapters: { get: forbidden },
    });
    registerRecordTransferRoutes(app, {
      authenticate,
      readContext: readVerifiedRequestContext,
      transfers,
    });
    app.use((error, _req, res, _next) =>
      res
        .status(error.statusCode ?? 500)
        .json({ code: error.code ?? "INTERNAL_ERROR" }),
    );
    for (const plane of planes) {
      const claims = {
        iss: origin,
        aud: "foundation-test",
        sub: fixture.principal,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
        typ: "Bearer",
        tenant_id: fixture.tenant,
        principal_id: fixture.principal,
        plane,
        realm: "foundation",
        resource_access: { [`${plane}-web`]: { roles: ["AUTHORIZED"] } },
        permissions: permissionRows
          .map((p) => p.code)
          .filter((code) => !code.endsWith(".administer")),
      };
      const base = [{ alg: "RS256", kid: "isolated-user", typ: "JWT" }, claims]
        .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
        .join(".");
      const token =
        base +
        "." +
        sign("RSA-SHA256", Buffer.from(base), identityKey.privateKey).toString(
          "base64url",
        );
      const headers = {
        authorization: `Bearer ${token}`,
        "x-plane": plane,
        "content-type": "application/json",
      };
      const recordId = (
        await sql`SELECT id::text FROM master.principal WHERE tenant_id=${fixture.tenant}::uuid AND id=${fixture.principal}::uuid`.execute(
          admins[plane],
        )
      ).rows[0].id;
      const read = async (path, expected = 200, extra = {}) => {
        const response = await fetch(origin + path, { headers, ...extra });
        const body = await response.text();
        assert.ok(
          (Array.isArray(expected) ? expected : [expected]).includes(
            response.status,
          ),
          `${plane} ${path}: HTTP ${response.status}, ${body}`,
        );
        assert.ok(
          !body.includes("isolated-secret-canary"),
          `raw masked value leaked: ${path}`,
        );
        return JSON.parse(body);
      };
      const api = `/api/entity-runtime/${code}`;
      await read(api + "/application-descriptor");
      const descriptor = await read(
        api + "/list-descriptor?filterChoiceField=name",
      );
      const maskedField = descriptor.fields.find((f) => f.key === "name");
      assert.deepEqual(maskedField.filterOperators, []);
      assert.equal(maskedField.sortable, false);
      assert.equal(maskedField.groupable, false);
      const rows = await read(api + "/list");
      assert.equal(rows.rows[0].values.name, "••••");
      assert.ok(rows.rows[0].values.code);
      const record = await read(`${api}/records/${recordId}`);
      assert.equal(record.values.name, "••••");
      await read(`${api}/records/${recordId}/detail`);
      await read(`${api}/detail-descriptor?recordId=${recordId}`);
      await read(`${api}/form-descriptor?mode=edit&recordId=${recordId}`, 409);
      assert.equal(
        (await read(`${api}/list?search=isolated-secret-canary`)).rows.length,
        0,
        "search must exclude the raw masked field",
      );
      for (const query of [
        new URLSearchParams({ sort: "name:asc" }),
        new URLSearchParams({
          filter: JSON.stringify({
            field: "name",
            operator: "eq",
            value: "isolated-secret-canary",
          }),
        }),
        new URLSearchParams({ group: "name" }),
      ])
        await read(`${api}/list?${query}`, [400, 403]);
      await read(`/api/records/${code}/exports`, 409, {
        method: "POST",
        body: JSON.stringify({
          filter: { recordIds: [recordId], fields: ["name"] },
        }),
      });
      await read(`${api}/list`, 401, { headers: { "x-plane": plane } });
      revoked = true;
      await read(`${api}/records/${recordId}`, 403);
      revoked = false;
      pass(
        `${plane}: live signed-identity HTTP masked list/detail/forms, inference denial, unavailable export, anonymous denial and grant revocation`,
      );
    }
  }
}
