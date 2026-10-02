import { parseLearningFixtures, type LearningFixture } from "./learning-fixtures.js";
export { parseLearningFixtures, type LearningFixture } from "./learning-fixtures.js";
import { runLearningAttempt, type LearningAttemptEvidence } from "./learning-attempt.js";
import { createLearningEvaluationReceipt, assertLearningEvaluationReceipt, type ControlledLearningFixtureSet } from "./learning-evaluation-receipt.js";
import { cloneGraphIds } from "./graph-identity.js";
import { createHash, randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type {
  VerifiedRequestContext,
  Authorizer,
} from "@athyper/server-contract-auth";
import {
  parseAtlasLearningProposal,
  type AtlasLearningHandoff,
  type AtlasLearningInboxPort,
  type EntityAiDescriptorV1,
} from "@athyper/server-contract-metadata";
import {
  AuthoringConflictError,
  AuthoringPolicyError,
  type MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { KyselyMetaEntityAuthoringRepository } from "./kysely-authoring-repository.js";
import { compileEntityAi } from "./entity-ai.js";
import { compileGraph, sha256 } from "./deterministic.js";

type Database = Kysely<Record<string, never>>;
export interface LearningEvaluation {
  readonly passed: boolean;
  readonly fixtureHash: string;
  readonly resolverVersion: string;
  readonly scoringVersion?: string;
  readonly receipt?: import("./learning-evaluation-receipt.js").LearningEvaluationReceipt;
  readonly fixtures?: readonly LearningFixture[];
  readonly previousEvaluations?: readonly { readonly changeSetId: string; readonly evaluatedDescriptorHash: string | null; readonly evaluation: Omit<LearningEvaluation, "previousEvaluations"> }[];
  readonly results: readonly {
    readonly expected: string;
    readonly actual: string;
    readonly passed: boolean;
  }[];
}
interface InboxRow {
  change_set_status?: string;
  change_set_revision?: number;
  release_id?: string;
  publication_status?: string;
  deployment_states?: unknown;
  attempts?: readonly {
    id: string;
    status: "started" | "succeeded" | "failed";
    failureCode: string | null;
    evidence: LearningAttemptEvidence | null;
    startedAt: string;
    finishedAt: string | null;
  }[];
  attempt_count?: number;
  id: string;
  tenant_id: string;
  origin_plane: string;
  candidate_id: string;
  proposal_hash: string;
  proposal: AtlasLearningHandoff;
  state: "pending" | "rejected" | "drafted";
  revision: number;
  change_set_id: string | null;
  evaluated_hash: string | null;
  evaluation: LearningEvaluation | null;
  reviewed_by: string | null;
  expires_at: Date | string;
}
export interface LearningInboxOptions {
  evaluationIdentity: { readonly resolverVersion: string; readonly scoringVersion: string };
  /** Trusted provider; request callers may choose an ID, never authorship or expected answers. */
  fixtureSets?: { resolve(context: VerifiedRequestContext, id: string): Promise<ControlledLearningFixtureSet & { readonly fixtures: readonly LearningFixture[]; readonly entityCode?: string; readonly originPlane?: string }> };
  database: Database;
  authorizer: Authorizer;
  sourceCurrent(proposal: AtlasLearningHandoff): Promise<boolean>;
  evaluate(
    entityCode: string,
    ai: EntityAiDescriptorV1,
    fixtures: readonly LearningFixture[],
    baseline?: EntityAiDescriptorV1,
  ): LearningEvaluation;
}
/** A trusted handoff receiver and independently authorized tenant Studio review service. */
export class AtlasLearningInbox implements AtlasLearningInboxPort {
  constructor(private readonly options: LearningInboxOptions) {}
  async receive(proposal: AtlasLearningHandoff): Promise<void> {
    const input = parseAtlasLearningProposal({
      schemaVersion: proposal.schemaVersion,
      candidateId: proposal.candidateId,
      feedbackId: proposal.feedbackId,
      locale: proposal.locale,
      phrase: proposal.phrase,
      capabilityId: proposal.capabilityId,
    });
    const payload = {
      ...input,
      tenantId: proposal.tenantId,
      originPlane: proposal.originPlane,
      submittedBy: proposal.submittedBy,
      entityCode: proposal.entityCode,
      sourceDescriptorHash: proposal.sourceDescriptorHash,
      sourceContractHash: proposal.sourceContractHash,
      sourceReleaseId: proposal.sourceReleaseId,
    };
    if (
      createHash("sha256").update(JSON.stringify(payload)).digest("hex") !==
        proposal.proposalHash ||
      !(await this.options.sourceCurrent(proposal))
    )
      throw new AuthoringPolicyError(
        "LEARNING_SOURCE_UNAVAILABLE",
        "Correction source is no longer available",
      );
    await this.transaction(
      proposal.tenantId,
      proposal.submittedBy,
      async (tx) => {
        const inserted = (
          await sql<InboxRow>`INSERT INTO ai.atlas_learning_inbox(tenant_id,origin_plane,candidate_id,proposal_hash,proposal,submitted_by,expires_at)
        VALUES(${proposal.tenantId}::uuid,${proposal.originPlane},${proposal.candidateId}::uuid,${proposal.proposalHash},${JSON.stringify(proposal)}::jsonb,${proposal.submittedBy}::uuid,${proposal.expiresAt}::timestamptz)
        ON CONFLICT(tenant_id,origin_plane,candidate_id) DO NOTHING RETURNING *`.execute(
            tx,
          )
        ).rows[0];
        if (inserted)
          await this.event(tx, inserted, proposal.submittedBy, "received");
        else {
          const existing = (
            await sql<InboxRow>`SELECT * FROM ai.atlas_learning_inbox WHERE tenant_id=${proposal.tenantId}::uuid AND origin_plane=${proposal.originPlane} AND candidate_id=${proposal.candidateId}::uuid`.execute(
              tx,
            )
          ).rows[0];
          if (!existing || existing.proposal_hash !== proposal.proposalHash)
            throw new AuthoringConflictError(
              "Correction handoff conflicts with existing content",
            );
        }
      },
    );
  }
  async list(context: VerifiedRequestContext) {
    await this.allowed(context, "metadata.entity.review", { learningOperation: "list" });
    return this.transaction(
      context.tenantId,
      context.principalId,
      async (tx) => {
        const rows = (
          await sql<InboxRow>`SELECT inbox.*,cs.status AS change_set_status,cs.lock_version AS change_set_revision,r.id AS release_id,pr.status AS publication_status,
        (SELECT count(*)::integer FROM ai.atlas_learning_attempt a WHERE a.tenant_id=inbox.tenant_id AND a.inbox_id=inbox.id) AS attempt_count,
        (SELECT jsonb_agg(history.entry ORDER BY history.started_at DESC,history.id DESC) FROM
          (SELECT a.id,a.started_at,jsonb_build_object('id',a.id,'revision',a.revision,'actorId',a.actor_id,'startedAt',a.started_at,'finishedAt',r.finished_at,
            'status',COALESCE(r.status,'started'),'failureCode',r.failure_code,'evidence',r.evidence,'resolverVersion',a.resolver_version,'scoringVersion',a.scoring_version,
            'sourceReleaseId',a.source_release_id,'sourceDescriptorHash',a.source_descriptor_hash,'sourceContractHash',a.source_contract_hash) AS entry
           FROM ai.atlas_learning_attempt a LEFT JOIN ai.atlas_learning_attempt_result r ON r.attempt_id=a.id AND r.tenant_id=a.tenant_id
           WHERE a.tenant_id=inbox.tenant_id AND a.inbox_id=inbox.id ORDER BY a.started_at DESC,a.id DESC LIMIT 20) history) AS attempts,
        (SELECT jsonb_agg(jsonb_build_object('plane',d.target_plane,'state',d.status)) FROM publication.deployment d JOIN publication.artifact a ON a.id=d.artifact_id WHERE a.publication_release_id=pr.id) AS deployment_states
        FROM ai.atlas_learning_inbox inbox LEFT JOIN metadata.entity_change_set cs ON cs.id=inbox.change_set_id AND cs.tenant_id=inbox.tenant_id
        LEFT JOIN metadata.entity_release r ON r.change_set_id=cs.id AND r.tenant_id=inbox.tenant_id
        LEFT JOIN publication.release pr ON pr.id=r.id AND pr.tenant_id=inbox.tenant_id
        WHERE inbox.tenant_id=${context.tenantId}::uuid AND (inbox.expires_at>now() OR inbox.state='drafted') ORDER BY inbox.created_at DESC,inbox.id DESC LIMIT 100`.execute(
            tx,
          )
        ).rows;
        const visible: InboxRow[] = [];
        for (const row of rows)
          if (
            row.release_id ||
            (await this.options.sourceCurrent(row.proposal))
          )
            visible.push(row);
        return {
          items: visible.map((row) => ({
            id: row.id,
            revision: row.revision,
            state: row.state,
            phrase: row.proposal.phrase,
            capabilityId: row.proposal.capabilityId,
            entityCode: row.proposal.entityCode,
            originPlane: row.origin_plane,
            sourceDescriptorHash: row.proposal.sourceDescriptorHash,
            proposalHash: row.proposal_hash,
            changeSetId: row.change_set_id,
            changeSetStatus: row.change_set_status,
            changeSetRevision: row.change_set_revision,
            releaseId: row.release_id,
            publicationStatus: row.publication_status,
            deployments: row.deployment_states,
            evaluation: row.evaluation,
            attempts: row.attempts ?? [],
            attemptCount: row.attempt_count ?? 0,
            reviewedBy: row.reviewed_by,
            expiresAt: new Date(row.expires_at).toISOString(),
          })),
        };
      },
    );
  }
  async reject(context: VerifiedRequestContext, id: string, revision: number) {
    await this.allowed(context, "metadata.entity.review", { learningOperation: "reject", learningInboxId: id });
    return this.transaction(
      context.tenantId,
      context.principalId,
      async (tx) => {
        const row = await this.lock(tx, context, id, revision);
        await sql`UPDATE ai.atlas_learning_inbox SET state='rejected',revision=revision+1,reviewed_by=${context.principalId}::uuid WHERE id=${row.id}::uuid AND tenant_id=${context.tenantId}::uuid`.execute(
          tx,
        );
        await this.event(
          tx,
          { ...row, revision: revision + 1 },
          context.principalId,
          "rejected",
        );
        return { id, revision: revision + 1, state: "rejected" };
      },
    );
  }
  async stage(
    context: VerifiedRequestContext,
    input: {
      id: string;
      revision: number;
      fixtures?: readonly LearningFixture[];
      fixtureSetId?: string;
      requalify?: boolean;
    },
  ) {
    await this.allowed(context, "metadata.entity.review", { learningOperation: "stage", learningInboxId: input.id });
    await this.allowed(context, "metadata.entity.author");
    const attemptId = randomUUID();
    const attemptEvidence: LearningAttemptEvidence = {};
    return runLearningAttempt({
      start: () => this.transaction(context.tenantId, context.principalId, async tx => {
        const row = await this.lock(tx, context, input.id, input.revision, input.requalify === true);
        await sql`INSERT INTO ai.atlas_learning_attempt(id,tenant_id,inbox_id,actor_id,proposal_hash,revision,source_release_id,source_descriptor_hash,source_contract_hash,resolver_version,scoring_version)
          VALUES(${attemptId}::uuid,${context.tenantId}::uuid,${row.id}::uuid,${context.principalId}::uuid,${row.proposal_hash},${row.revision},${row.proposal.sourceReleaseId}::uuid,${row.proposal.sourceDescriptorHash},${row.proposal.sourceContractHash},${this.options.evaluationIdentity.resolverVersion},${this.options.evaluationIdentity.scoringVersion})`.execute(tx);
      }),
      failed: code => this.transaction(context.tenantId, context.principalId, tx => this.finishAttempt(tx, context, attemptId, "failed", attemptEvidence, code)),
      work: async () => {
    if (input.fixtureSetId !== undefined && (!input.fixtureSetId.trim() || input.fixtureSetId.length > 200 || !this.options.fixtureSets || input.fixtures !== undefined))
      throw new AuthoringPolicyError("LEARNING_FIXTURE_SET_UNAVAILABLE", "Select an available controlled fixture set without caller-supplied expectations");
    const resolvedFixtures = input.fixtureSetId === undefined ? undefined : await this.options.fixtureSets!.resolve(context, input.fixtureSetId);
    if (resolvedFixtures && resolvedFixtures.id !== input.fixtureSetId)
      throw new AuthoringPolicyError("LEARNING_FIXTURE_SET_UNAVAILABLE", "The requested fixture set did not resolve exactly");
    const fixtures = parseLearningFixtures(resolvedFixtures?.fixtures ?? input.fixtures);
    attemptEvidence.fixtureContentHash = sha256(fixtures);
    attemptEvidence.fixtureCount = fixtures.length;
    if (resolvedFixtures) attemptEvidence.fixtureSetId = resolvedFixtures.id;
    const controlledFixtureSet = resolvedFixtures ? { id: resolvedFixtures.id, contentHash: resolvedFixtures.contentHash,
      authorId: resolvedFixtures.authorId, approvedBy: resolvedFixtures.approvedBy, lockedAt: resolvedFixtures.lockedAt } : undefined;
    return this.transaction(
      context.tenantId,
      context.principalId,
      async (tx) => {
        const row = await this.lock(tx, context, input.id, input.revision, input.requalify === true);
        if (resolvedFixtures && ((resolvedFixtures.entityCode !== undefined && resolvedFixtures.entityCode !== row.proposal.entityCode) ||
          (resolvedFixtures.originPlane !== undefined && resolvedFixtures.originPlane !== row.origin_plane)))
          throw new AuthoringPolicyError("LEARNING_FIXTURE_SET_UNAVAILABLE", "Controlled fixtures do not match the correction entity and origin plane");
        if (!(await this.options.sourceCurrent(row.proposal)))
          throw new AuthoringPolicyError(
            "LEARNING_SOURCE_UNAVAILABLE",
            "Correction expired or its source was removed",
          );
        const source = (
          await sql<{
            entity_id: string;
            contract_json: MetaEntityGraph;
            contract_hash: string;
            compiled_hash: string;
            compiled_json: Record<string, unknown>;
          }>`SELECT r.entity_id,r.contract_json,r.contract_hash,artifact.compiled_hash,artifact.compiled_json FROM snapshot.entity_contract_revision r
        JOIN metadata.entity_release release ON release.revision_id=r.id AND release.tenant_id=r.tenant_id
        JOIN snapshot.entity_release_artifact artifact ON artifact.source_release_id=release.id AND artifact.tenant_id=r.tenant_id
        JOIN publication.entity_release_link link ON link.entity_release_id=release.id
        WHERE r.tenant_id=${context.tenantId}::uuid AND link.publication_release_id=${row.proposal.sourceReleaseId}::uuid AND artifact.plane_key=${row.origin_plane}
        AND NOT EXISTS(SELECT 1 FROM metadata.entity_release newer WHERE newer.tenant_id=release.tenant_id AND newer.entity_id=release.entity_id AND newer.release_no>release.release_no)`.execute(
            tx,
          )
        ).rows[0];
        if (
          !source ||
          !(
            [source.compiled_hash, sha256(source.compiled_json)].includes(
              row.proposal.sourceDescriptorHash,
            ) &&
            [
              source.contract_hash,
              compileGraph(source.contract_json).contractHash,
            ].includes(row.proposal.sourceContractHash)
          )
        )
          throw new AuthoringConflictError(
            "The source release changed; submit a correction against the current definition",
          );
        const graph = source.contract_json;
        const next = applyLearningCorrection(graph, {
          ...row.proposal,
          sourceContractHash: compileGraph(graph).contractHash,
        });
        const repository = new KyselyMetaEntityAuthoringRepository(tx);
        const draft = await repository.createDraft({
          tenantId: context.tenantId,
          entityId: source.entity_id,
          entityCode: row.proposal.entityCode,
          branchCode: `atlas-learning.${row.candidate_id}.${row.revision + 1}`,
          title: `Atlas vocabulary: ${row.proposal.phrase}`,
          actorId: context.principalId,
        });
        const changeSetId = draft.id;
        const changed = await repository.replaceGraphInTransaction(
          {
            changeSetId,
            expectedRevision: draft.revision,
            graph: cloneGraphIds(next),
            actorId: context.principalId,
          },
          tx,
        );
        // Evaluate the persisted graph, including database-assigned IDs/defaults.
        const persistedGraph = await repository.loadGraph(changeSetId);
        const evaluatedHash = compileGraph(persistedGraph).descriptorHash;
        const ai = compileEntityAi(persistedGraph)!;
        const evaluatedAt = new Date().toISOString();
        const result = {
          ...this.options.evaluate(String(persistedGraph.entity.entityCode), ai, fixtures, compileEntityAi(graph)!),
          fixtures,
        };
        attemptEvidence.evaluatedDescriptorHash = evaluatedHash;
        attemptEvidence.evaluatorFixtureHash = /^[0-9a-f]{64}$/.test(result.fixtureHash) ? result.fixtureHash : sha256(result.fixtureHash);
        attemptEvidence.passedCount = result.results.filter(item => item.passed).length;
        attemptEvidence.resultHash = sha256(result.results);
        if (result.resolverVersion !== this.options.evaluationIdentity.resolverVersion || result.scoringVersion !== this.options.evaluationIdentity.scoringVersion)
          throw new AuthoringPolicyError("LEARNING_EVALUATOR_CHANGED", "Evaluation must use the installed resolver and scoring policy");
        if (!result.passed)
          throw new AuthoringPolicyError("LEARNING_EVALUATION_FAILED", "Evaluation questions did not pass; the draft was not changed");
        const { previousEvaluations = [], ...previousEvaluation } = row.evaluation ?? {};
        const evaluation = {
          ...result,
          ...(input.requalify && row.change_set_id && row.evaluation ? { previousEvaluations: [
            ...previousEvaluations, { changeSetId: row.change_set_id, evaluatedDescriptorHash: row.evaluated_hash, evaluation: previousEvaluation as Omit<LearningEvaluation, "previousEvaluations"> },
          ] } : {}),
          receipt: createLearningEvaluationReceipt({ proposal: row.proposal, descriptorHash: evaluatedHash,
            ai, evaluation: result, controlledFixtureSet, reviewerId: context.principalId, evaluatedAt }),
        };
        await sql`UPDATE ai.atlas_learning_inbox SET state='drafted',revision=revision+1,reviewed_by=${context.principalId}::uuid,change_set_id=${changeSetId}::uuid,evaluated_hash=${evaluatedHash},evaluation=${JSON.stringify(evaluation)}::jsonb WHERE id=${row.id}::uuid AND tenant_id=${context.tenantId}::uuid`.execute(
          tx,
        );
        await this.event(
          tx,
          { ...row, revision: row.revision + 1, change_set_id: changeSetId },
          context.principalId,
          "drafted",
        );
        await this.finishAttempt(tx, context, attemptId, "succeeded", attemptEvidence);
        return {
          id: row.id,
          revision: row.revision + 1,
          state: "drafted",
          changeSetId: changeSetId,
          changeSetRevision: changed.revision,
          evaluation,
        };
      },
    );
      },
    });
  }
  /** Called by the ordinary publication service before signing a learning-bearing graph. */
  async assertPublishable(
    changeSetId: string,
    graph: MetaEntityGraph,
  ): Promise<void> {
    const terms = compileEntityAi(graph)?.vocabulary?.terms ?? [];
    if (!terms.length) return;
    const cs = (
      await sql<{
        tenant_id: string | null;
        created_by: string;
      }>`SELECT tenant_id,created_by FROM metadata.entity_change_set WHERE id=${changeSetId}::uuid`.execute(
        this.options.database,
      )
    ).rows[0];
    if (!cs?.tenant_id)
      throw new AuthoringPolicyError(
        "LEARNING_TENANT_REQUIRED",
        "Tenant corrections cannot publish platform definitions",
      );
    await this.transaction(cs.tenant_id, cs.created_by, async (tx) => {
      const rows = (
        await sql<
          InboxRow & { published: boolean }
        >`SELECT inbox.*,EXISTS(SELECT 1 FROM metadata.entity_release r WHERE r.change_set_id=inbox.change_set_id AND r.tenant_id=inbox.tenant_id) AS published FROM ai.atlas_learning_inbox inbox WHERE tenant_id=${cs.tenant_id}::uuid AND candidate_id IN (${sql.join(terms.map((term) => sql`${term.origin.candidateId}::uuid`))})`.execute(
          tx,
        )
      ).rows;
      for (const term of terms) {
        const row = rows.find(
          (row) =>
            row.candidate_id === term.origin.candidateId &&
            row.origin_plane === term.origin.plane &&
            row.proposal_hash === term.origin.proposalHash,
        );
        const newlyReviewed =
          row?.change_set_id === changeSetId &&
          row.evaluated_hash === compileGraph(graph).descriptorHash &&
          (await this.options.sourceCurrent(row.proposal));
        if (newlyReviewed && row?.evaluation) {
          if (row.evaluation.resolverVersion !== this.options.evaluationIdentity.resolverVersion || row.evaluation.scoringVersion !== this.options.evaluationIdentity.scoringVersion)
            throw new AuthoringPolicyError("LEARNING_REQUALIFICATION_REQUIRED", "The evaluator changed; explicitly requalify this unpublished correction");
          assertLearningEvaluationReceipt({ proposal: row.proposal,
            descriptorHash: compileGraph(graph).descriptorHash, ai: compileEntityAi(graph),
            evaluation: row.evaluation, receipt: row.evaluation.receipt,
            reviewerId: row.reviewed_by ?? "" });
        }
        if (
          !row ||
          row.state !== "drafted" ||
          (!newlyReviewed && !row.published) ||
          !row.evaluation?.passed ||
          row.proposal.entityCode !== graph.entity.entityCode ||
          row.proposal.phrase !== term.phrase ||
          row.proposal.capabilityId !== term.capabilityId
        )
          throw new AuthoringPolicyError(
            "LEARNING_REVIEW_REQUIRED",
            "Learning vocabulary requires a current reviewed and evaluated draft",
          );
      }
    });
  }
  async advance(
    context: VerifiedRequestContext,
    id: string,
    action: "submit" | "approve" | "publish",
    expectedRevision: number,
    authoring: import("./authoring-service.js").MetaEntityAuthoringService,
  ) {
    const row = await this.transaction(
      context.tenantId,
      context.principalId,
      async (tx) =>
        (
          await sql<InboxRow>`SELECT * FROM ai.atlas_learning_inbox WHERE id=${id}::uuid AND tenant_id=${context.tenantId}::uuid AND state='drafted'`.execute(
            tx,
          )
        ).rows[0],
    );
    if (!row?.change_set_id)
      throw new AuthoringConflictError("Reviewed draft is unavailable");
    await this.allowed(context, `metadata.entity.${action === "approve" ? "review" : action}`, { changeSetId: row.change_set_id });
    const input = {
      changeSetId: row.change_set_id,
      expectedRevision,
      actorId: context.principalId,
    };
    if (action === "publish")
      return authoring.publish({
        ...input,
        targetPlanes: [row.proposal.originPlane],
      });
    return authoring[action](input);
  }

  async resume(
    context: VerifiedRequestContext,
    id: string,
    authoring: import("./authoring-service.js").MetaEntityAuthoringService,
  ) {
    const release = await this.transaction(
      context.tenantId,
      context.principalId,
      async (tx) =>
        (
          await sql<{
            id: string;
            target_planes: ("studio" | "neon" | "mesh")[];
          }>`SELECT r.id,r.target_planes FROM ai.atlas_learning_inbox inbox JOIN metadata.entity_release r ON r.change_set_id=inbox.change_set_id AND r.tenant_id=inbox.tenant_id JOIN publication.release pr ON pr.id=r.id AND pr.tenant_id=r.tenant_id WHERE inbox.id=${id}::uuid AND inbox.tenant_id=${context.tenantId}::uuid AND inbox.state='drafted' AND pr.status IN ('approved','published')`.execute(
            tx,
          )
        ).rows[0],
    );
    if (!release)
      throw new AuthoringConflictError(
        "A prepared publication is required for delivery retry",
      );
    await this.allowed(context, "metadata.entity.publish", { releaseId: release.id });
    return authoring.redispatch({
      releaseId: release.id,
      targetPlanes: release.target_planes,
    });
  }
  private async allowed(
    context: VerifiedRequestContext,
    permissionCode: string,
    resource?: Readonly<Record<string, unknown>>,
  ) {
    if (
      context.planeKey !== "studio" ||
      !(await this.options.authorizer.authorize({ context, permissionCode, ...(resource ? { resource } : {}) }))
        .allowed
    )
      throw new AuthoringPolicyError(
        "FORBIDDEN",
        "Studio learning review is unavailable",
      );
  }
  private async lock(
    tx: Database,
    context: VerifiedRequestContext,
    id: string,
    revision: number,
    requalify = false,
  ) {
    const row = (
      await sql<InboxRow>`SELECT * FROM ai.atlas_learning_inbox WHERE id=${id}::uuid AND tenant_id=${context.tenantId}::uuid AND revision=${revision} AND state=${requalify ? 'drafted' : 'pending'} AND expires_at>now() AND NOT EXISTS (SELECT 1 FROM metadata.entity_release release WHERE release.change_set_id=ai.atlas_learning_inbox.change_set_id AND release.tenant_id=ai.atlas_learning_inbox.tenant_id) FOR UPDATE`.execute(
        tx,
      )
    ).rows[0];
    if (!row)
      throw new AuthoringConflictError("Correction state or revision changed");
    if (row.proposal.submittedBy === context.principalId)
      throw new AuthoringPolicyError(
        "REVIEWER_SEPARATION_REQUIRED",
        "A correction needs an independent reviewer",
      );
    return row;
  }
  private async finishAttempt(tx: Database, context: VerifiedRequestContext, attemptId: string,
    status: "succeeded" | "failed", evidence: LearningAttemptEvidence, failureCode?: string) {
    await sql`INSERT INTO ai.atlas_learning_attempt_result(tenant_id,attempt_id,status,failure_code,evidence)
      VALUES(${context.tenantId}::uuid,${attemptId}::uuid,${status},${failureCode ?? null},${JSON.stringify(evidence)}::jsonb)`.execute(tx);
  }
  private async event(
    tx: Database,
    row: InboxRow,
    actor: string,
    decision: string,
  ) {
    await sql`INSERT INTO ai.atlas_learning_candidate_event(tenant_id,inbox_id,actor_id,decision,proposal_hash,revision,change_set_id) VALUES(${row.tenant_id}::uuid,${row.id}::uuid,${actor}::uuid,${decision},${row.proposal_hash},${row.revision},${row.change_set_id}::uuid)`.execute(
      tx,
    );
  }
  private transaction<T>(
    tenant: string,
    principal: string,
    work: (tx: Database) => Promise<T>,
  ) {
    return this.options.database.transaction().execute(async (tx) => {
      await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${principal},true),set_config('app.current_atlas_plane','studio',true)`.execute(
        tx,
      );
      return work(tx);
    });
  }
}
export function applyLearningCorrection(
  graph: MetaEntityGraph,
  proposal: AtlasLearningHandoff,
): MetaEntityGraph {
  if (
    graph.entity.entityCode !== proposal.entityCode ||
    compileGraph(graph).contractHash !== proposal.sourceContractHash
  )
    throw new AuthoringConflictError(
      "The source definition is stale; submit a new correction against the current definition",
    );
  const ai = compileEntityAi(graph);
  if (
    !ai?.enabled ||
    proposal.capabilityId !== "entity_read_record" ||
    !ai.insightProviders.some((ref) => ref.id === proposal.capabilityId)
  )
    throw new AuthoringPolicyError(
      "LEARNING_TARGET_UNSUPPORTED",
      "This workflow currently teaches the generic record summary capability",
    );
  const term = {
    phrase: proposal.phrase,
    capabilityId: proposal.capabilityId,
    origin: {
      plane: proposal.originPlane,
      candidateId: proposal.candidateId,
      proposalHash: proposal.proposalHash,
    },
  };
  if (ai.vocabulary?.terms.some((existing) => existing.phrase === term.phrase))
    throw new AuthoringConflictError(
      "The phrase already has a published meaning; review a new definition explicitly",
    );
  const vocabulary = {
    schemaVersion: 1,
    locale: "en",
    terms: [...(ai.vocabulary?.terms ?? []), term],
  };
  const next = {
    ...graph,
    surfaces: graph.surfaces?.map((surface) =>
      surface.status !== "deprecated" && surface.layoutConfig?.ai
        ? {
            ...surface,
            layoutConfig: {
              ...surface.layoutConfig,
              ai: { ...ai, vocabulary },
            },
          }
        : surface,
    ),
  };
  compileGraph(next);
  return next;
}

export { cloneGraphIds } from "./graph-identity.js";
