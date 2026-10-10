import { sha256 as authoringHash } from "@athyper/server-plane-studio";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { sql, type Kysely } from "kysely";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import { runWithRequestContext } from "@athyper/server-foundation/context";
import type { KyselyPublicationAuthorityWork } from "@athyper/server-service-publication";
import type { LoadedPublicationArtifact } from "@athyper/server-contract-publication";
import {
  loadDevPublicationConfiguration,
  type DevPublicationConfiguration,
} from "./publication.js";
type Compilation = NonNullable<
  ConstructorParameters<
    typeof KyselyPublicationAuthorityWork
  >[0]["authorizationCompilation"]
>;
type Review = NonNullable<Compilation["review"]>;
export type DevReleaseCoordinate = Parameters<Review["qualify"]>[0];
type Db = Kysely<Record<string, never>>;
const stable = (v: any): any =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, stable(v[k])]),
        )
      : v;
const digest = (v: string | Uint8Array) =>
  createHash("sha256").update(v).digest("hex");
const hash = (v: unknown) => digest(JSON.stringify(stable(v)));
function check(ok: unknown, code: string): asserts ok {
  if (!ok) throw Error(code);
}
export interface DevRuntimeQualification {
  schemaVersion: 1;
  kind: "devfull_runtime_qualification";
  coordinate: DevReleaseCoordinate;
  signingKeyId: string;
  qualifiedAt: string;
  expiresAt: string;
  checks: readonly {
    kind: "build" | "tests" | "source";
    path: string;
    sha256: string;
  }[];
}
/** Workload authority is deliberately separate from authenticated human reviews. */
export function assertDevRuntimeQualification(
  config: DevPublicationConfiguration,
  qualification: DevRuntimeQualification,
  coordinate: DevReleaseCoordinate,
  signingKeyId: string,
  now = Date.now(),
) {
  check(
    config.runtimeApproval &&
      qualification.schemaVersion === 1 &&
      qualification.kind === "devfull_runtime_qualification",
    "DEV_RUNTIME_APPROVAL_REQUIRED",
  );
  check(
    coordinate.releaseId === config.runtimeApproval.releaseId &&
      coordinate.tenantId === config.tenantId &&
      coordinate.entityCode === config.entityCode &&
      config.targets.includes(coordinate.plane as never),
    "DEV_RUNTIME_SCOPE_DENIED",
  );
  check(
    hash(qualification.coordinate) === hash(coordinate),
    "DEV_RUNTIME_COORDINATE_CHANGED",
  );
  check(
    qualification.signingKeyId === signingKeyId && Boolean(signingKeyId),
    "DEV_RUNTIME_SIGNING_KEY_CHANGED",
  );
  const start = Date.parse(qualification.qualifiedAt),
    end = Date.parse(qualification.expiresAt);
  check(
    Number.isFinite(start) &&
      Number.isFinite(end) &&
      start <= now &&
      now < end &&
      end - start <= 86400000,
    "DEV_RUNTIME_QUALIFICATION_EXPIRED",
  );
  check(
    Array.isArray(qualification.checks) &&
      ["build", "tests", "source"].every((kind) =>
        qualification.checks.some((c) => c.kind === kind),
      ) &&
      qualification.checks.every(
        (c) => isAbsolute(c.path) && /^[a-f0-9]{64}$/.test(c.sha256),
      ),
    "DEV_RUNTIME_EVIDENCE_REQUIRED",
  );
}
async function trustedBytes(
  path: string,
  expected: string,
  maxSize = 8 * 1024 * 1024,
) {
  check(
    isAbsolute(path) && /^[a-f0-9]{64}$/.test(expected),
    "DEV_RUNTIME_EVIDENCE_INVALID",
  );
  const f = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await f.stat();
    check(
      stat.isFile() && !(stat.mode & 0o022) && stat.size <= maxSize,
      "DEV_RUNTIME_EVIDENCE_UNTRUSTED",
    );
    const bytes = await f.readFile();
    check(digest(bytes) === expected, "DEV_RUNTIME_EVIDENCE_CHANGED");
    return bytes;
  } finally {
    await f.close();
  }
}
export function createDevRuntimePublication(options: {
  environment: string;
  database: Db;
  signingKeyId: string;
  audit: AuditRecorder<any>;
  compilation: Compilation;
  env?: NodeJS.ProcessEnv;
}) {
  const env = options.env ?? process.env;
  const configuration = () => {
    const config = loadDevPublicationConfiguration(env, options.environment);
    check(config?.runtimeApproval, "DEV_RUNTIME_APPROVAL_REQUIRED");
    return config;
  };
  async function qualification(config: DevPublicationConfiguration) {
    const pin = config.runtimeApproval!;
    return JSON.parse(
      (await trustedBytes(pin.path, pin.sha256, 1048576)).toString(),
    ) as DevRuntimeQualification;
  }
  async function scoped<T>(
    config: DevPublicationConfiguration,
    work: (tx: Db) => Promise<T>,
  ) {
    return options.database.transaction().execute(async (tx) => {
      await sql`SELECT set_config('app.current_tenant_id',${config.tenantId},true),set_config('app.current_principal_id',${config.publisher.principalId},true),set_config('app.current_actor_type','service_account',true)`.execute(
        tx,
      );
      return work(tx);
    });
  }
  async function qualify(coordinate: DevReleaseCoordinate, activation = false) {
    const config = configuration(),
      q = await qualification(config);
    assertDevRuntimeQualification(config, q, coordinate, options.signingKeyId);
    for (const e of q.checks) await trustedBytes(e.path, e.sha256);
    return scoped(config, async (tx) => {
      for (const role of ["author", "publisher"] as const) {
        const p = config[role];
        const active =
          await sql`SELECT p.id FROM master.principal p JOIN master.tenant t ON t.id=p.tenant_id
          WHERE p.tenant_id=${config.tenantId}::uuid AND p.id=${p.principalId}::uuid AND p.code=${p.code}
          AND p.principal_type='service_account' AND p.provisioning_source='internal' AND p.status='active'
          AND t.status='active' AND p.auth_epoch=${p.authEpoch} AND p.metadata->'devPublication'->>'role'=${role}
          AND p.metadata->'devPublication'->>'instance'='dev'`.execute(tx);
        check(active.rows.length === 1, "DEV_PUBLICATION_WORKLOAD_REVOKED");
      }
      const release = (
        await sql<any>`SELECT r.contract_hash,s.contract_json,c.id change_set_id,c.created_by,c.submitted_by,c.approved_by,r.published_by,c.branch_code,
        (SELECT jsonb_build_object('id',a.id::text,'savedHash',a.context->>'savedHash') FROM audit.audit_log a WHERE a.tenant_id=c.tenant_id AND a.event_code='metadata.development_publication.approved'
          AND a.actor_type='service_account' AND a.actor_principal_id=${config.publisher.principalId}::uuid AND a.outcome='success'
          AND a.context->>'changeSetId'=c.id::text
          AND a.context->>'mode'='development_auto_approval' AND a.context->>'authorId'=${config.author.principalId}
          AND a.context->>'publisherId'=${config.publisher.principalId} ORDER BY a.occurred_at LIMIT 1) approval,
        (SELECT id::text FROM audit.audit_log a WHERE a.tenant_id=c.tenant_id AND a.event_code='metadata.development_publication.dispatched'
          AND a.actor_type='service_account' AND a.actor_principal_id=${config.publisher.principalId}::uuid AND a.outcome='success'
          AND a.context->'release'->>'id'=r.id::text AND a.context->>'mode'='development_auto_approval'
          AND a.context->'request'->'scope'->>'tenantId'=${config.tenantId} AND a.context->'request'->>'entityCode'=${config.entityCode}
          AND a.context->'request'->'targets' ? ${coordinate.plane} ORDER BY a.occurred_at LIMIT 1) dispatch_id
        FROM metadata.entity_release r JOIN metadata.entity_change_set c ON c.id=r.change_set_id AND c.tenant_id=r.tenant_id
        JOIN snapshot.entity_contract_revision s ON s.id=r.revision_id AND s.tenant_id=r.tenant_id
        JOIN metadata.entity e ON e.id=r.entity_id AND e.tenant_id=r.tenant_id
        WHERE r.id=${coordinate.releaseId}::uuid AND r.tenant_id=${config.tenantId}::uuid AND e.entity_code=${config.entityCode}
          AND c.status='published' AND r.contract_signature IS NOT NULL`.execute(
          tx,
        )
      ).rows[0];
      check(
        release &&
          release.created_by === config.author.principalId &&
          release.submitted_by === config.author.principalId &&
          release.approved_by === config.publisher.principalId &&
          release.published_by === config.publisher.principalId &&
          /^dev-publication-[a-f0-9]{24}$/.test(release.branch_code) &&
          release.approval?.id &&
          release.approval.savedHash === authoringHash(release.contract_json) &&
          release.dispatch_id,
        "DEV_RUNTIME_WORKLOAD_PROVENANCE_REQUIRED",
      );
      const receiptSha256 = hash({
        mode: "development_auto_approval",
        coordinate,
        qualificationSha256: config.runtimeApproval!.sha256,
        authorId: config.author.principalId,
        authorEpoch: config.author.authEpoch,
        publisherId: config.publisher.principalId,
        publisherEpoch: config.publisher.authEpoch,
        approvalAuditId: release.approval.id,
        dispatchAuditId: release.dispatch_id,
      });
      const requestId = randomUUID();
      await runWithRequestContext(
        {
          requestId,
          correlationId: requestId,
          planeKey: "studio",
          tenantId: config.tenantId,
          principalId: config.publisher.principalId,
        },
        () =>
          options.audit.record(
            {
              eventCode: activation
                ? "metadata.development_runtime.activation_authorized"
                : "metadata.development_runtime.qualified",
              action: "dev_runtime_publication",
              outcome: "success",
              severity: "critical",
              tenantId: config.tenantId,
              actor: {
                kind: "service",
                principalId: config.publisher.principalId,
              },
              requestId,
              correlationId: requestId,
              metadata: {
                mode: "development_auto_approval",
                coordinate,
                receiptSha256,
                approvalAuditId: release.approval.id,
                dispatchAuditId: release.dispatch_id,
              },
            },
            tx,
          ),
      );
      return { receiptSha256, mode: "development_auto_approval" as const };
    });
  }
  return {
    review: {
      async qualify(coordinate: DevReleaseCoordinate) {
        const config = loadDevPublicationConfiguration(
          env,
          options.environment,
        );
        if (
          (!config?.runtimeApproval ||
            coordinate.releaseId !== config.runtimeApproval.releaseId) &&
          options.compilation.review
        )
          return options.compilation.review.qualify(coordinate);
        return qualify(coordinate);
      },
    } satisfies Review,
    async authorizeActivation(
      releaseId: string,
      loaded?: LoadedPublicationArtifact,
    ): Promise<{ receiptSha256: string }> {
      const envelope = loaded?.document.envelope;
      if (!envelope || envelope.artifactKind !== "entity_runtime")
        throw Error("DEV_RUNTIME_ACTIVATION_COORDINATE_REQUIRED");
      const contract = envelope.payload.entityContract;
      const descriptor = envelope.payload.entityDescriptor;
      const profile = descriptor.descriptor["authorization"];
      const runtime = descriptor.descriptor["authorizationRuntime"];
      if (
        !profile ||
        !runtime ||
        !Array.isArray((profile as { operations?: unknown }).operations)
      )
        throw Error("DEV_RUNTIME_ACTIVATION_COORDINATE_REQUIRED");
      return qualify(
        {
          releaseId,
          releaseNo: contract.releaseNo,
          tenantId: contract.tenantId ?? null,
          plane: descriptor.plane,
          entityCode: contract.entityCode,
          contractHash: contract.contractHash,
          profileHash: hash(profile),
          runtimeHash: hash(runtime),
          catalogHash: hash(await options.compilation.catalog(descriptor.plane)),
          operationKeys: (profile as { operations: { key: string }[] }).operations
            .map((operation) => operation.key)
            .sort(),
        },
        true,
      );
    },
  };
}
