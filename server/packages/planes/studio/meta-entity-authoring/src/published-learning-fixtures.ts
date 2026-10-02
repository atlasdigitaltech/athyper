import { sql, type Kysely } from "kysely";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { AuthoringPolicyError } from "@athyper/server-contract-meta-entity-authoring";
import type { LearningInboxOptions } from "./learning-inbox.js";
import { sha256 } from "./deterministic.js";
import { parsePublishedLearningFixtureSet } from "./published-learning-fixture-schema.js";

interface PublishedFixtureSource {
  readonly contract_json: MetaEntityGraph;
  readonly contract_hash: string;
  readonly single_author_history: boolean;
  readonly legacy_hash_matches?: boolean;
  readonly author_id: string;
  readonly approved_by: string;
  readonly approved_at: Date | string;
  readonly published_at: Date | string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Uses immutable Entity releases and ordinary independent authoring approval.
 * There is no file/config path through which a caller can assert reviewer identity. */
export function createPublishedLearningFixtureProvider(database: Kysely<Record<string, never>>): NonNullable<LearningInboxOptions["fixtureSets"]> {
  return {
    async resolve(context, id) {
      const parts = id.split("/");
      if (context.planeKey !== "studio" || parts.length !== 2 || !uuid.test(parts[0]!) || !/^[a-z][a-z0-9_.-]{1,126}$/.test(parts[1]!))
        throw unavailable();
      return database.transaction().execute(async tx => {
        await sql`SELECT set_config('app.current_tenant_id',${context.tenantId},true),set_config('app.current_principal_id',${context.principalId},true),set_config('app.current_atlas_plane','studio',true)`.execute(tx);
        const row = (await sql<PublishedFixtureSource>`SELECT rev.contract_json,rev.contract_hash,
            cs.created_by AS author_id,cs.approved_by,cs.approved_at,r.published_at,
            (EXISTS(SELECT 1 FROM snapshot.entity_draft_save saved
              WHERE saved.change_set_id=cs.id AND saved.tenant_id=cs.tenant_id AND saved.capture_kind='saved')
             AND NOT EXISTS(SELECT 1 FROM snapshot.entity_draft_save saved
              WHERE saved.change_set_id=cs.id AND saved.tenant_id=cs.tenant_id AND saved.capture_kind='saved'
                AND saved.captured_by<>cs.created_by)) AS single_author_history,
            (rev.contract_hash=r.contract_hash AND encode(sha256(convert_to(rev.contract_json::text,'UTF8')),'hex')=r.contract_hash) AS legacy_hash_matches
          FROM metadata.entity_release r
          JOIN metadata.entity_change_set cs ON cs.id=r.change_set_id AND cs.tenant_id=r.tenant_id
          JOIN snapshot.entity_contract_revision rev ON rev.id=r.revision_id AND rev.tenant_id=r.tenant_id
          WHERE r.id=${parts[0]}::uuid AND r.tenant_id=${context.tenantId}::uuid
            AND cs.status='published' AND cs.approved_by IS NOT NULL AND cs.approved_at IS NOT NULL
            AND cs.created_by<>cs.approved_by AND r.published_at IS NOT NULL
            AND r.contract_hash=rev.contract_hash`.execute(tx)).rows[0];
        if (!row) throw unavailable();
        return resolvePublishedLearningFixtureSource(id, parts[1]!, row);
      });
    },
  };
}

/** Pure integrity boundary, separately qualified against database publication tests. */
export function resolvePublishedLearningFixtureSource(id: string, key: string, row: PublishedFixtureSource) {
  const published = new Date(row.published_at);
  if (!Number.isFinite(published.getTime())) throw unavailable();
  const publishedAt = published.toISOString();
  if (row.single_author_history !== true || !uuid.test(row.author_id) || !uuid.test(row.approved_by) || row.author_id === row.approved_by ||
      !Number.isFinite(new Date(row.approved_at).getTime()) || new Date(row.approved_at) > new Date(publishedAt) ||
      (sha256(row.contract_json) !== row.contract_hash && row.legacy_hash_matches !== true)) throw unavailable();
  const declarations = row.contract_json.tests?.filter(test => test.key === key && test.assertion === "learning_fixture_set") ?? [];
  if (declarations.length !== 1 || declarations[0]!.path !== "entity") throw unavailable();
  const value = parsePublishedLearningFixtureSet(declarations[0]!.expected, String(row.contract_json.entity.entityCode));
  return { id, fixtures: value.fixtures, contentHash: sha256(value.fixtures), authorId: row.author_id,
    approvedBy: row.approved_by, lockedAt: publishedAt, entityCode: value.entityCode, originPlane: value.originPlane };
}
function unavailable() {
  return new AuthoringPolicyError("LEARNING_FIXTURE_SET_UNAVAILABLE", "Select a published fixture release from this tenant with independent approval");
}
