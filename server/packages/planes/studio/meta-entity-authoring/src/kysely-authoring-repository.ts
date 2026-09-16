import { normalizeGraphStorageOrder } from "./graph-storage-order.js";
import { randomUUID } from "node:crypto";
import { sql, type Kysely, type Transaction } from "kysely";
import type {
  ContractTestReport,
  MetaEntityAuthoringRepository,
  MetaEntityChangeSet,
  MetaEntityGraph,
  SignedMetaEntityArtifact,
  ValidationReport,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  AuthoringConflictError,
  AuthoringPolicyError,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  canonicalJson,
  sha256,
  validateGraph,
  compileGraph,
} from "./deterministic.js";
import { parseEntityRegistration } from "./entity-registration.js";
import { cloneGraphIds } from "./graph-identity.js";

type Database = Record<string, never>;
interface JsonRow {
  readonly value: unknown;
}
interface EntityHeaderRow {
  readonly entity_code: unknown;
  readonly entity_class: unknown;
  readonly ownership_model: unknown;
}
interface ChangeSetRow {
  readonly id: unknown;
  readonly tenant_id: unknown;
  readonly entity_id: unknown;
  readonly entity_code?: unknown;
  readonly branch_code: unknown;
  readonly status: unknown;
  readonly lock_version: unknown;
  readonly created_by: unknown;
  readonly submitted_by?: unknown;
  readonly reviewed_by?: unknown;
  readonly approved_by?: unknown;
}
interface CoordinateRow {
  readonly tenant_id: unknown;
  readonly entity_id: unknown;
}
interface AdvanceRow {
  readonly revision: unknown;
}
interface RevisionRow {
  readonly id: unknown;
  readonly revision_no: unknown;
  readonly revision_hash: unknown;
  readonly contract_hash: unknown;
  readonly contract_json?: unknown;
}
interface ParentRevisionRow {
  readonly id: unknown;
  readonly revision_hash: unknown;
}
interface ReleaseRow {
  readonly id: unknown;
  readonly release_no: unknown;
  readonly revision_id?: unknown;
  readonly contract_hash?: unknown;
  readonly revision_hash?: unknown;
}
interface ArtifactRow {
  readonly contract_hash: unknown;
  readonly signature_algorithm: unknown;
  readonly signing_key_id: unknown;
  readonly contract_signature: unknown;
  readonly compiled_hash: unknown;
  readonly compiled_json: unknown;
}

export class KyselyMetaEntityAuthoringRepository implements MetaEntityAuthoringRepository {
  constructor(
    private readonly database: Kysely<Database>,
    private readonly prepareRelease?: (
      database: Kysely<Database>,
      input: {
        releaseId: string;
        artifact: SignedMetaEntityArtifact;
        targetPlanes: readonly string[];
      },
    ) => Promise<void>,
  ) {}
  async listInspectionReleases(tenantId: string) {
    const result = await sql<import("@athyper/server-contract-meta-entity-authoring").MetaEntityInspectionRelease>`
      SELECT r.id::text, e.entity_code AS "entityCode", r.change_set_id::text AS "changeSetId",
        r.release_no::integer AS "releaseNo", r.contract_hash AS "contractHash",
        r.target_planes AS "targetPlanes", r.published_at::text AS "publishedAt"
      FROM metadata.entity_release r JOIN metadata.entity e ON e.id=r.entity_id
      WHERE r.tenant_id=${tenantId}::uuid AND e.entity_code='business_partner'
      ORDER BY r.release_no DESC LIMIT 100`.execute(this.database);
    return result.rows;
  }
  async readInspectionRelease(tenantId: string, releaseId: string) {
    const result = await sql<{release: import("@athyper/server-contract-meta-entity-authoring").MetaEntityInspectionRelease; graph: MetaEntityGraph; legacyHashMatches: boolean}>`
      SELECT jsonb_build_object('id',r.id,'entityCode',e.entity_code,'changeSetId',r.change_set_id,
        'releaseNo',r.release_no,'contractHash',r.contract_hash,'targetPlanes',r.target_planes,
        'publishedAt',r.published_at) AS release, snapshot.contract_json AS graph,
        (snapshot.contract_hash=r.contract_hash AND
          encode(sha256(convert_to(snapshot.contract_json::text,'UTF8')),'hex')=r.contract_hash)
          AS "legacyHashMatches"
      FROM metadata.entity_release r JOIN metadata.entity e ON e.id=r.entity_id
      JOIN snapshot.entity_contract_revision snapshot ON snapshot.id=r.revision_id
        AND snapshot.tenant_id=r.tenant_id AND snapshot.entity_id=r.entity_id
      WHERE r.tenant_id=${tenantId}::uuid AND r.id=${releaseId}::uuid
        AND e.entity_code='business_partner'`.execute(this.database);
    const row = result.rows[0];
    if (!row) return null;
    // Early SQL-authored releases hashed PostgreSQL jsonb text. Verify that
    // representation against both stored hashes; never trust a stored hash alone.
    if (sha256(row.graph) !== row.release.contractHash && row.legacyHashMatches !== true)
      throw new AuthoringConflictError("Stored release graph does not match its contract hash");
    return { release: row.release, graph: row.graph };
  }
  async list(tenantId: string) {
    const rows =
      await sql<ChangeSetRow>`SELECT cs.*,e.entity_code FROM metadata.entity_change_set cs JOIN metadata.entity e ON e.id=cs.entity_id WHERE cs.tenant_id=${tenantId}::uuid AND cs.status IN ('draft','in_review','approved','published') ORDER BY cs.created_at DESC LIMIT 100`.execute(
        this.database,
      );
    return rows.rows.map((row) => this.map(row));
  }
  async listDraftSaves(id: string) {
    const result = await sql<{revision: number; capturedAt: string; kind: string}>`SELECT lock_version AS revision, captured_at::text AS "capturedAt", capture_kind AS kind FROM snapshot.entity_draft_save WHERE change_set_id=${id}::uuid ORDER BY lock_version DESC`.execute(this.database);
    return result.rows.map(row => ({...row, revision: Number(row.revision)}));
  }
  async readDraftSave(id: string, revision: number) {
    const result = await sql<{graph: MetaEntityGraph; graph_hash: string}>`SELECT graph, graph_hash FROM snapshot.entity_draft_save WHERE change_set_id=${id}::uuid AND lock_version=${revision}`.execute(this.database);
    const row = result.rows[0];
    if (!row) return null;
    if (sha256(row.graph) !== row.graph_hash) throw new AuthoringConflictError("Saved history integrity check failed");
    return row.graph;
  }
  async forkDraft(input: { sourceChangeSetId: string; actorId: string }) {
    return atomic(this.database, async (tx) => {
      const repository = new KyselyMetaEntityAuthoringRepository(tx);
      const source = await repository.get(input.sourceChangeSetId);
      if (!source || source.status !== "published")
        throw new AuthoringPolicyError(
          "PUBLISHED_SOURCE_REQUIRED",
          "Choose a published source for a new working draft",
        );
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${source.tenantId}:${source.entityId}:local-preview`},0))`.execute(
        tx,
      );
      const existing =
        await sql<ChangeSetRow>`SELECT cs.*,e.entity_code FROM metadata.entity_change_set cs JOIN metadata.entity e ON e.id=cs.entity_id WHERE cs.entity_id=${source.entityId}::uuid AND cs.tenant_id IS NOT DISTINCT FROM ${source.tenantId}::uuid AND cs.branch_code='local-preview' AND cs.status IN ('draft','in_review','approved') LIMIT 1`.execute(
          tx,
        );
      if (existing.rows[0]) {
        const current = repository.map(existing.rows[0]);
        if (current.status === "draft" && current.createdBy === input.actorId)
          return current;
        throw new AuthoringConflictError(
          "An open local working draft already exists; open it before creating another",
        );
      }
      const graph = cloneGraphIds(await repository.loadGraph(source.id));
      const draft = await repository.createDraft({
        tenantId: source.tenantId,
        entityId: source.entityId,
        entityCode: source.entityCode,
        branchCode: "local-preview",
        title: `${source.entityCode} working draft`,
        actorId: input.actorId,
      });
      return repository.replaceGraph({
        changeSetId: draft.id,
        expectedRevision: draft.revision,
        graph,
        actorId: input.actorId,
      });
    });
  }
  async createDraft(
    input: Parameters<MetaEntityAuthoringRepository["createDraft"]>[0],
  ) {
    const id = randomUUID(),
      code = `${input.branchCode.replace(/[^a-z0-9_.-]/g, "-")}.${id}`.slice(
        0,
        127,
      );
    if (!/^[a-z][a-z0-9_]{1,62}$/.test(input.entityCode))
      throw new TypeError("Canonical entity code required");
    const registration = parseEntityRegistration(input.registration);
    if (registration && !input.tenantId)
      throw new AuthoringPolicyError(
        "FORBIDDEN",
        "Draft registration requires tenant authoring authority",
      );
    return atomic(this.database, async (tx) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([input.tenantId, input.entityCode])},0))`.execute(
        tx,
      );
      if (registration) {
        // Inserts only a draft identity. Conflicts fail; no existing identity,
        // publication, grant, or retired row is reactivated.
        const inserted =
          await sql`INSERT INTO metadata.entity(id,tenant_id,module_id,entity_code,entity_class,ownership_model,status,created_by)
        SELECT ${input.entityId}::uuid,${input.tenantId}::uuid,m.id,${input.entityCode},${registration.entityClass}::metadata.entity_class_d,${registration.ownershipModel}::metadata.entity_ownership_d,'draft',${input.actorId}::uuid
        FROM control.module m WHERE m.code=${registration.moduleCode} AND m.status='active' RETURNING id`.execute(
            tx,
          );
        if (inserted.rows.length !== 1)
          throw new AuthoringPolicyError(
            "ENTITY_MODULE_UNAVAILABLE",
            "An active module is required",
          );
      }
      const entity =
        await sql`SELECT id FROM metadata.entity WHERE id=${input.entityId}::uuid AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid AND entity_code=${input.entityCode} AND status IN ('draft','active') FOR SHARE`.execute(
          tx,
        );
      if (entity.rows.length !== 1)
        throw new AuthoringPolicyError(
          "ENTITY_IDENTITY_UNAVAILABLE",
          "A matching draft or active entity identity is required",
        );
      const result =
        await sql<ChangeSetRow>`INSERT INTO metadata.entity_change_set(id,tenant_id,entity_id,change_set_code,branch_code,title,created_by)
      VALUES(${id}::uuid,${input.tenantId}::uuid,${input.entityId}::uuid,${code},${input.branchCode},${input.title},${input.actorId}::uuid) RETURNING *`.execute(
          tx,
        );
      return this.map({
        ...required(result.rows[0]),
        entity_code: input.entityCode,
      });
    });
  }
  async get(id: string) {
    const result =
      await sql<ChangeSetRow>`SELECT cs.*,e.entity_code FROM metadata.entity_change_set cs JOIN metadata.entity e ON e.id=cs.entity_id WHERE cs.id=${id}::uuid`.execute(
        this.database,
      );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }
  async loadGraph(id: string): Promise<MetaEntityGraph> {
    const header = required(
      (
        await sql<EntityHeaderRow>`SELECT e.entity_code,e.entity_class,e.ownership_model FROM metadata.entity_change_set cs JOIN metadata.entity e ON e.id=cs.entity_id WHERE cs.id=${id}::uuid`.execute(
          this.database,
        )
      ).rows[0],
    );
    const rows = async (table: GraphTable) => {
      const result =
        table === "entity_class_profile"
          ? await sql<JsonRow>`SELECT to_jsonb(t) AS value FROM metadata.entity_class_profile t WHERE entity_class=${string(header, "entity_class")} LIMIT 1`.execute(
              this.database,
            )
          : await sql<JsonRow>`SELECT to_jsonb(t) AS value FROM ${sql.table(`metadata.${table}`)} t WHERE change_set_id=${id}::uuid ORDER BY id`.execute(
              this.database,
            );
      return result.rows.map((row) => object(row.value));
    };
    const branch = async <T extends object>(table: GraphTable): Promise<T[]> =>
      (await rows(table)).map((row) =>
        decodeRow<T>(row, BRANCH_COLUMNS[table]),
      );
    return {
      contractSchema: "athyper.meta-entity-contract/2.1",
      entity: {
        entityCode: string(header, "entity_code"),
        entityClass: string(header, "entity_class"),
        ownershipModel: string(header, "ownership_model"),
      },
      classProfiles: await branch("entity_class_profile"),
      runtimeProfiles: await branch("entity_runtime_profile"),
      fields: await branch("entity_field"),
      keys: await branch("entity_key"),
      keyFields: await branch("entity_key_field"),
      searchProfiles: await branch("entity_search_profile"),
      searchFields: await branch("entity_search_field"),
      relations: await branch("entity_relation"),
      relationTargets: await branch("entity_relation_target"),
      relationFields: await branch("entity_relation_field"),
      operations: await branch("entity_operation"),
      operationPermissions: await branch("entity_operation_permission"),
      operationRules: await branch("entity_operation_rule"),
      operationScopeBindings: await branch("entity_operation_scope_binding"),
      surfaces: await branch("entity_surface"),
      surfaceSections: await branch("entity_surface_section"),
      surfaceFieldBindings: await branch("entity_surface_field_binding"),
      surfaceOperations: await branch("entity_surface_operation"),
      flows: await branch("entity_flow"),
      flowSteps: await branch("entity_flow_step"),
      lifecycleBindings: await branch("entity_lifecycle_binding"),
      lifecycleOperationBindings: await branch(
        "entity_lifecycle_operation_binding",
      ),
      policyBindings: await branch("entity_policy_binding"),
      fieldPolicyBindings: await branch("entity_field_policy_binding"),
      numberingBindings: await branch("entity_numbering_binding"),
      tests: (await rows("entity_contract_test_case")).map((row) => {
        const context = object(row["input_context"]);
        return {
          key: String(row["test_key"]),
          assertion: (context["assertion"] === "path_equals"
            ? "path_equals"
            : "path_exists") as "path_exists" | "path_equals",
          path: String(context["path"] ?? ""),
          ...(context["expected"] !== undefined
            ? { expected: context["expected"] }
            : {}),
        };
      }),
    };
  }
  async replaceGraph(
    input: Parameters<MetaEntityAuthoringRepository["replaceGraph"]>[0],
  ) {
    const validation = validateGraph(input.graph);
    if (validation.issues.length)
      throw new AuthoringConflictError(
        `Invalid graph: ${validation.issues[0]?.path}`,
      );
    await atomic(this.database, (tx) => replaceGraphInTransaction(tx, input));
    return required(await this.get(input.changeSetId));
  }
  /** Keeps imported draft creation and graph replacement inside the transfer transaction. */
  async replaceGraphInTransaction(
    input: Parameters<MetaEntityAuthoringRepository["replaceGraph"]>[0],
    transaction: Kysely<Database>,
  ) {
    const validation = validateGraph(input.graph);
    if (validation.issues.length)
      throw new AuthoringConflictError(
        `Invalid graph: ${validation.issues[0]?.path}`,
      );
    await replaceGraphInTransaction(transaction, input);
    return this.map(
      required(
        (
          await sql<ChangeSetRow>`SELECT cs.*,e.entity_code FROM metadata.entity_change_set cs JOIN metadata.entity e ON e.id=cs.entity_id WHERE cs.id=${input.changeSetId}::uuid`.execute(
            transaction,
          )
        ).rows[0],
      ),
    );
  }
  async recordValidation(
    id: string,
    revision: number,
    report: ValidationReport,
    actorId: string,
  ) {
    const graph = await this.loadGraph(id),
      current = required(await this.get(id));
    if (current.revision !== revision)
      throw new AuthoringConflictError("Validation revision is stale");
    if (sha256(graph) !== report.contractHash)
      throw new AuthoringConflictError(
        "Validation report does not match the current graph",
      );
    await atomic(this.database, async (tx) => {
      const locked = (
        await sql`SELECT id FROM metadata.entity_change_set WHERE id=${id}::uuid AND lock_version=${revision} FOR UPDATE`.execute(
          tx,
        )
      ).rows[0];
      if (!locked)
        throw new AuthoringConflictError("Validation revision is stale");
      const parent = (
        await sql<{
          id: string;
          revision_no: number;
          revision_hash: string;
          contract_json: unknown;
          validation_status: string;
        }>`SELECT id,revision_no,revision_hash,contract_json,validation_status FROM snapshot.entity_contract_revision WHERE change_set_id=${id}::uuid ORDER BY revision_no DESC LIMIT 1`.execute(
          tx,
        )
      ).rows[0];
      const status = report.issues.length ? "invalid" : "valid";
      if (
        parent &&
        sha256(parent.contract_json) === report.contractHash &&
        parent.validation_status === status
      )
        return;
      // Snapshot revision numbers form their own contiguous chain; authoring lock
      // versions also advance during submit/review and are not snapshot numbers.
      await sql`INSERT INTO snapshot.entity_contract_revision(tenant_id,entity_id,change_set_id,revision_no,parent_revision_id,parent_revision_hash,base_release_id,contract_schema_code,contract_schema_version,contract_json,contract_hash,revision_hash,payload_size_bytes,validation_status,validation_diagnostics,captured_by)
        SELECT ${current.tenantId}::uuid,${current.entityId}::uuid,${id}::uuid,${parent ? Number(parent.revision_no) + 1 : 1},${parent?.id ?? null}::uuid,${parent?.revision_hash ?? null},base_release_id,'athyper.meta-entity-contract','2.1',${canonicalJson(graph)}::jsonb,${report.contractHash},${sha256({ report, revision })},${Buffer.byteLength(canonicalJson(graph))},${status},${JSON.stringify(report.issues)}::jsonb,${actorId}::uuid FROM metadata.entity_change_set WHERE id=${id}::uuid`.execute(
        tx,
      );
    });
  }

  async recordTestRun(
    id: string,
    revision: number,
    report: ContractTestReport,
    actorId: string,
  ) {
    const graph = await this.loadGraph(id),
      current = required(await this.get(id));
    if (current.revision !== revision)
      throw new AuthoringConflictError("Test revision is stale");
    if (sha256(graph) !== report.contractHash)
      throw new AuthoringConflictError(
        "Test report does not match the current graph",
      );
    if (!current.tenantId) return;
    await sql`INSERT INTO snapshot.entity_contract_test_run(tenant_id,source_tenant_id,entity_id,change_set_id,source_lock_version,contract_schema_code,contract_schema_version,source_contract_json,source_contract_hash,runner_code,runner_version,status,total_count,passed_count,failed_count,error_count,duration_ms,run_hash,executed_by)
      VALUES(${current.tenantId}::uuid,${current.tenantId}::uuid,${current.entityId}::uuid,${id}::uuid,${revision},'athyper.meta-entity-contract','2.1',${canonicalJson(graph)}::jsonb,${report.contractHash},'athyper.contract-tests','1.0.0',${report.passed ? "passed" : "failed"},${report.results.length},${report.results.filter((x) => x.passed).length},${report.results.filter((x) => !x.passed).length},0,0,${sha256(report)},${actorId}::uuid)`.execute(
      this.database,
    );
  }
  async transition(
    input: Parameters<MetaEntityAuthoringRepository["transition"]>[0],
  ) {
    const result =
      await sql<ChangeSetRow>`UPDATE metadata.entity_change_set SET status=${input.to}::metadata.entity_change_set_status_d,status_changed_by=${input.actorId}::uuid,rejection_reason=${input.to === "rejected" ? (input.breakGlass?.reason ?? "Rejected by reviewer") : null} WHERE id=${input.changeSetId}::uuid AND lock_version=${input.expectedRevision} AND status=${input.from}::metadata.entity_change_set_status_d RETURNING *`.execute(
        this.database,
      );
    if (!result.rows[0])
      throw new AuthoringConflictError("Stale authoring revision or state");
    return this.map(result.rows[0]);
  }
  async createRelease(
    input: Parameters<MetaEntityAuthoringRepository["createRelease"]>[0],
  ) {
    return atomic(this.database, async (tx) => {
      const cs = required(
        (
          await sql<ChangeSetRow>`SELECT * FROM metadata.entity_change_set WHERE id=${input.changeSetId}::uuid AND lock_version=${input.expectedRevision} AND status='approved' FOR UPDATE`.execute(
            tx,
          )
        ).rows[0],
      );
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${cs["tenant_id"] ?? "global"}:${cs["entity_id"]}`},0))`.execute(
        tx,
      );
      const revision =
        input.releaseKind === "rollback"
          ? required(
              (
                await sql<RevisionRow>`SELECT revision.id,revision.revision_no,revision.revision_hash,revision.contract_hash FROM metadata.entity_release prior JOIN snapshot.entity_contract_revision revision ON revision.id=prior.revision_id WHERE prior.id=${input.rollbackOfReleaseId ?? null}::uuid AND prior.entity_id=${cs["entity_id"]}::uuid AND prior.tenant_id IS NOT DISTINCT FROM ${cs["tenant_id"]}::uuid LIMIT 1`.execute(
                  tx,
                )
              ).rows[0],
            )
          : required(
              (
                await sql<RevisionRow>`SELECT id,revision_no,revision_hash,contract_hash,contract_json FROM snapshot.entity_contract_revision WHERE change_set_id=${input.changeSetId}::uuid AND validation_status='valid' ORDER BY revision_no DESC LIMIT 1`.execute(
                  tx,
                )
              ).rows[0],
            );
      if (
        (revision.contract_json
          ? sha256(revision.contract_json)
          : String(revision["contract_hash"])) !== input.artifact.contractHash
      )
        throw new AuthoringConflictError(
          "Signed artifact does not match the current validated revision",
        );
      const previous = (
        await sql<ReleaseRow>`SELECT id,release_no FROM metadata.entity_release WHERE entity_id=${cs["entity_id"]}::uuid AND tenant_id IS NOT DISTINCT FROM ${cs["tenant_id"]}::uuid ORDER BY release_no DESC LIMIT 1`.execute(
          tx,
        )
      ).rows[0];
      const releaseId = randomUUID(),
        releaseNo = previous ? Number(previous["release_no"]) + 1 : 1;
      await sql`INSERT INTO metadata.entity_release(id,tenant_id,entity_id,change_set_id,revision_id,release_no,release_kind,supersedes_release_id,rollback_of_release_id,contract_schema_code,contract_schema_version,contract_hash,revision_hash,release_hash,compatibility_level,target_planes,signature_algorithm,signing_key_id,contract_signature,published_by) VALUES(${releaseId}::uuid,${cs["tenant_id"] ?? null}::uuid,${cs["entity_id"]}::uuid,${input.changeSetId}::uuid,${revision["id"]}::uuid,${releaseNo},${input.releaseKind},${previous?.["id"] ?? null}::uuid,${input.rollbackOfReleaseId ?? null}::uuid,'athyper.meta-entity-contract','2.1',${input.artifact.contractHash},${revision["revision_hash"]},${input.artifact.descriptorHash},'backward_compatible',${input.targetPlanes}::text[],${input.artifact.signatureAlgorithm},${input.artifact.signingKeyId},${input.artifact.signature},${input.actorId}::uuid)`.execute(
        tx,
      );
      if (this.prepareRelease)
        await this.prepareRelease(tx, {
          releaseId,
          artifact: input.artifact,
          targetPlanes: input.targetPlanes,
        });
      return { id: releaseId, releaseNo };
    });
  }
  async getSignedRelease(id: string) {
    const result =
      await sql<ArtifactRow>`SELECT r.contract_hash,r.signature_algorithm,r.signing_key_id,r.contract_signature,a.compiled_hash,a.compiled_json FROM metadata.entity_release r JOIN snapshot.entity_release_artifact a ON a.source_release_id=r.id WHERE r.id=${id}::uuid ORDER BY a.plane_key LIMIT 1`.execute(
        this.database,
      );
    const row = result.rows[0];
    if (!row) {
      const source = (
        await sql<
          Record<string, unknown>
        >`SELECT r.contract_signature,r.signature_algorithm,r.signing_key_id,s.contract_json FROM metadata.entity_release r JOIN snapshot.entity_contract_revision s ON s.id=r.revision_id AND s.tenant_id=r.tenant_id WHERE r.id=${id}::uuid AND r.tenant_id=shared.current_tenant_id()`.execute(
          this.database,
        )
      ).rows[0];
      if (!source?.contract_signature) return null;
      const compiled = compileGraph(source.contract_json as MetaEntityGraph);
      if (!compiled.descriptor.collectionRelationship) return null;
      return {
        ...compiled,
        signature: String(source.contract_signature),
        signatureAlgorithm: String(source.signature_algorithm),
        signingKeyId: String(source.signing_key_id),
      } as SignedMetaEntityArtifact;
    }
    return {
      schema: "athyper.entity-runtime-descriptor/1.0",
      compiler: { name: "@athyper/meta-entity-compiler", version: "1.0.0" },
      contractHash: string(row, "contract_hash"),
      descriptorHash: string(row, "compiled_hash"),
      descriptor: object(row["compiled_json"]),
      signatureAlgorithm: string(row, "signature_algorithm"),
      signingKeyId: string(row, "signing_key_id"),
      signature: string(row, "contract_signature"),
    } as SignedMetaEntityArtifact;
  }
  private map(row: ChangeSetRow): MetaEntityChangeSet {
    return {
      id: string(row, "id"),
      tenantId: row.tenant_id === null ? null : string(row, "tenant_id"),
      entityId: string(row, "entity_id"),
      entityCode:
        typeof row.entity_code === "string" ? row.entity_code : "unknown",
      branchCode: string(row, "branch_code"),
      status: string(row, "status") as MetaEntityChangeSet["status"],
      revision: Number(row.lock_version),
      createdBy: string(row, "created_by"),
      ...(typeof row.submitted_by === "string"
        ? { submittedBy: row.submitted_by }
        : {}),
      ...(typeof row.reviewed_by === "string"
        ? { reviewedBy: row.reviewed_by }
        : {}),
      ...(typeof row.approved_by === "string"
        ? { approvedBy: row.approved_by }
        : {}),
    };
  }
}
interface InsertCoordinate {
  readonly tenant_id: unknown;
  readonly entity_id: unknown;
  readonly change_set_id: string;
  readonly created_by: string;
}
type JsonObject = { readonly [key: string]: unknown };
type GraphTable = keyof typeof BRANCH_COLUMNS;
async function replaceGraphInTransaction(
  db: Kysely<Database>,
  input: Parameters<MetaEntityAuthoringRepository["replaceGraph"]>[0],
) {
  input = { ...input, graph: normalizeGraphStorageOrder(input.graph) };
  if (input.graph.classProfiles?.length) {
    const classRow = required(
      (
        await sql<JsonRow>`SELECT to_jsonb(profile) AS value FROM metadata.entity_class_profile profile JOIN metadata.entity entity ON entity.entity_class=profile.entity_class JOIN metadata.entity_change_set change_set ON change_set.entity_id=entity.id WHERE change_set.id=${input.changeSetId}::uuid`.execute(
          db,
        )
      ).rows[0],
    );
    const persisted = decodeRow(
      object(classRow.value),
      BRANCH_COLUMNS.entity_class_profile,
    );
    if (canonicalJson(input.graph.classProfiles) !== canonicalJson([persisted]))
      throw new AuthoringConflictError(
        "Entity class profiles are immutable platform-owned defaults",
      );
  }
  const advanced =
    await sql<AdvanceRow>`SELECT metadata.fn_advance_entity_change_set(${input.changeSetId}::uuid,${input.expectedRevision},${input.actorId}::uuid) AS revision`
      .execute(db)
      .catch((error: unknown) => {
        if (
          error &&
          typeof error === "object" &&
          Reflect.get(error, "code") === "40001"
        )
          throw new AuthoringConflictError(
            "Stale authoring revision; reload the saved graph before retrying",
          );
        throw error;
      });
  if (Number(advanced.rows[0]?.["revision"]) !== input.expectedRevision + 1)
    throw new AuthoringConflictError("Stale authoring revision");
  // The successful revision advance holds the row lock. Capture before replacing rows.
  await captureDraftSave(db, input.changeSetId, input.expectedRevision, input.actorId, "previous");
  for (const table of [
    "entity_contract_test_case",
    "entity_operation_scope_binding",
    "entity_numbering_binding",
    "entity_lifecycle_operation_binding",
    "entity_field_policy_binding",
    "entity_policy_binding",
    "entity_flow_step",
    "entity_flow",
    "entity_operation_rule",
    "entity_surface_operation",
    "entity_operation_permission",
    "entity_surface_field_binding",
    "entity_surface_section",
    "entity_surface",
    "entity_relation_field",
    "entity_relation_target",
    "entity_relation",
    "entity_search_field",
    "entity_search_profile",
    "entity_key_field",
    "entity_key",
    "entity_operation",
    "entity_field",
    "entity_runtime_profile",
  ] as const)
    await sql`DELETE FROM ${sql.table(`metadata.${table}`)} WHERE change_set_id=${input.changeSetId}::uuid`.execute(
      db,
    );
  const current = required(
    (
      await sql<CoordinateRow>`SELECT tenant_id,entity_id FROM metadata.entity_change_set WHERE id=${input.changeSetId}::uuid`.execute(
        db,
      )
    ).rows[0],
  );
  const coordinate = {
    tenant_id: current["tenant_id"] ?? null,
    entity_id: current["entity_id"],
    change_set_id: input.changeSetId,
    created_by: input.actorId,
  };
  const branches: [GraphTable, readonly object[]][] = [
    ["entity_runtime_profile", input.graph.runtimeProfiles ?? []],
    ["entity_field", input.graph.fields],
    ["entity_key", input.graph.keys ?? []],
    ["entity_key_field", input.graph.keyFields ?? []],
    ["entity_search_profile", input.graph.searchProfiles ?? []],
    ["entity_search_field", input.graph.searchFields ?? []],
    ["entity_relation", input.graph.relations ?? []],
    ["entity_relation_target", input.graph.relationTargets ?? []],
    ["entity_relation_field", input.graph.relationFields ?? []],
    // Operation reference guards require their target surfaces to exist first.
    ["entity_surface", input.graph.surfaces ?? []],
    ["entity_operation", input.graph.operations],
    ["entity_operation_permission", input.graph.operationPermissions ?? []],
    ["entity_operation_rule", input.graph.operationRules ?? []],
    [
      "entity_operation_scope_binding",
      input.graph.operationScopeBindings ?? [],
    ],
    ["entity_surface_section", input.graph.surfaceSections ?? []],
    ["entity_surface_field_binding", input.graph.surfaceFieldBindings ?? []],
    ["entity_surface_operation", input.graph.surfaceOperations ?? []],
    ["entity_flow", input.graph.flows ?? []],
    ["entity_flow_step", input.graph.flowSteps ?? []],
    ["entity_policy_binding", input.graph.policyBindings ?? []],
    ["entity_field_policy_binding", input.graph.fieldPolicyBindings ?? []],
    ["entity_lifecycle_binding", input.graph.lifecycleBindings ?? []],
    [
      "entity_lifecycle_operation_binding",
      input.graph.lifecycleOperationBindings ?? [],
    ],
    ["entity_numbering_binding", input.graph.numberingBindings ?? []],
  ];
  for (const [table, values] of branches)
    await insertRows(db, table, values, coordinate);
  for (const test of input.graph.tests ?? [])
    await insertRows(
      db,
      "entity_contract_test_case",
      [
        {
          testKey: test.key,
          testKind: "compilation",
          title: test.key,
          inputContext: {
            assertion: test.assertion,
            path: test.path,
            ...(test.expected !== undefined ? { expected: test.expected } : {}),
          },
        },
      ],
      coordinate,
    );
  await sql`SELECT metadata.fn_validate_entity_graph(${input.changeSetId}::uuid)`.execute(
    db,
  );
  await captureDraftSave(db, input.changeSetId, input.expectedRevision + 1, input.actorId, "saved");
}
async function captureDraftSave(db: Kysely<Database>, id: string, revision: number, actor: string, kind: string) {
  const repository = new KyselyMetaEntityAuthoringRepository(db);
  const current = required(await repository.get(id));
  const graph = await repository.loadGraph(id);
  await sql`INSERT INTO snapshot.entity_draft_save(change_set_id,lock_version,tenant_id,graph,graph_hash,captured_by,capture_kind)
    VALUES(${id}::uuid,${revision},${current.tenantId}::uuid,${canonicalJson(graph)}::jsonb,${sha256(graph)},${actor}::uuid,${kind}) ON CONFLICT(change_set_id,lock_version) DO NOTHING`.execute(db);
  const existing = await repository.readDraftSave(id, revision);
  if (!existing || sha256(existing) !== sha256(graph)) throw new AuthoringConflictError("Saved revision already contains different content");
}
async function insertRows(
  db: Kysely<Database>,
  table: GraphTable,
  rows: readonly object[],
  coordinate: InsertCoordinate,
) {
  for (const row of rows) {
    const id = Reflect.get(row, "id");
    const allowed = new Set<string>(BRANCH_COLUMNS[table]);
    const authored = Object.entries(row).filter(
      ([key, value]) => value !== undefined && allowed.has(key),
    );
    const value: JsonObject = {
      ...Object.fromEntries(
        authored.map(([key, item]) => [snakeKey(key), item]),
      ),
      ...coordinate,
      id: typeof id === "string" ? id : randomUUID(),
    };
    const entries = Object.entries(value);
    const columns = sql.join(entries.map(([key]) => sql.raw(key)));
    const values = sql.join(
      entries.map(([, item]) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? sql`${JSON.stringify(item)}::jsonb`
          : sql`${item}`,
      ),
    );
    await sql`INSERT INTO ${sql.table(`metadata.${table}`)} (${columns}) VALUES (${values})`.execute(
      db,
    );
  }
}
function snakeKey(key: string) {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}
function decodeRow<T extends object>(
  row: JsonObject,
  columns: readonly string[],
): T {
  const result: Record<string, unknown> = {};
  for (const property of columns) {
    const value = row[snakeKey(property)];
    if (value !== null && value !== undefined)
      result[property] = NUMERIC_PROPERTIES.has(property)
        ? Number(value)
        : value;
  }
  return result as T;
}
function required<T>(v: T | null | undefined): T {
  if (v == null) throw new Error("META_ENTITY_ROW_NOT_FOUND");
  return v;
}
function string(row: object, key: string) {
  const v = Reflect.get(row, key);
  if (typeof v !== "string") throw new Error(`META_ENTITY_ROW_INVALID:${key}`);
  return v;
}
function object(v: unknown): JsonObject {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as JsonObject)
    : {};
}
const NUMERIC_PROPERTIES = new Set([
  "position",
  "priority",
  "weight",
  "profileVersion",
  "draftTtlHours",
  "minimumQueryLength",
  "columnCount",
  "columnSpan",
  "lifecycleRevision",
  "policyRevision",
  "deprecatedSinceReleaseNo",
  "plannedRemovalReleaseNo",
]);
const BRANCH_COLUMNS = {
  entity_class_profile: [
    "entityClass",
    "profileVersion",
    "fallbackName",
    "description",
    "defaultBackingKind",
    "defaultApiExposure",
    "defaultReadMode",
    "defaultWriteMode",
    "defaultConcurrencyMode",
    "defaultChangePolicy",
  ],
  entity_runtime_profile: [
    "id",
    "profileKey",
    "backingKind",
    "storagePlane",
    "storageSchema",
    "storageObject",
    "apiExposure",
    "readMode",
    "writeMode",
    "readHandlerKey",
    "writeHandlerKey",
    "createMode",
    "concurrencyMode",
    "recordVersionFieldKey",
    "tenantFieldKey",
    "softDeleteFieldKey",
    "draftTtlHours",
  ],
  entity_field: [
    "id",
    "fieldKey",
    "description",
    "dataType",
    "typeConfig",
    "cardinality",
    "valueOrigin",
    "writeMode",
    "storagePath",
    "defaultSpec",
    "computationSpec",
    "validationSpec",
    "dataClassification",
    "retentionPolicyCode",
    "status",
    "replacementFieldKey",
    "deprecatedSinceReleaseNo",
    "plannedRemovalReleaseNo",
  ],
  entity_key: [
    "id",
    "keyKey",
    "keyKind",
    "uniquenessScope",
    "nullSemantics",
    "status",
    "replacementKeyKey",
    "deprecatedSinceReleaseNo",
    "plannedRemovalReleaseNo",
  ],
  entity_key_field: ["id", "entityKeyId", "entityFieldId", "position"],
  entity_search_profile: [
    "id",
    "searchKey",
    "searchKind",
    "queryOperator",
    "minimumQueryLength",
    "languageCode",
    "normalizationMode",
    "isDefault",
    "status",
    "replacementSearchKey",
    "deprecatedSinceReleaseNo",
    "plannedRemovalReleaseNo",
  ],
  entity_search_field: [
    "id",
    "entitySearchProfileId",
    "entityFieldId",
    "position",
    "matchMode",
    "weight",
  ],
  entity_relation: [
    "id",
    "relationKey",
    "relationKind",
    "resolutionKind",
    "ownershipMode",
    "mutationMode",
    "onDelete",
    "onUpdate",
    "inverseRelationKey",
    "status",
    "replacementRelationKey",
    "deprecatedSinceReleaseNo",
    "plannedRemovalReleaseNo",
  ],
  entity_relation_target: [
    "id",
    "entityRelationId",
    "relationTargetKey",
    "targetEntityId",
    "targetKeyKey",
    "discriminatorValue",
    "isDefault",
  ],
  entity_relation_field: [
    "id",
    "entityRelationTargetId",
    "sourceFieldId",
    "targetFieldKey",
    "position",
  ],
  entity_surface: [
    "id",
    "surfaceKey",
    "surfaceKind",
    "title",
    "description",
    "layoutKind",
    "layoutConfig",
    "isDefault",
    "status",
    "replacementSurfaceKey",
    "deprecatedSinceReleaseNo",
    "plannedRemovalReleaseNo",
  ],
  entity_surface_section: [
    "id",
    "entitySurfaceId",
    "sectionKey",
    "parentSectionId",
    "sectionKind",
    "title",
    "description",
    "position",
    "columnCount",
    "collapsible",
    "collapsedByDefault",
    "layoutConfig",
  ],
  entity_surface_field_binding: [
    "id",
    "entitySurfaceId",
    "entitySurfaceSectionId",
    "entityFieldId",
    "bindingKey",
    "position",
    "labelOverride",
    "helpText",
    "placeholder",
    "widgetKey",
    "columnSpan",
    "showRequiredIndicator",
    "displayConfig",
    "visibilityRule",
    "editabilityRule",
    "status",
  ],
  entity_operation: [
    "id",
    "operationKey",
    "operationKind",
    "label",
    "description",
    "handlerKey",
    "permissionCode",
    "executionMode",
    "idempotencyMode",
    "inputSurfaceKey",
    "confirmationSurfaceKey",
    "resultSurfaceKey",
    "requiresMfa",
    "auditEventCode",
    "status",
    "replacementOperationKey",
    "deprecatedSinceReleaseNo",
    "plannedRemovalReleaseNo",
  ],
  entity_operation_permission: [
    "id",
    "entityOperationId",
    "targetPlane",
    "permissionCode",
    "permissionKind",
    "status",
  ],
  entity_surface_operation: [
    "id",
    "entitySurfaceId",
    "entityOperationId",
    "entitySurfaceSectionId",
    "placementKey",
    "interactionTarget",
    "selectionMode",
    "position",
    "labelOverride",
    "iconKey",
    "presentationVariant",
    "confirmationSurfaceId",
    "visibilityRule",
    "status",
  ],
  entity_operation_rule: [
    "id",
    "entityOperationId",
    "ruleKey",
    "priority",
    "decision",
    "planeCode",
    "lifecycleStateCode",
    "lifecycleTransitionCode",
    "requiredCapabilityCode",
    "reasonCode",
    "status",
  ],
  entity_flow: [
    "id",
    "flowKey",
    "flowKind",
    "title",
    "description",
    "navigationMode",
    "entryOperationId",
    "completionOperationId",
    "allowDraftResume",
    "status",
    "replacementFlowKey",
    "deprecatedSinceReleaseNo",
    "plannedRemovalReleaseNo",
  ],
  entity_flow_step: [
    "id",
    "entityFlowId",
    "entitySurfaceId",
    "stepKey",
    "position",
    "titleOverride",
    "description",
    "entryCondition",
    "completionCondition",
    "isOptional",
  ],
  entity_policy_binding: [
    "id",
    "entityOperationId",
    "policyDefinitionId",
    "bindingKey",
    "bindingStage",
    "enforcement",
    "priority",
    "inputMapping",
    "status",
  ],
  entity_field_policy_binding: [
    "id",
    "entityFieldId",
    "entityOperationId",
    "policyDefinitionId",
    "bindingKey",
    "bindingStage",
    "enforcement",
    "priority",
    "inputMapping",
    "status",
  ],
  entity_contract_test_case: [
    "id",
    "testKey",
    "testKind",
    "title",
    "description",
    "targetPlane",
    "entityOperationId",
    "entityFlowId",
    "inputContext",
    "expectedOutcome",
    "expectedDiagnosticCodes",
    "status",
  ],
  entity_lifecycle_binding: [
    "id",
    "entityFieldId",
    "bindingKey",
    "targetPlane",
    "lifecycleCode",
    "lifecycleRevision",
    "required",
    "status",
  ],
  entity_lifecycle_operation_binding: [
    "id",
    "entityLifecycleBindingId",
    "entityOperationId",
    "mappingKey",
    "transitionCode",
    "status",
  ],
  entity_numbering_binding: [
    "id",
    "entityFieldId",
    "entityOperationId",
    "bindingKey",
    "targetPlane",
    "policyCode",
    "policyRevision",
    "assignmentMode",
    "required",
    "status",
  ],
  entity_operation_scope_binding: [
    "id",
    "entityOperationId",
    "bindingKey",
    "targetPlane",
    "decisionMode",
    "scopeKind",
    "coordinateSource",
    "coordinateKey",
    "resolverKey",
    "missingValueBehavior",
    "status",
  ],
} as const;

function atomic<T>(
  database: Kysely<Database>,
  work: (transaction: Transaction<Database>) => Promise<T>,
): Promise<T> {
  return database.isTransaction
    ? work(database as Transaction<Database>)
    : database.transaction().execute(work);
}
