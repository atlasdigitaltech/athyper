import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import type { Application } from "express";
import { sql, type Kysely } from "kysely";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type {
  MetaEntityChangeSet,
  MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  compileEntityIntakeSurfaces,
  compileEntityIntakeFlows,
} from "@athyper/contract-platform-entity-runtime";
import { runWithRequestContext } from "@athyper/server-foundation/context";
import {
  DevelopmentPublicationWorkflow,
  KyselyMetaEntityAuthoringRepository,
  sha256,
  baselineJsonHash,
  type MetaEntityAuthoringService,
  type DevelopmentPublicationRequest,
} from "@athyper/server-plane-studio";

type Db = Kysely<Record<string, never>>;
type Credential = {
  principalId: string;
  code: string;
  authEpoch: number;
  digest: string;
};
export interface DevPublicationConfiguration {
  runtimeApproval?: { releaseId: string; path: string; sha256: string };
  schemaVersion: 1;
  instance: "dev";
  tenantId: string;
  tenantCode: string;
  entityCode: string;
  targets: ("studio" | "neon" | "mesh")[];
  author: Credential;
  publisher: Credential;
  /** Operator-pinned, independently reviewed prerequisite; never supplied by an HTTP caller. */
  intakePrerequisite?: {
    changeSetId: string;
    revision: number;
    contractHash: string;
  };
}
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function requireDev(ok: unknown, code: string): asserts ok {
  if (!ok) throw Error(code);
}

export function admitDevIntakePrerequisite(
  config: DevPublicationConfiguration,
  changeSet: MetaEntityChangeSet | null,
  graph: MetaEntityGraph,
) {
  const pin = config.intakePrerequisite;
  requireDev(
    pin &&
      changeSet &&
      changeSet.id === pin.changeSetId &&
      changeSet.status === "approved" &&
      changeSet.tenantId === config.tenantId &&
      changeSet.entityCode === config.entityCode &&
      changeSet.revision === pin.revision &&
      changeSet.approvedBy &&
      changeSet.approvedBy !== changeSet.createdBy &&
      changeSet.approvedBy !== changeSet.submittedBy,
    "DEV_PUBLICATION_PREREQUISITE_REVIEW_REQUIRED",
  );
  requireDev(
    sha256(graph) === pin.contractHash,
    "DEV_PUBLICATION_PREREQUISITE_CHANGED",
  );
  let proposed = structuredClone(graph);
  // A reviewed restoration carrier is a one-time coordinate. The fresh workload
  // draft must review a new coordinate and the full native intake projection;
  // prepareRuntimeRestorationRelease still enforces an empty target at publish.
  for (const [index, surface] of (proposed.surfaces ?? []).entries()) {
    const marker = surface.layoutConfig?.runtimeRestoration as
      Record<string, any> | undefined;
    if (!marker) continue;
    marker.publicationKey = `${marker.publicationKey}.dev-intake-${pin.contractHash.slice(0, 12)}`;
    marker.descriptor = JSON.parse(
      JSON.stringify({
        ...marker.descriptor,
        intakeSurfaces: compileEntityIntakeSurfaces(
          proposed as unknown as Record<string, unknown>,
        ),
        intakeFlows: compileEntityIntakeFlows(
          proposed as unknown as Record<string, unknown>,
        ),
      }),
    );
    marker.descriptorHash = baselineJsonHash(marker.descriptor);
    const path = `surfaces.${index}.layoutConfig.runtimeRestoration.descriptor`;
    proposed = {
      ...proposed,
      tests: proposed.tests?.map((test) =>
        test.path === path
          ? { ...test, expected: structuredClone(marker.descriptor) }
          : test,
      ),
    };
  }
  return proposed;
}

/** A persisted fork has new authoring IDs. Recognize the exact restoration
 * projection on retry instead of generating another one-time release. */
export function reusePublishedIntakePrerequisite(
  current: MetaEntityGraph,
  proposed: MetaEntityGraph,
): MetaEntityGraph {
  const markers = (graph: MetaEntityGraph) =>
    (graph.surfaces ?? []).flatMap((surface) => {
      const marker = surface.layoutConfig?.runtimeRestoration as
        Record<string, any> | undefined;
      return marker ? [marker] : [];
    });
  const expected = markers(proposed),
    published = markers(current);
  return expected.length === 1 &&
    published.length === 1 &&
    expected[0]!.publicationKey === published[0]!.publicationKey &&
    expected[0]!.descriptorHash === published[0]!.descriptorHash &&
    baselineJsonHash(published[0]!.descriptor) === expected[0]!.descriptorHash
    ? current
    : proposed;
}

export function loadDevPublicationConfiguration(
  env: NodeJS.ProcessEnv,
  hostEnvironment: string,
): DevPublicationConfiguration | undefined {
  const path = env.ATHYPER_DEV_PUBLICATION_CONFIG;
  if (!path) return undefined;
  requireDev(
    hostEnvironment === "local" &&
      env.ATHYPER_ENV === "local" &&
      env.ATHYPER_DOMAIN_SUFFIX === "dev.athyper.test" &&
      env.ATHYPER_DEV_PRESET === "devfull",
    "DEV_PUBLICATION_DEVFULL_ONLY",
  );
  const stat = statSync(path);
  requireDev(
    stat.isFile() && stat.size < 16384 && !(stat.mode & 0o022),
    "DEV_PUBLICATION_CONFIG_UNTRUSTED",
  );
  const config = JSON.parse(
    readFileSync(path, "utf8"),
  ) as DevPublicationConfiguration;
  requireDev(
    config.schemaVersion === 1 &&
      config.instance === "dev" &&
      uuid.test(config.tenantId) &&
      /^[a-z][a-z0-9_]*$/.test(config.entityCode) &&
      typeof config.tenantCode === "string" &&
      Array.isArray(config.targets) &&
      config.targets.length > 0 &&
      new Set(config.targets).size === config.targets.length &&
      config.targets.every((p) => ["studio", "neon", "mesh"].includes(p)),
    "DEV_PUBLICATION_CONFIG_INVALID",
  );
  for (const [role, c] of [
    ["author", config.author],
    ["publisher", config.publisher],
  ] as const) {
    requireDev(
      c &&
        uuid.test(c.principalId) &&
        c.code === `dev.metadata.${role}` &&
        Number.isSafeInteger(c.authEpoch) &&
        c.authEpoch >= 0 &&
        /^[a-f0-9]{64}$/.test(c.digest),
      "DEV_PUBLICATION_CREDENTIAL_INVALID",
    );
  }
  if (config.runtimeApproval)
    requireDev(
      uuid.test(config.runtimeApproval.releaseId) &&
        typeof config.runtimeApproval.path === "string" &&
        config.runtimeApproval.path.startsWith("/") &&
        /^[a-f0-9]{64}$/.test(config.runtimeApproval.sha256),
      "DEV_RUNTIME_APPROVAL_CONFIG_INVALID",
    );
  if (config.intakePrerequisite)
    requireDev(
      uuid.test(config.intakePrerequisite.changeSetId) &&
        Number.isSafeInteger(config.intakePrerequisite.revision) &&
        config.intakePrerequisite.revision > 0 &&
        /^[a-f0-9]{64}$/.test(config.intakePrerequisite.contractHash),
      "DEV_PUBLICATION_PREREQUISITE_INVALID",
    );
  requireDev(
    config.author.principalId !== config.publisher.principalId &&
      config.author.digest !== config.publisher.digest,
    "DEV_PUBLICATION_DISTINCT_IDENTITIES_REQUIRED",
  );
  return config;
}
export function verifyDevPublicationCredential(
  value: unknown,
  credential: Credential,
): void {
  requireDev(
    typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value),
    "DEV_PUBLICATION_AUTH_REQUIRED",
  );
  const digest = createHash("sha256").update(value).digest();
  requireDev(
    timingSafeEqual(digest, Buffer.from(credential.digest, "hex")),
    "DEV_PUBLICATION_AUTH_REQUIRED",
  );
}

/** A dedicated DEV-only workload endpoint. It cannot authenticate humans or
 * grant authority to any ordinary authoring route. Both machine secrets are
 * independently checked; DB status/auth_epoch/role are rechecked on every action. */
export function registerDevPublicationRoutes(
  app: Application,
  options: {
    config: DevPublicationConfiguration;
    database: Db;
    service: MetaEntityAuthoringService;
    audit: AuditRecorder;
  },
) {
  const config = structuredClone(options.config);
  const db = <T>(principalId: string, work: (tx: Db) => Promise<T>) =>
    options.database.transaction().execute(async (tx) => {
      await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_actor_type','service_account',true),set_config('app.current_tenant_id',${config.tenantId},true),set_config('app.current_principal_id',${principalId},true)`.execute(
        tx,
      );
      return work(tx);
    });
  const checkPrincipal = async (role: "author" | "publisher") => {
    const c = config[role];
    const rows = await db(c.principalId, (tx) =>
      sql<{
        auth_epoch: number;
        metadata: { devPublication?: { role?: string; instance?: string } };
      }>`
      SELECT auth_epoch,metadata FROM master.principal WHERE tenant_id=${config.tenantId}::uuid AND id=${c.principalId}::uuid
      AND code=${c.code} AND principal_type='service_account' AND provisioning_source='internal' AND status='active'`.execute(
        tx,
      ),
    );
    const p = rows.rows[0];
    requireDev(
      p &&
        p.auth_epoch === c.authEpoch &&
        p.metadata.devPublication?.role === role &&
        p.metadata.devPublication.instance === "dev",
      "DEV_PUBLICATION_WORKLOAD_REVOKED",
    );
  };
  const current = async (request: DevelopmentPublicationRequest) => {
    requireDev(
      request.scope.kind === "tenant" &&
        request.scope.tenantId === config.tenantId &&
        request.entityCode === config.entityCode &&
        request.targets.every((t) => config.targets.includes(t)),
      "DEV_PUBLICATION_SCOPE_NOT_CONFIGURED",
    );
    return db(config.author.principalId, async (tx) => {
      const rows = await sql<{
        id: string;
        change_set_id: string;
        contract_hash: string;
        legacy_hash_matches: boolean;
        contract_json: import("@athyper/server-contract-meta-entity-authoring").MetaEntityGraph;
        target_planes: ("studio" | "neon" | "mesh")[];
      }>`
        SELECT r.id,r.change_set_id,s.contract_json,r.target_planes,r.contract_hash,
          (s.contract_hash=r.contract_hash AND encode(sha256(convert_to(s.contract_json::text,'UTF8')),'hex')=r.contract_hash) AS legacy_hash_matches
        FROM metadata.entity_release r
        JOIN metadata.entity e ON e.id=r.entity_id AND e.tenant_id=r.tenant_id
        JOIN metadata.entity_change_set c ON c.id=r.change_set_id AND c.status='published'
        JOIN snapshot.entity_contract_revision s ON s.id=r.revision_id AND s.tenant_id=r.tenant_id AND s.entity_id=r.entity_id
        WHERE r.tenant_id=${config.tenantId}::uuid AND e.entity_code=${request.entityCode}
        ORDER BY r.release_no DESC LIMIT 1`.execute(tx);
      const row = rows.rows[0];
      requireDev(row, "DEV_PUBLICATION_PUBLISHED_SOURCE_REQUIRED");
      requireDev(
        sha256(row.contract_json) === row.contract_hash ||
          row.legacy_hash_matches === true,
        "DEV_PUBLICATION_SOURCE_HASH_MISMATCH",
      );
      const repository = new KyselyMetaEntityAuthoringRepository(tx);
      const cs = await repository.get(row.change_set_id);
      requireDev(cs, "DEV_PUBLICATION_PUBLISHED_SOURCE_REQUIRED");
      // Canonical snapshots reorder arrays; positional assertions belong to the
      // persisted authoring row order. Verify the identical canonical content
      // before using that order for validation and an idempotent retry.
      const graph = await repository.loadGraph(row.change_set_id);
      requireDev(
        sha256(graph) === sha256(row.contract_json),
        "DEV_PUBLICATION_SOURCE_HASH_MISMATCH",
      );
      return {
        releaseId: row.id,
        changeSet: cs,
        graph,
        supportedTargets: row.target_planes,
      };
    });
  };
  app.post("/api/dev-publication/publish", (req, res, next) => {
    void (async () => {
      verifyDevPublicationCredential(
        req.get("authorization")?.replace(/^Bearer /, ""),
        config.author,
      );
      verifyDevPublicationCredential(
        req.get("x-dev-publisher-credential"),
        config.publisher,
      );
      await checkPrincipal("author");
      await checkPrincipal("publisher");
      const body = req.body;
      requireDev(
        body &&
          Object.keys(body).every((k) =>
            ["entityCode", "scope", "targets", "overlay", "dryRun"].includes(k),
          ) &&
          body.entityCode === config.entityCode &&
          body.scope?.kind === "tenant" &&
          body.scope.tenantId === config.tenantId &&
          Array.isArray(body.targets) &&
          body.targets.length > 0 &&
          body.targets.every(
            (p: unknown) =>
              typeof p === "string" && config.targets.includes(p as never),
          ) &&
          body.overlay === "intake-prerequisite" &&
          Boolean(config.intakePrerequisite) &&
          (body.dryRun === undefined || typeof body.dryRun === "boolean"),
        "DEV_PUBLICATION_REQUEST_INVALID",
      );
      const requestId = randomUUID();
      const prerequisite =
        body.overlay === "intake-prerequisite"
          ? await db(config.author.principalId, async (tx) => {
              const pin = config.intakePrerequisite!;
              const repository = new KyselyMetaEntityAuthoringRepository(tx);
              const changeSet = await repository.get(pin.changeSetId);
              requireDev(
                changeSet,
                "DEV_PUBLICATION_PREREQUISITE_REVIEW_REQUIRED",
              );
              const graph = await repository.loadGraph(pin.changeSetId);
              // Also validates the complete native intake surface prerequisite.
              return {
                graph: admitDevIntakePrerequisite(config, changeSet, graph),
                pin,
              };
            })
          : undefined;
      const context = (principalId: string) => ({
        requestId,
        correlationId: requestId,
        planeKey: "studio" as const,
        tenantId: config.tenantId,
        principalId,
      });
      const workflow = new DevelopmentPublicationWorkflow(
        {
          enabled: true,
          environment: "dev",
          instance: "dev",
          preset: "devfull",
          authorPrincipalId: config.author.principalId,
          publisherPrincipalId: config.publisher.principalId,
        },
        {
          current,
          overlays: prerequisite
            ? {
                "intake-prerequisite": (graph) =>
                  reusePublishedIntakePrerequisite(graph, prerequisite.graph),
              }
            : {},
          withCurrent: (request, sourceReleaseId, work) =>
            db(config.author.principalId, async (tx) => {
              const lock = await sql<{
                locked: boolean;
              }>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`dev-publication:${config.tenantId}:${request.entityCode}`},0)) AS locked`.execute(
                tx,
              );
              requireDev(
                lock.rows[0]?.locked,
                "DEV_PUBLICATION_ALREADY_RUNNING",
              );
              requireDev(
                (await current(request)).releaseId === sourceReleaseId,
                "DEV_PUBLICATION_SOURCE_CHANGED",
              );
              return work();
            }),
          asWorkload: async (id, work) => {
            const role =
              id === config.author.principalId ? "author" : "publisher";
            requireDev(
              id === config[role].principalId,
              "DEV_PUBLICATION_AUTH_REQUIRED",
            );
            await checkPrincipal(role);
            return runWithRequestContext(context(id), () =>
              work({
                service: options.service,
                authorize: async (permission, changeSetId) => {
                  await checkPrincipal(role);
                  const allowed =
                    role === "author"
                      ? ["metadata.entity.author", "metadata.entity.submit"]
                      : ["metadata.entity.review", "metadata.entity.publish"];
                  requireDev(
                    allowed.includes(permission),
                    "DEV_PUBLICATION_PERMISSION_DENIED",
                  );
                  await db(id, async (tx) => {
                    const cs = await new KyselyMetaEntityAuthoringRepository(
                      tx,
                    ).get(changeSetId);
                    requireDev(
                      cs &&
                        cs.tenantId === config.tenantId &&
                        cs.entityCode === config.entityCode,
                      "DEV_PUBLICATION_SCOPE_NOT_CONFIGURED",
                    );
                    if (permission !== "metadata.entity.author")
                      requireDev(
                        cs.createdBy === config.author.principalId &&
                          /^dev-publication-[a-f0-9]{24}$/.test(cs.branchCode),
                        "DEV_PUBLICATION_DRAFT_CONFLICT",
                      );
                    if (role === "publisher")
                      requireDev(
                        cs.submittedBy === config.author.principalId &&
                          cs.createdBy !== id &&
                          (permission === "metadata.entity.review"
                            ? cs.status === "in_review"
                            : cs.status === "approved" && cs.approvedBy === id),
                        "DEV_PUBLICATION_REVIEW_REQUIRED",
                      );
                  });
                },
              }),
            );
          },
          record: async (event) => {
            await runWithRequestContext(
              context(config.publisher.principalId),
              () =>
                db(config.publisher.principalId, (tx) =>
                  options.audit.record(
                    {
                      eventCode: String(event.event),
                      action: "dev_metadata_publication",
                      outcome: "success",
                      severity: "critical",
                      actor: {
                        kind: "service",
                        principalId: config.publisher.principalId,
                      },
                      tenantId: config.tenantId,
                      requestId,
                      correlationId: requestId,
                      metadata: {
                        ...event,
                        ...(prerequisite
                          ? { prerequisite: prerequisite.pin }
                          : {}),
                        authorId: config.author.principalId,
                        publisherId: config.publisher.principalId,
                      },
                    },
                    tx,
                  ),
                ),
            );
          },
        },
      );
      const result = await workflow.run(body, body.dryRun === true);
      res.setHeader("Cache-Control", "no-store");
      res.status(result.status === "dispatched" ? 202 : 200).json(result);
    })().catch((error) => {
      const code = error instanceof Error ? error.message : "";
      if (/^(DEV_PUBLICATION_|DEVELOPMENT_PUBLICATION_)[A-Z_]+$/.test(code)) {
        res
          .status(
            code.includes("AUTH_REQUIRED") || code.includes("REVOKED")
              ? 403
              : 409,
          )
          .json({ error: code });
      } else next(error);
    });
  });
}
