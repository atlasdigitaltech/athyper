import { createHash } from "node:crypto";
import { constants, readFileSync, lstatSync } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { sql, type Kysely } from "kysely";
import {
  createFileEntityReleaseReviewLoader,
  type createAuthenticatedEntityReleaseReview,
} from "@athyper/server-service-publication";
type Ports = Parameters<typeof createAuthenticatedEntityReleaseReview>[0];
type Database = Kysely<Record<string, never>>;
const hash = (b: string | Buffer) =>
  createHash("sha256").update(b).digest("hex");
/** Operator-pinned evidence; browser state and request JSON are never authority.
 * Any identity epoch change invalidates the historical review, including revocation.
 */
export function createDeploymentEntityReleaseReview(input: {
  root: string;
  manifestPins: Readonly<Record<string, string>>;
  evidenceRoot: string;
  neon: Database;
  studio: Database;
}): Ports {
  if (!isAbsolute(input.root) || !isAbsolute(input.evidenceRoot))
    throw Error("RELEASE_REVIEW_ABSOLUTE_ROOT_REQUIRED");
  const load = createFileEntityReleaseReviewLoader(
    input.root,
    input.manifestPins,
  );
  const scoped = <T>(
    db: Database,
    tenantId: string,
    work: (tx: Database) => Promise<T>,
  ) =>
    db.transaction().execute(async (tx) => {
      await sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`.execute(
        tx,
      );
      await sql`SELECT set_config('app.current_tenant_id',${tenantId},true)`.execute(
        tx,
      );
      return work(tx);
    });
  return {
    load,
    async currentReviewer(reviewer) {
      const loaded = await load(reviewer.coordinate);
      if (!loaded) return false;
      const state = loaded.state as any,
        nomination = loaded.nomination as any;
      const named = nomination.reviewers?.find(
        (r: any) => r.id === reviewer.reviewerId,
      );
      const receipts = state.receipts?.filter(
        (r: any) => r.actor.reviewerId === reviewer.reviewerId,
      );
      if (
        !named ||
        named.principalId !== reviewer.principalId ||
        receipts?.length !== 1 ||
        !reviewer.domains.every((d) => named.domains.includes(d))
      )
        return false;
      const epoch = receipts[0].actor.authEpoch;
      if (!Number.isSafeInteger(epoch) || epoch < 0) return false;
      return scoped(input.neon, reviewer.tenantId, async (tx) => {
        await sql`SELECT set_config('app.current_principal_id',${reviewer.principalId},true)`.execute(
          tx,
        );
        const result = await sql<{
          current: boolean;
        }>`SELECT EXISTS(SELECT 1 FROM master.principal p JOIN master.tenant t ON t.id=p.tenant_id WHERE p.id=${reviewer.principalId}::uuid AND p.tenant_id=${reviewer.tenantId}::uuid AND p.status='active' AND t.status='active' AND p.auth_epoch=${epoch} AND EXISTS(SELECT 1 FROM master.principal_identity_binding b WHERE b.tenant_id=p.tenant_id AND b.principal_id=p.id AND b.status='active' AND b.provider_code='keycloak')) AS current`.execute(
          tx,
        );
        return result.rows[0]?.current === true;
      });
    },
    async sourceCurrent(coordinate, raw) {
      const base = raw as any;
      if (
        !base ||
        base.tenantId !== coordinate.tenantId ||
        base.planeKey !== coordinate.plane ||
        !coordinate.tenantId
      )
        return false;
      if (base.kind === "reviewed_empty_target") {
        const keys = [
          "kind",
          "schemaVersion",
          "tenantId",
          "entityCode",
          "planeKey",
          "publicationKey",
          "descriptorHash",
        ];
        if (
          Object.keys(base).length !== keys.length ||
          Object.keys(base).some((k) => !keys.includes(k)) ||
          base.schemaVersion !== 1 ||
          base.entityCode !== coordinate.entityCode ||
          base.planeKey !== "neon" ||
          coordinate.releaseNo !== 1 ||
          typeof base.publicationKey !== "string" ||
          !/^[a-f0-9]{64}$/.test(base.descriptorHash)
        )
          return false;
        const empty = await scoped(
          input.neon,
          coordinate.tenantId,
          async (tx) => {
            const result = await sql<{
              current: boolean;
            }>`SELECT NOT EXISTS(SELECT 1 FROM runtime_meta.release_activation_head WHERE publication_key=${base.publicationKey}) AND NOT EXISTS(SELECT 1 FROM runtime_meta.entity_contract WHERE tenant_id=${coordinate.tenantId}::uuid AND entity_code=${coordinate.entityCode}) AND runtime_meta.fn_runtime_restoration_precondition_version()=1 AS current`.execute(
              tx,
            );
            return result.rows[0]?.current === true;
          },
        );
        if (!empty) return false;
        return scoped(input.studio, coordinate.tenantId, async (tx) => {
          const expected = {
            schemaVersion: 1,
            kind: base.kind,
            tenantId: base.tenantId,
            entityCode: base.entityCode,
            publicationKey: base.publicationKey,
            descriptorHash: base.descriptorHash,
          };
          const result = await sql<{
            current: boolean;
          }>`SELECT EXISTS(SELECT 1 FROM publication.release r JOIN publication.entity_runtime_restoration_link l ON l.publication_release_id=r.id AND l.tenant_id=r.tenant_id JOIN publication.fn_runtime_restoration_compilation_source(${coordinate.releaseId}::uuid) source ON source.publication_release_id=r.id WHERE r.id=${coordinate.releaseId}::uuid AND r.tenant_id=${coordinate.tenantId}::uuid AND r.release_no=1 AND r.status IN ('approved','published') AND l.descriptor_hash=${base.descriptorHash} AND l.runtime_precondition=${JSON.stringify(expected)}::jsonb AND source.entity_code=${coordinate.entityCode} AND source.plane_key=${coordinate.plane} AND encode(sha256(convert_to(publication.fn_successor_canonical_json(source.contract_json),'UTF8')),'hex')=${coordinate.contractHash}) AS current`.execute(
            tx,
          );
          return result.rows[0]?.current === true;
        });
      }
      if (base.kind !== undefined) return false;
      const active = await scoped(
        input.neon,
        coordinate.tenantId,
        async (tx) => {
          const result = await sql<{
            current: boolean;
          }>`SELECT EXISTS(SELECT 1 FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id JOIN runtime_meta.entity_contract c ON c.publication_key=h.publication_key AND c.release_id=a.source_release_id JOIN runtime_meta.entity_descriptor d ON d.entity_contract_id=c.id AND d.applied_release_id=a.id WHERE c.tenant_id=${coordinate.tenantId}::uuid AND d.tenant_id=c.tenant_id AND h.publication_key=${base.publicationKey} AND h.applied_release_id=${base.appliedReleaseId}::uuid AND h.row_version=${base.headVersion} AND a.source_release_id=${base.releaseId}::uuid AND h.source_release_no=${base.releaseNo} AND d.compiled_hash=${base.compiledHash} AND d.status='active' AND d.plane_code='neon' AND d.descriptor_kind='entity_runtime') AS current`.execute(
            tx,
          );
          return result.rows[0]?.current === true;
        },
      );
      if (!active) return false;
      return scoped(input.studio, coordinate.tenantId, async (tx) => {
        const result = await sql<{
          current: boolean;
        }>`SELECT EXISTS(SELECT 1 FROM publication.release r JOIN publication.entity_authorization_successor_link l ON l.publication_release_id=r.id AND l.tenant_id=r.tenant_id WHERE r.id=${coordinate.releaseId}::uuid AND r.tenant_id=${coordinate.tenantId}::uuid AND r.release_no=${coordinate.releaseNo} AND r.status IN ('approved','published') AND l.predecessor_release_id=${base.releaseId}::uuid AND NOT EXISTS(SELECT 1 FROM metadata.entity_baseline_import_revocation v WHERE v.baseline_id=l.baseline_id)) AS current`.execute(
          tx,
        );
        return result.rows[0]?.current === true;
      });
    },
    async evidenceCurrent(evidence) {
      const path = resolve(input.evidenceRoot, evidence.path);
      if (
        isAbsolute(evidence.path) ||
        !path.startsWith(resolve(input.evidenceRoot) + sep)
      )
        return false;
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 4 * 1024 * 1024 || stat.mode & 0o022)
          return false;
        return hash(await file.readFile()) === evidence.sha256;
      } finally {
        await file.close();
      }
    },
  };
}

/** Optional worker-only operator configuration; no implicit filesystem discovery. */
export function loadDeploymentEntityReleaseReview(
  path: string,
  databases: { neon: Database; studio: Database },
): Ports {
  if (!isAbsolute(path)) throw Error("RELEASE_REVIEW_CONFIG_PATH_INVALID");
  const stat = lstatSync(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.mode & 0o022 ||
    stat.size > 65536
  )
    throw Error("RELEASE_REVIEW_CONFIG_UNTRUSTED");
  const config = JSON.parse(readFileSync(path, "utf8"));
  if (
    config.schemaVersion !== 1 ||
    Object.keys(config).some(
      (k) =>
        !["schemaVersion", "root", "manifestPins", "evidenceRoot"].includes(k),
    ) ||
    typeof config.root !== "string" ||
    typeof config.evidenceRoot !== "string" ||
    !config.manifestPins ||
    typeof config.manifestPins !== "object" ||
    Array.isArray(config.manifestPins) ||
    !Object.keys(config.manifestPins).length
  )
    throw Error("RELEASE_REVIEW_CONFIG_INVALID");
  return createDeploymentEntityReleaseReview({ ...config, ...databases });
}
