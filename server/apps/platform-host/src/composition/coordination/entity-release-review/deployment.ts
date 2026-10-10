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
    async sourceCurrent() {
      // Historical imported-baseline publication is retired. Native source
      // qualification is resolved by its separate installed contract.
      return false;
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
