import { nativeRecoveryScope } from "./native-compilation-recovery-policy.js";
import { assertNativeRecoverySource } from "./native-compilation-recovery-source.js";
import {
  assertRecoveryCompilerSource,
  activeRecoveryCompilerPolicies,
} from "./deployment-recovery-compiler.js";
import { createHash, randomUUID } from "node:crypto";
import { sql, type Kysely, type Transaction } from "kysely";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { PolicyBundleSigner } from "@athyper/server-contract-policy";
import {
  calculateDefinitionHash,
  createJsonRuleEvaluator,
  createKyselyPolicyAuthoringRepository,
  createPolicyAuthoringService,
} from "@athyper/server-platform-policy";
import {
  canonicalJson,
  assertEntitySuccessorSource,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { parsePublicationPolicyProposal } from "./enrollment-contract.js";
import { assertHumanReviewedEnrollmentSource } from "./human-publication-admission.js";
import { assertPublicationCompilerIdentity } from "./compiler-build.js";
import { MACHINE_PUBLICATION_PERMISSION } from "./machine-policy.js";
import { assertCompilationRecoveryWindow } from "@athyper/server-contract-publication";
import { assertCompilationRecoverySource } from "./compilation-recovery-source.js";
import { assertDeploymentRecoverySource } from "./deployment-recovery-source.js";
import {
  assertPlatformAuthority,
  validatePlatformAuthority,
  type PlatformAuthority,
} from "../identity/platform-authority.js";

import {
  lockPublicationSources,
  overlappingPolicies,
  parseReplacementPins,
  replacementScope,
  type PublicationPolicyPin,
} from "./policy-replacement.js";

type Database = Kysely<Record<string, never>>;
const digest = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
export const PUBLICATION_POLICY_PERMISSIONS = Object.freeze({
  propose: "studio.metadata.publication_policy.create",
  activate: "studio.metadata.publication_policy.activate",
});

/** Enrollment is distinct from use of a machine policy. Both calls require a
 * verified Studio identity and normal IAM authorization. The transaction owns
 * test evidence, maker/checker activation and audit together. No grant is made. */
export function createPublicationPolicyEnrollment(options: {
  nativeSource?: Parameters<typeof assertHumanReviewedEnrollmentSource>[3];
  database: Database;
  authorizer: Authorizer;
  audit: AuditRecorder<Database>;
  signer: PolicyBundleSigner;
  environment: string;
  instance: string;
  domainSuffix: string;
  authority: PlatformAuthority;
}) {
  if (
    options.environment !== "local" ||
    options.instance !== "dev" ||
    options.domainSuffix !== "dev.athyper.test"
  )
    throw Error("PUBLICATION_POLICY_ENROLLMENT_DEV_ONLY");
  const authority = validatePlatformAuthority(options.authority);
  async function execute<T>(
    context: VerifiedRequestContext,
    action: keyof typeof PUBLICATION_POLICY_PERMISSIONS,
    work: (tx: Transaction<Record<string, never>>) => Promise<T>,
    definitionId?: string,
  ) {
    if (context.planeKey !== "studio")
      throw Error("PUBLICATION_POLICY_ENROLLMENT_STUDIO_REQUIRED");
    assertPlatformAuthority(context, authority);
    const decision = await options.authorizer.authorize({
      context,
      permissionCode: PUBLICATION_POLICY_PERMISSIONS[action],
      resource: {
        tenantId: context.tenantId,
        purpose: "metadata.publication",
        ...(definitionId
          ? { recordId: definitionId, revisionId: definitionId }
          : {}),
      },
    });
    if (!decision.allowed)
      throw Error("PUBLICATION_POLICY_ENROLLMENT_FORBIDDEN");
    return options.database
      .transaction()
      .setIsolationLevel("serializable")
      .execute(async (tx) => {
        await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${context.tenantId},true),
        set_config('app.current_principal_id',${context.principalId},true)`.execute(
          tx,
        );
        const actors = (
          await sql`SELECT id FROM master.principal WHERE tenant_id=${context.tenantId}::uuid
        AND id=${context.principalId}::uuid AND principal_type='user' AND status='active' AND auth_epoch=${context.authEpoch}`.execute(
            tx,
          )
        ).rows;
        if (actors.length !== 1)
          throw Error("PUBLICATION_POLICY_ENROLLMENT_ACTOR_REVOKED");
        return work(tx);
      });
  }
  const owner = (context: VerifiedRequestContext) => {
    const repository = createKyselyPolicyAuthoringRepository(context);
    return {
      repository,
      service: createPolicyAuthoringService({
        repository,
        signer: options.signer,
        evaluator: createJsonRuleEvaluator(),
      }),
    };
  };
  async function audit(
    context: VerifiedRequestContext,
    tx: Database,
    action: "proposed" | "activated" | "replaced",
    id: string,
    hash: string,
    replaced?: readonly PublicationPolicyPin[],
  ) {
    const stored = await options.audit.record(
      {
        eventCode: `metadata.publication.policy.${action}`,
        action: "publication_policy_enrollment",
        outcome: "success",
        severity: "critical",
        tenantId: context.tenantId,
        actor: { kind: "user", principalId: context.principalId },
        entityType: "control.policy_definition",
        entityId: id,
        requestId: context.requestId,
        metadata: {
          schema: "athyper.publication-policy-enrollment-receipt/1",
          environment: "dev",
          definitionHash: hash,
          ...(replaced ? { replaced } : {}),
        },
      },
      tx,
    );
    if (
      !stored.id ||
      stored.actor.principalId !== context.principalId ||
      stored.tenantId !== context.tenantId
    )
      throw Error("PUBLICATION_POLICY_ENROLLMENT_AUDIT_REQUIRED");
  }
  return {
    propose(context: VerifiedRequestContext, input: unknown) {
      const policy = parsePublicationPolicyProposal(input);
      if (
        [policy.authorPrincipalId, policy.publisherPrincipalId].includes(
          context.principalId,
        )
      )
        throw Error("PUBLICATION_POLICY_ENROLLMENT_INDEPENDENT_ACTOR_REQUIRED");
      return execute(context, "propose", async (tx) => {
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:metadata.publication:${policy.policyId}`},0))`.execute(
          tx,
        );
        const existing = (
          await sql`SELECT id FROM control.policy_definition WHERE tenant_id=${context.tenantId}::uuid
          AND entity_type='metadata.publication' AND name=${policy.policyId} LIMIT 1`.execute(
            tx,
          )
        ).rows;
        if (existing.length)
          throw Error("PUBLICATION_POLICY_ENROLLMENT_ALREADY_EXISTS");
        if (policy.schema === "athyper.dev-native-compilation-recovery/1") {
          await assertNativeRecoverySource(tx, policy, true);
        } else if (
          policy.schema === "athyper.dev-deployment-recovery-compiler/1"
        ) {
          await assertRecoveryCompilerSource(
            tx,
            policy,
            context.tenantId,
            true,
          );
        } else if (
          policy.schema === "athyper.dev-coordinated-deployment-recovery/1"
        ) {
          await assertDeploymentRecoverySource(tx, policy, context.tenantId);
        } else if (
          policy.schema === "athyper.dev-human-reviewed-publication/1"
        ) {
          await assertHumanReviewedEnrollmentSource(
            tx,
            policy,
            context.tenantId,
            options.nativeSource,
          );
        } else if (
          policy.schema === "athyper.dev-compilation-recovery-policy/1"
        ) {
          assertCompilationRecoveryWindow(policy, Date.now(), true);
          await assertCompilationRecoverySource(tx, policy, true);
        } else {
          const source = (
            await sql`SELECT id FROM metadata.entity_change_set WHERE id=${policy.changeSetId}::uuid
          AND entity_id=${policy.entityId}::uuid AND tenant_id IS NULL AND status IN ('draft','in_review','approved')`.execute(
              tx,
            )
          ).rows;
          if (source.length !== 1)
            throw Error("PUBLICATION_POLICY_ENROLLMENT_SOURCE_UNAVAILABLE");
        }
        if (policy.schema === "athyper.dev-entity-successor-policy/1") {
          assertPublicationCompilerIdentity(policy.compiler);
          await assertEntitySuccessorSource(tx, policy, context.tenantId);
        }
        const policyHash = digest(policy);
        const facts = {
          environment: "dev",
          tenantId: context.tenantId,
          policyHash,
        };
        const condition = {
          and: Object.entries(facts).map(([key, value]) => ({
            "===": [{ var: key }, value],
          })),
        };
        const tests = [
          {
            code: "positive.exact",
            name: "Exact DEV enrollment",
            input: facts,
            expected: { action: "allow" },
          },
          ...["qa", "staging", "production"].map((environment) => ({
            code: `negative.${environment}`,
            name: `Reject ${environment}`,
            input: { ...facts, environment },
            expected: { action: "none" },
          })),
          {
            code: "negative.tenant",
            name: "Reject other tenant",
            input: { ...facts, tenantId: "other" },
            expected: { action: "none" },
          },
          {
            code: "negative.pin",
            name: "Reject other source",
            input: { ...facts, policyHash: "other" },
            expected: { action: "none" },
          },
        ];
        const { repository, service } = owner(context);
        const definition = await repository.createDraft(
          {
            definition: {
              tenantId: context.tenantId,
              entityType: "metadata.publication",
              name: policy.policyId,
              priority: 100,
              evaluationMode: "first_match",
              effectiveFrom: new Date().toISOString().slice(0, 10),
              versionNo: 1,
            },
            rules: [
              {
                id: randomUUID(),
                priority: 10,
                condition,
                action: "allow",
                metadata: {},
                actionConfig: {
                  schema: "athyper.machine-publication-enrollment/1",
                  environment: "dev",
                  permissionCode: MACHINE_PUBLICATION_PERMISSION,
                  tenantId: context.tenantId,
                  policy,
                },
              },
            ],
            tests,
          },
          tx,
        );
        const results = await service.runAllTests(definition.id, tx);
        if (
          results.length !== tests.length ||
          results.some((result) => !result.passed)
        )
          throw Error("PUBLICATION_POLICY_ENROLLMENT_TESTS_FAILED");
        await repository.requestApproval(definition.id, tx);
        const hash = calculateDefinitionHash(definition);
        await audit(context, tx, "proposed", definition.id, hash);
        return {
          id: definition.id,
          version: definition.versionNo,
          hash,
          status: "pending_approval" as const,
        };
      });
    },
    activate(
      context: VerifiedRequestContext,
      id: string,
      expectedHash: string,
    ) {
      return activate(context, id, expectedHash);
    },
    replace(
      context: VerifiedRequestContext,
      id: string,
      expectedHash: string,
      predecessors: unknown,
    ) {
      return activate(
        context,
        id,
        expectedHash,
        parseReplacementPins(predecessors, id),
      );
    },
  };
  async function activate(
    context: VerifiedRequestContext,
    id: string,
    expectedHash: string,
    replaced?: readonly PublicationPolicyPin[],
  ) {
    if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{64}$/.test(expectedHash))
      throw Error("PUBLICATION_POLICY_ENROLLMENT_PIN_INVALID");
    return execute(
      context,
      "activate",
      async (tx) => {
        const { repository, service } = owner(context);
        const definition = await repository.getDefinition(id, tx);
        if (
          !definition ||
          definition.entityType !== "metadata.publication" ||
          definition.rules.length !== 1 ||
          calculateDefinitionHash(definition) !== expectedHash
        )
          throw Error("PUBLICATION_POLICY_ENROLLMENT_PIN_MISMATCH");
        const enrolled = definition.rules[0]!.actionConfig;
        const policy = parsePublicationPolicyProposal(enrolled.policy);
        if (
          enrolled.schema !== "athyper.machine-publication-enrollment/1" ||
          enrolled.environment !== "dev" ||
          enrolled.tenantId !== context.tenantId ||
          enrolled.permissionCode !== MACHINE_PUBLICATION_PERMISSION
        )
          throw Error("PUBLICATION_POLICY_ENROLLMENT_SCOPE_MISMATCH");
        if (
          [policy.authorPrincipalId, policy.publisherPrincipalId].includes(
            context.principalId,
          )
        )
          throw Error(
            "PUBLICATION_POLICY_ENROLLMENT_INDEPENDENT_ACTOR_REQUIRED",
          );
        if (
          replaced &&
          policy.schema !== "athyper.dev-human-reviewed-publication/1" &&
          policy.schema !== "athyper.dev-native-compilation-recovery/1"
        )
          throw Error("PUBLICATION_REPLACEMENT_SCOPE_MISMATCH");
        if (policy.schema === "athyper.dev-native-compilation-recovery/1") {
          await assertNativeRecoverySource(tx, policy, true);
          const active = (
            await sql<{
              id: string;
            }>`SELECT d.id FROM control.policy_definition d JOIN control.policy_rule r ON r.policy_definition_id=d.id
            WHERE d.tenant_id=${context.tenantId}::uuid AND d.entity_type='metadata.publication' AND d.status IN ('active','published')
            AND r.action_config#>>'{policy,schema}'='athyper.dev-native-compilation-recovery/1'
            AND r.action_config#>>'{policy,originalPolicy,id}'=${policy.originalPolicy.id} AND d.id<>${id}::uuid`.execute(
              tx,
            )
          ).rows;
          if (replaced) {
            const ids = [id, ...replaced.map((p) => p.id)].sort();
            const rows = (
              await sql<{
                id: string;
                status: string;
                definition_hash: string;
                created_by: string;
                updated_by: string;
              }>`SELECT id,status,definition_hash,created_by,updated_by FROM control.policy_definition WHERE tenant_id=${context.tenantId}::uuid AND id=ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE NOWAIT`.execute(
                tx,
              )
            ).rows;
            const next = rows.find((r) => r.id === id);
            if (
              rows.length !== ids.length ||
              !next ||
              next.created_by === context.principalId ||
              next.definition_hash !== expectedHash ||
              !["pending_approval", "active"].includes(next.status)
            )
              throw Error("PUBLICATION_REPLACEMENT_PIN_MISMATCH");
            const receipt = (
              await sql<{
                retired: PublicationPolicyPin[];
                replacement_hash: string;
                actor_id: string;
              }>`SELECT retired,replacement_hash,actor_id FROM control.publication_policy_replacement WHERE tenant_id=${context.tenantId}::uuid AND replacement_id=${id}::uuid`.execute(
                tx,
              )
            ).rows[0];
            if (receipt) {
              if (
                receipt.actor_id !== context.principalId ||
                receipt.replacement_hash !== expectedHash ||
                canonicalJson(receipt.retired) !== canonicalJson(replaced) ||
                next.status !== "active" ||
                next.updated_by !== context.principalId ||
                active.length ||
                rows
                  .filter((r) => r.id !== id)
                  .some((r) => r.status !== "retired")
              )
                throw Error("PUBLICATION_REPLACEMENT_PIN_MISMATCH");
              return {
                id,
                version: definition.versionNo,
                hash: expectedHash,
                status: "active" as const,
                replaced,
                replayed: true,
              };
            }
            if (
              canonicalJson(active.map((r) => r.id).sort()) !==
              canonicalJson(replaced.map((p) => p.id).sort())
            )
              throw Error("PUBLICATION_REPLACEMENT_OVERLAP_CHANGED");
            for (const pin of replaced) {
              const row = rows.find((r) => r.id === pin.id)!,
                oldDefinition = await repository.getDefinition(pin.id, tx);
              if (
                !oldDefinition ||
                row.status !== "active" ||
                row.definition_hash !== pin.hash ||
                row.created_by === context.principalId ||
                row.updated_by !== context.principalId ||
                calculateDefinitionHash(oldDefinition) !== pin.hash ||
                oldDefinition.rules.length !== 1
              )
                throw Error(
                  "PUBLICATION_REPLACEMENT_INDEPENDENT_ACTOR_REQUIRED",
                );
              const rule = oldDefinition.rules[0]!,
                old = parsePublicationPolicyProposal(rule.actionConfig.policy);
              if (
                old.schema !== policy.schema ||
                digest(nativeRecoveryScope(old)) !==
                  digest(nativeRecoveryScope(policy)) ||
                rule.action !== "allow" ||
                rule.actionConfig.schema !== enrolled.schema ||
                rule.actionConfig.environment !== "dev" ||
                rule.actionConfig.tenantId !== context.tenantId ||
                rule.actionConfig.permissionCode !==
                  MACHINE_PUBLICATION_PERMISSION
              )
                throw Error("PUBLICATION_REPLACEMENT_SCOPE_MISMATCH");
            }
          } else if (active.length)
            throw Error("NATIVE_COMPILATION_RECOVERY_ALREADY_ACTIVE");
        }
        if (policy.schema === "athyper.dev-deployment-recovery-compiler/1") {
          await assertRecoveryCompilerSource(
            tx,
            policy,
            context.tenantId,
            true,
          );
          if (
            (
              await activeRecoveryCompilerPolicies(
                tx,
                context.tenantId,
                policy.recoveryPolicy.id,
                id,
              )
            ).length
          )
            throw Error("DEPLOYMENT_RECOVERY_COMPILER_ALREADY_ACTIVE");
        }
        if (policy.schema === "athyper.dev-coordinated-deployment-recovery/1") {
          await assertDeploymentRecoverySource(tx, policy, context.tenantId);
          const active = (
            await sql`SELECT d.id FROM control.policy_definition d JOIN control.policy_rule r ON r.policy_definition_id=d.id
            WHERE d.tenant_id=${context.tenantId}::uuid AND d.entity_type='metadata.publication' AND d.status IN ('active','published')
              AND r.action_config#>>'{policy,schema}'='athyper.dev-coordinated-deployment-recovery/1'
              AND r.action_config#>>'{policy,originalPolicy,id}'=${policy.originalPolicy.id} AND d.id<>${id}::uuid`.execute(
              tx,
            )
          ).rows;
          if (active.length) throw Error("DEPLOYMENT_RECOVERY_ALREADY_ACTIVE");
        }
        if (policy.schema === "athyper.dev-human-reviewed-publication/1") {
          await lockPublicationSources(tx, policy);
          if (replaced) {
            // Lock immutable enrollment rows in stable order. Existing RLS allows
            // only the independent reviewer to lock/retire their active policy.
            const ids = [id, ...replaced.map((p) => p.id)].sort();
            const rows = (
              await sql<{
                id: string;
                status: string;
                definition_hash: string;
                created_by: string;
                updated_by: string;
              }>`
              SELECT id,status,definition_hash,created_by,updated_by FROM control.policy_definition
              WHERE tenant_id=${context.tenantId}::uuid AND id=ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE NOWAIT`.execute(
                tx,
              )
            ).rows;
            if (rows.length !== ids.length)
              throw Error("PUBLICATION_REPLACEMENT_PIN_MISMATCH");
            const next = rows.find((r) => r.id === id)!;
            if (
              next.created_by === context.principalId ||
              next.definition_hash !== expectedHash ||
              !["pending_approval", "active"].includes(next.status) ||
              (next.status === "active" &&
                next.updated_by !== context.principalId)
            )
              throw Error("PUBLICATION_REPLACEMENT_INDEPENDENT_ACTOR_REQUIRED");
            const receipt = (
              await sql<{
                retired: PublicationPolicyPin[];
                replacement_hash: string;
                actor_id: string;
              }>`
              SELECT retired,replacement_hash,actor_id FROM control.publication_policy_replacement
              WHERE tenant_id=${context.tenantId}::uuid AND replacement_id=${id}::uuid`.execute(
                tx,
              )
            ).rows[0];
            if (receipt) {
              assertPublicationCompilerIdentity(policy.compiler);
              if (
                receipt.replacement_hash !== expectedHash ||
                receipt.actor_id !== context.principalId ||
                canonicalJson(receipt.retired) !== canonicalJson(replaced) ||
                next.status !== "active" ||
                rows
                  .filter((r) => r.id !== id)
                  .some((r) => r.status !== "retired")
              )
                throw Error("PUBLICATION_REPLACEMENT_PIN_MISMATCH");
              if (
                (await overlappingPolicies(tx, context.tenantId, policy, id))
                  .length
              )
                throw Error("PUBLICATION_REPLACEMENT_OVERLAP_CHANGED");
              return {
                id,
                version: definition.versionNo,
                hash: expectedHash,
                status: "active" as const,
                replaced,
                replayed: true,
              };
            }
            for (const pin of replaced) {
              const row = rows.find((r) => r.id === pin.id)!;
              const previous = await repository.getDefinition(pin.id, tx);
              if (
                !previous ||
                previous.entityType !== "metadata.publication" ||
                row.status !== "active" ||
                row.definition_hash !== pin.hash ||
                calculateDefinitionHash(previous) !== pin.hash ||
                previous.rules.length !== 1
              )
                throw Error("PUBLICATION_REPLACEMENT_PIN_MISMATCH");
              if (
                row.created_by === row.updated_by ||
                row.updated_by !== context.principalId
              )
                throw Error(
                  "PUBLICATION_REPLACEMENT_INDEPENDENT_ACTOR_REQUIRED",
                );
              const old = parsePublicationPolicyProposal(
                previous.rules[0]!.actionConfig.policy,
              );
              if (
                old.schema !== "athyper.dev-human-reviewed-publication/1" ||
                replacementScope(old) !== replacementScope(policy) ||
                previous.rules[0]!.action !== "allow" ||
                previous.rules[0]!.actionConfig.schema !== enrolled.schema ||
                previous.rules[0]!.actionConfig.environment !== "dev" ||
                previous.rules[0]!.actionConfig.tenantId !== context.tenantId ||
                previous.rules[0]!.actionConfig.permissionCode !==
                  MACHINE_PUBLICATION_PERMISSION
              )
                throw Error("PUBLICATION_REPLACEMENT_SCOPE_MISMATCH");
            }
            const active = await overlappingPolicies(
              tx,
              context.tenantId,
              policy,
              id,
            );
            if (
              canonicalJson(active) !== canonicalJson(replaced.map((p) => p.id))
            )
              throw Error("PUBLICATION_REPLACEMENT_OVERLAP_CHANGED");
            const released = (
              await sql`SELECT id FROM metadata.entity_release WHERE change_set_id=ANY(${policy.plan.members.map((m) => m.changeSetId)}::uuid[]) LIMIT 1`.execute(
                tx,
              )
            ).rows;
            if (released.length)
              throw Error("PUBLICATION_REPLACEMENT_EXECUTION_IN_PROGRESS");
          } else if (
            (await overlappingPolicies(tx, context.tenantId, policy, id)).length
          )
            throw Error("PUBLICATION_REPLACEMENT_REQUIRED");
          await assertHumanReviewedEnrollmentSource(
            tx,
            policy,
            context.tenantId,
            options.nativeSource,
          );
        }
        if (policy.schema === "athyper.dev-entity-successor-policy/1") {
          assertPublicationCompilerIdentity(policy.compiler);
          await assertEntitySuccessorSource(tx, policy, context.tenantId);
        }
        if (policy.schema === "athyper.dev-compilation-recovery-policy/1") {
          assertCompilationRecoveryWindow(policy, Date.now(), true);
          await assertCompilationRecoverySource(tx, policy, true);
          // Serialize independent activations for this failed release, not just
          // a caller-chosen policy name. Ambiguous active recovery is forbidden.
          const active = (
            await sql`SELECT d.id FROM control.policy_definition d JOIN control.policy_rule r ON r.policy_definition_id=d.id
            WHERE d.tenant_id=${context.tenantId}::uuid AND d.entity_type='metadata.publication' AND d.status IN ('active','published')
              AND r.action_config#>>'{policy,schema}'='athyper.dev-compilation-recovery-policy/1'
              AND r.action_config#>>'{policy,failedReleaseId}'=${policy.failedReleaseId} AND d.id<>${id}::uuid`.execute(
              tx,
            )
          ).rows;
          if (active.length) throw Error("COMPILATION_RECOVERY_ALREADY_ACTIVE");
        }
        const tests = await repository.listTestCases(id, tx);
        const required = [
          "positive.exact",
          "negative.qa",
          "negative.staging",
          "negative.production",
          "negative.tenant",
          "negative.pin",
        ];
        if (
          tests.length !== required.length ||
          new Set(tests.map((test) => test.code)).size !== required.length ||
          tests.some((test) => !required.includes(test.code))
        )
          throw Error("PUBLICATION_POLICY_ENROLLMENT_TESTS_REQUIRED");
        const facts = {
          environment: "dev",
          tenantId: context.tenantId,
          policyHash: digest(policy),
        };
        const condition = {
          and: Object.entries(facts).map(([key, value]) => ({
            "===": [{ var: key }, value],
          })),
        };
        if (
          definition.rules[0]!.action !== "allow" ||
          digest(definition.rules[0]!.condition) !== digest(condition)
        )
          throw Error("PUBLICATION_POLICY_ENROLLMENT_CONDITION_MISMATCH");
        for (const test of tests) {
          const kind = test.code.split(".")[1];
          const input =
            kind === "tenant"
              ? { ...facts, tenantId: "other" }
              : kind === "pin"
                ? { ...facts, policyHash: "other" }
                : kind === "exact"
                  ? facts
                  : { ...facts, environment: kind };
          if (
            digest(test.input) !== digest(input) ||
            digest(test.expected) !==
              digest({ action: kind === "exact" ? "allow" : "none" })
          )
            throw Error("PUBLICATION_POLICY_ENROLLMENT_TEST_CHANGED");
        }
        const current = (
          await sql<{
            status: string;
          }>`SELECT status FROM control.policy_definition WHERE id=${id}::uuid AND tenant_id=${context.tenantId}::uuid`.execute(
            tx,
          )
        ).rows[0];
        if (replaced && current?.status === "active") {
          const results = await service.runAllTests(id, tx);
          if (
            results.length !== required.length ||
            results.some((r) => !r.passed || r.definitionHash !== expectedHash)
          )
            throw Error("PUBLICATION_POLICY_ENROLLMENT_TESTS_FAILED");
        } else await service.activate(id, tx); // Existing maker/checker, tests and approval checks.
        if (replaced) {
          await sql`INSERT INTO control.publication_policy_replacement(tenant_id,replacement_id,replacement_hash,retired,actor_id,request_id)
            VALUES(${context.tenantId}::uuid,${id}::uuid,${expectedHash},${JSON.stringify(replaced)}::jsonb,${context.principalId}::uuid,${context.requestId}::uuid)`.execute(
            tx,
          );
          for (const pin of replaced) {
            const changed = (
              await sql`UPDATE control.policy_definition SET status='retired',updated_at=clock_timestamp()
              WHERE id=${pin.id}::uuid AND tenant_id=${context.tenantId}::uuid AND status='active' AND definition_hash=${pin.hash}
              AND updated_by=${context.principalId}::uuid RETURNING id`.execute(
                tx,
              )
            ).rows;
            if (changed.length !== 1)
              throw Error("PUBLICATION_REPLACEMENT_PIN_MISMATCH");
          }
          if (policy.schema === "athyper.dev-native-compilation-recovery/1") {
            const others = (
              await sql`SELECT d.id FROM control.policy_definition d JOIN control.policy_rule r ON r.policy_definition_id=d.id
              WHERE d.tenant_id=${context.tenantId}::uuid AND d.entity_type='metadata.publication' AND d.status IN ('active','published')
              AND r.action_config#>>'{policy,schema}'='athyper.dev-native-compilation-recovery/1'
              AND r.action_config#>>'{policy,originalPolicy,id}'=${policy.originalPolicy.id} AND d.id<>${id}::uuid`.execute(
                tx,
              )
            ).rows;
            if (others.length)
              throw Error("PUBLICATION_REPLACEMENT_OVERLAP_CHANGED");
          } else if (
            policy.schema !== "athyper.dev-human-reviewed-publication/1" ||
            (await overlappingPolicies(tx, context.tenantId, policy, id)).length
          )
            throw Error("PUBLICATION_REPLACEMENT_OVERLAP_CHANGED");
          await audit(context, tx, "replaced", id, expectedHash, replaced);
        } else await audit(context, tx, "activated", id, expectedHash);
        return {
          id,
          version: definition.versionNo,
          hash: expectedHash,
          status: "active" as const,
          ...(replaced ? { replaced, replayed: false } : {}),
        };
      },
      id,
    );
  }
}
