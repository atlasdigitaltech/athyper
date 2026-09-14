import { qualifyLearningPublication } from "./learning-publication-qualification.mts";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import type { AtlasLearningHandoff } from "@athyper/server-contract-metadata";
import { KyselyAtlasRunRepository } from "@athyper/server-platform-ai/kysely-run-repository";
import { KyselyAtlasThreadRepository } from "@athyper/server-platform-ai/kysely-thread-repository";
import { KyselyAtlasResponseFeedbackStore } from "@athyper/server-platform-ai/response-feedback";
import {
  AtlasLearningCandidateService,
  isAtlasLearningSourceCurrent,
} from "@athyper/server-platform-ai/learning-candidates";
import { evaluateAtlasLearningVocabulary } from "@athyper/server-platform-ai/learning-evaluation";
import { atlasGuidance, parseAtlasIntent } from "@athyper/server-contract-ai";
import { AtlasLearningInbox } from "@athyper/server-plane-studio-meta-entity-authoring/learning-inbox";
import { KyselyMetaEntityAuthoringRepository } from "@athyper/server-plane-studio-meta-entity-authoring/kysely-authoring-repository";
import { MetaEntityAuthoringService } from "@athyper/server-plane-studio-meta-entity-authoring/authoring-service";
import { prepareAtlasLearningRelease } from "@athyper/server-plane-studio-meta-entity-authoring/learning-publication";
import {
  compileGraph,
  sha256,
} from "@athyper/server-plane-studio-meta-entity-authoring/deterministic";
const fixtures = [
  { question: "Show this company snapshot", expected: "read" },
  {
    question: "Could you display the current company snapshot please?",
    expected: "read",
  },
  { question: "Delete this company snapshot", expected: "delegate" },
] as const;
const config = {
  schemaVersion: 1,
  enabled: true,
  aliases: ["partner"],
  summaryFieldKeys: ["code"],
  searchFieldKeys: [],
  relationshipKeys: [],
  contextKinds: ["record"],
  insightProviders: [{ id: "entity_read_record", version: 1 }],
  actions: [],
  presentationProfiles: [],
};
const signer = {
  sign: async () => ({
    signatureAlgorithm: "Ed25519",
    signingKeyId: "synthetic",
    signature: "synthetic-signature",
  }),
};
export async function qualifyLearning(
  db: Kysely<Record<string, never>>,
  context: VerifiedRequestContext,
  otherPrincipal: string,
  transactions: any,
) {
  const { tenantId, principalId, planeKey } = context;
  const reviewer = {
    ...context,
    principalId: otherPrincipal,
    permissions: { ...context.permissions, principalId: otherPrincipal },
  };
  const source =
    planeKey === "studio"
      ? await seedStudioSource(db, context, reviewer)
      : {
          contractHash: "a".repeat(64),
          descriptorHash: "b".repeat(64),
          releaseId: randomUUID(),
        };
  const descriptor = {
    entityCode: "business_partner",
    planeKey,
    compiledHash: source.descriptorHash,
    contractHash: source.contractHash,
    releaseId: source.releaseId,
    ai: config,
  };
  const threads = new KyselyAtlasThreadRepository(transactions),
    runs = new KyselyAtlasRunRepository(transactions),
    feedback = new KyselyAtlasResponseFeedbackStore(transactions);
  const threadId = randomUUID();
  await threads.create({
    context,
    threadId,
    title: "F4 synthetic",
    retention: {
      policyId: "test",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      purgeAfter: null,
      legalHold: false,
    },
  });
  const runId = randomUUID(),
    messageId = randomUUID();
  await runs.begin({
    context,
    runId,
    threadId,
    clientRequestId: randomUUID(),
    inputMessageId: randomUUID(),
    outputMessageId: messageId,
    userContent: [{ type: "text", text: "synthetic question" }],
    publicModelId: "atlas-fast",
    bindingId: "test",
    bindingRevision: "1",
    policyRevision: "1",
    promptRevision: "1",
    startedAt: new Date().toISOString(),
    replayInput: {
      schemaVersion: 1,
      entityDescriptorHash: source.descriptorHash,
      entityContractHash: source.contractHash,
      businessContext: {
        schemaVersion: 1,
        kind: "record",
        entityCode: "business_partner",
        recordId: randomUUID(),
        section: "overview",
        dirty: false,
        generationId: randomUUID(),
        locale: "en",
      },
      intent: parseAtlasIntent({
        schemaVersion: 1,
        kind: "clarify",
        strategy: "exact_terms",
        reason: "ambiguous",
        capabilityIds: ["entity_read_record", "bp_read_contacts"],
      }),
    },
  });
  await runs.complete({
    context,
    runId,
    assistantContent: [{ type: "text", text: atlasGuidance.ambiguous }],
    replayCompletion: { complete: true, reads: [], guidance: "ambiguous" },
    completedAt: new Date().toISOString(),
  });
  const feedbackId = randomUUID();
  await feedback.append(context, {
    schemaVersion: 1,
    feedbackId,
    runId,
    messageId,
    category: "vocabulary",
    verdict: "wrong",
  });
  let handoff: AtlasLearningHandoff | undefined;
  let failOnce = true;
  const inbox =
    planeKey === "studio"
      ? new AtlasLearningInbox({
          database: db,
          authorizer: { authorize: async () => ({ allowed: true }) } as never,
          sourceCurrent: (proposal) =>
            isAtlasLearningSourceCurrent(transactions, proposal),
          evaluate: evaluateAtlasLearningVocabulary,
        })
      : undefined;
  const service = new AtlasLearningCandidateService(
    transactions,
    { getEntityDescriptor: async () => descriptor as never },
    { canDiscloseMessage: async () => true },
    {
      receive: async (proposal) => {
        handoff = proposal;
        if (failOnce) {
          failOnce = false;
          throw Error("synthetic delivery interruption");
        }
        await inbox?.receive(proposal);
      },
    },
  );
  const proposal = {
    schemaVersion: 1,
    candidateId: randomUUID(),
    feedbackId,
    locale: "en",
    phrase: "company snapshot",
    capabilityId: "entity_read_record",
  };
  await assert.rejects(
    service.submit(context, proposal),
    /delivery interruption/,
  );
  await service.submit(context, proposal);
  await service.submit(context, proposal);
  assert.equal(
    Number(
      (
        await sql<any>`SELECT count(*) AS n FROM ai.atlas_learning_candidate WHERE id=${proposal.candidateId}::uuid`.execute(
          db,
        )
      ).rows[0].n,
    ),
    1,
  );
  assert(handoff);
  assert.equal(await isAtlasLearningSourceCurrent(transactions, handoff), true);
  assert(!JSON.stringify(handoff).includes("synthetic question"));
  await assert.rejects(
    service.submit(context, { ...proposal, phrase: "different term" }),
    { code: "IDEMPOTENCY_CONFLICT" },
  );
  await assert.rejects(
    service.submit(reviewer, { ...proposal, candidateId: randomUUID() }),
    { code: "PERMISSION_DENIED" },
  );
  await assert.rejects(
    service.submit(context, {
      ...proposal,
      candidateId: randomUUID(),
      capabilityId: "destroy_record",
    }),
    { code: "INVALID_ARGUMENT" },
  );
  await transactions.run(
    planeKey,
    { tenantId: randomUUID(), principalId },
    async (tx: any) =>
      assert.equal(
        (await sql`SELECT * FROM ai.atlas_learning_candidate`.execute(tx)).rows
          .length,
        0,
      ),
  );
  console.log(
    `PASS ${planeKey}: response-bound source, minimized retry/ack, immutable identity, denied actor and tenant RLS`,
  );
  if (inbox) {
    let items = (await inbox.list(reviewer)).items;
    assert.equal(items.length, 1);
    assert.equal(items[0]!.state, "pending");
    const id = items[0]!.id;
    await assert.rejects(inbox.stage(context, { id, revision: 0, fixtures }), {
      code: "REVIEWER_SEPARATION_REQUIRED",
    });
    const bad = fixtures.map((fixture, index) =>
      index === 0
        ? { ...fixture, question: "Show this unknown phrase" }
        : fixture,
    );
    await assert.rejects(
      inbox.stage(reviewer, { id, revision: 0, fixtures: bad }),
      { code: "LEARNING_EVALUATION_FAILED" },
    );
    assert.equal((await inbox.list(reviewer)).items[0]!.state, "pending");
    const staged = await inbox.stage(reviewer, { id, revision: 0, fixtures });
    await assert.rejects(inbox.stage(reviewer, { id, revision: 0, fixtures }), {
      code: "AUTHORING_REVISION_CONFLICT",
    });
    const repository = new KyselyMetaEntityAuthoringRepository(
      db,
      prepareAtlasLearningRelease,
    );
    const dispatches: string[] = [];
    const authoring = new MetaEntityAuthoringService({
      repository,
      signer,
      learning: inbox,
      publication: {
        publish: async (input) => {
          dispatches.push(input.releaseId);
        },
        activate: async () => {
          throw Error("not used");
        },
        appendGenerationEvent: async () => {},
      },
    });
    const initial = await repository.get(staged.changeSetId);
    assert.equal(initial?.status, "draft");
    const submitted = await inbox.advance(
      reviewer,
      id,
      "submit",
      initial!.revision,
      authoring,
    );
    await assert.rejects(
      inbox.advance(
        reviewer,
        id,
        "approve",
        (submitted as any).revision,
        authoring,
      ),
      { code: "REVIEWER_SEPARATION_REQUIRED" },
    );
    const approved = await inbox.advance(
      context,
      id,
      "approve",
      (submitted as any).revision,
      authoring,
    );
    const published = (await inbox.advance(
      context,
      id,
      "publish",
      (approved as any).revision,
      authoring,
    )) as any;
    assert.equal(dispatches.length, 1);
    const artifact = (
      await sql<any>`SELECT a.compiled_json,a.compiled_hash,pr.status FROM snapshot.entity_release_artifact a JOIN publication.release pr ON pr.id=a.source_release_id WHERE a.source_release_id=${published.release.id}::uuid`.execute(
        db,
      )
    ).rows[0];
    assert.equal(artifact.status, "approved");
    assert.equal(
      artifact.compiled_json.ai.vocabulary.terms[0].phrase,
      proposal.phrase,
    );
    assert.equal(
      evaluateAtlasLearningVocabulary(
        "business_partner",
        artifact.compiled_json.ai,
        fixtures,
      ).passed,
      true,
    );
    assert.equal(
      evaluateAtlasLearningVocabulary(
        "business_partner",
        config as never,
        fixtures,
      ).passed,
      false,
    );
    assert(
      !JSON.stringify(artifact.compiled_json).includes(fixtures[1].question),
    );
    assert.equal(
      Number(
        (
          await sql<any>`SELECT count(*) AS n FROM ai.atlas_learning_candidate_event WHERE inbox_id=${id}::uuid`.execute(
            db,
          )
        ).rows[0].n,
      ),
      2,
    );
    await qualifyLearningPublication(
      db,
      tenantId,
      principalId,
      source.releaseId,
      published.release.id,
    );
    console.log(
      "PASS studio: receipt -> independent review -> held-out evaluation -> draft -> independent approval -> real release and publication artifact; unpublished vocabulary does not improve questions",
    );
  }
  await transactions.run(
    planeKey,
    { tenantId, principalId },
    async (tx: any) => {
      await sql`SELECT set_config('app.current_atlas_plane',${planeKey},true)`.execute(
        tx,
      );
      await sql`UPDATE document.conversation SET deleted_at=now(),deleted_by=${principalId}::uuid WHERE tenant_id=${tenantId}::uuid AND id=${threadId}::uuid`.execute(
        tx,
      );
    },
  );
  assert.equal(
    await isAtlasLearningSourceCurrent(transactions, handoff),
    false,
  );
  console.log(
    `PASS ${planeKey}: removed conversation invalidates unpublished source attestation`,
  );
}
async function seedStudioSource(
  db: Kysely<Record<string, never>>,
  owner: VerifiedRequestContext,
  reviewer: VerifiedRequestContext,
) {
  const module = (
    await sql<any>`SELECT id FROM control.module LIMIT 1`.execute(db)
  ).rows[0];
  assert(module, "foundation needs a module");
  const entityId = randomUUID();
  await sql`INSERT INTO metadata.entity(id,tenant_id,module_id,entity_code,entity_class,ownership_model,created_by) VALUES(${entityId}::uuid,${owner.tenantId}::uuid,${module.id}::uuid,'business_partner','business','tenant',${owner.principalId}::uuid)`.execute(
    db,
  );
  const operationId = randomUUID();
  const graph: MetaEntityGraph = {
    contractSchema: "athyper.meta-entity-contract/2.1",
    entity: {
      entityCode: "business_partner",
      entityClass: "business",
      ownershipModel: "tenant",
    },
    runtimeProfiles: [
      {
        profileKey: "default",
        backingKind: "virtual",
        apiExposure: "catalog_only",
        readMode: "none",
        writeMode: "none",
      },
    ],
    fields: [
      { fieldKey: "code", dataType: "string", typeConfig: { kind: "string" } },
    ],
    operations: [
      {
        id: operationId,
        operationKey: "read",
        operationKind: "read",
        label: "Read",
        auditEventCode: "partner.read",
        permissionCode: "studio.catalog.business_partner.read",
      },
    ],
    operationPermissions: [
      {
        entityOperationId: operationId,
        targetPlane: "neon",
        permissionCode: "neon.relationship.business_partner.read",
        permissionKind: "entity_operation",
      },
    ],
    surfaces: [
      {
        surfaceKey: "detail",
        surfaceKind: "detail",
        title: "Partner",
        layoutConfig: { ai: config },
      },
    ],
  };
  const repository = new KyselyMetaEntityAuthoringRepository(db);
  const authoring = new MetaEntityAuthoringService({
    repository,
    signer,
    publication: {
      publish: async () => {},
      activate: async () => {
        throw Error("not used");
      },
      appendGenerationEvent: async () => {},
    },
  });
  let draft = await repository.createDraft({
    tenantId: owner.tenantId,
    entityId,
    entityCode: "business_partner",
    branchCode: "main",
    title: "F4 synthetic source",
    actorId: owner.principalId,
  });
  draft = await repository.replaceGraph({
    changeSetId: draft.id,
    expectedRevision: draft.revision,
    graph,
    actorId: owner.principalId,
  });
  draft = await authoring.submit({
    changeSetId: draft.id,
    expectedRevision: draft.revision,
    actorId: owner.principalId,
  });
  draft = await authoring.approve({
    changeSetId: draft.id,
    expectedRevision: draft.revision,
    actorId: reviewer.principalId,
  });
  const published = await authoring.publish({
    changeSetId: draft.id,
    expectedRevision: draft.revision,
    actorId: reviewer.principalId,
    targetPlanes: ["studio"],
  });
  const descriptor = {
    schema: "athyper.entity-runtime-descriptor/1.0",
    entityCode: "business_partner",
    planeKey: "studio",
    storage: { schema: "master", object: "business_partner", idField: "id" },
    fields: [
      {
        key: "code",
        storagePath: "code",
        type: "string",
        required: false,
        writableOn: [],
        filterable: false,
      },
    ],
    operations: {
      read: {
        code: "read",
        permissionCode: "studio.catalog.business_partner.read",
      },
    },
    ai: config,
  };
  await sql`INSERT INTO snapshot.entity_release_artifact(tenant_id,source_release_id,source_revision_id,entity_id,plane_key,release_hash,contract_hash,compiled_json,compiled_hash,created_by)
  SELECT tenant_id,id,revision_id,entity_id,'studio',release_hash,contract_hash,${JSON.stringify(descriptor)}::jsonb,snapshot.fn_compute_entity_release_artifact_hash(id,revision_id,entity_id,'studio',release_hash,contract_hash,${JSON.stringify(descriptor)}::jsonb),published_by FROM metadata.entity_release WHERE id=${published.release.id}::uuid`.execute(
    db,
  );
  await sql`INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_hash,manifest_hash,compatibility_level,created_by) SELECT id,tenant_id,'metadata.entity.business_partner',release_no,release_hash,release_hash,'backward_compatible',published_by FROM metadata.entity_release WHERE id=${published.release.id}::uuid`.execute(
    db,
  );
  await sql`INSERT INTO publication.entity_release_link(publication_release_id,entity_release_id) VALUES(${published.release.id}::uuid,${published.release.id}::uuid)`.execute(
    db,
  );
  const native = (
    await sql<{
      compiled_hash: string;
      contract_hash: string;
    }>`SELECT compiled_hash,contract_hash FROM snapshot.entity_release_artifact WHERE source_release_id=${published.release.id}::uuid`.execute(
      db,
    )
  ).rows[0]!;
  return {
    releaseId: published.release.id,
    descriptorHash: native.compiled_hash,
    contractHash: native.contract_hash,
  };
}
