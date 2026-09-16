import { createHash } from "node:crypto";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  ProcessSelectionPublication,
  ProcessSelectionCompilerPorts,
  ProcessScope,
} from "@athyper/server-contract-control-admin";
import type {
  ProcessSelectionService,
  ProcessSelectionFacts,
  ProcessSelectionEvaluation,
  ProcessSelectionPreview,
  ProcessSelectionEvidence,
  ProcessSelectionEvidenceRepository,
  ProcessAttemptCoordinate,
} from "@athyper/server-contract-governance";
import {
  compileProcessSelection,
  parseProcessSelectionAction,
} from "@athyper/server-platform-control-admin";
import type { ExplainablePolicyService } from "@athyper/server-platform-policy";

export interface ProcessSelectionServicePorts<T> {
  /** Must authorize scoped case read/submit and resolve immutable snapshot + current authority versions. */
  readonly facts: (
    context: VerifiedRequestContext,
    caseId: string,
    mode: "preview" | "select",
    transaction: T,
  ) => Promise<ProcessSelectionFacts>;
  /** Exact scope match; overlapping effective bindings are an error, never a priority tie-break. */
  readonly publications: (
    scope: ProcessScope,
    asOf: string,
    transaction: T,
  ) => Promise<readonly ProcessSelectionPublication[]>;
  /** Resolve the original immutable publication and accepted selection for corrections. */
  readonly pinned?: (
    context: VerifiedRequestContext,
    caseId: string,
    transaction: T,
  ) => Promise<
    | {
        publication: ProcessSelectionPublication;
        evidence: ProcessSelectionEvidence;
      }
    | undefined
  >;
  readonly compiler: (transaction: T) => ProcessSelectionCompilerPorts;
  readonly policy: Pick<ExplainablePolicyService<T>, "evaluateExact">;
  readonly evidence: ProcessSelectionEvidenceRepository<T>;
  readonly now?: () => Date;
}
export class ProcessSelectionError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function fail(code: string): never {
  throw new ProcessSelectionError(code);
}
export function processSelectionCanonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(processSelectionCanonical).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => `${JSON.stringify(key)}:${processSelectionCanonical(v)}`)
    .join(",")}}`;
}
const same = (a: unknown, b: unknown) =>
  processSelectionCanonical(a) === processSelectionCanonical(b);
const rank = { simple: 0, standard: 1, enhanced: 2 } as const;

/** No cycle, workflow, outbox or document creation port exists here. P2 owns their atomic commit. */
export function createProcessSelectionService<T>(
  ports: ProcessSelectionServicePorts<T>,
): ProcessSelectionService<T> {
  const load = async (
    context: VerifiedRequestContext,
    caseId: string,
    mode: "preview" | "select",
    tx: T,
  ) => {
    const facts = structuredClone(await ports.facts(context, caseId, mode, tx));
    if (
      facts.caseId !== caseId ||
      facts.scope.tenantId !== context.tenantId ||
      facts.scope.planeKey !== context.planeKey
    )
      fail("PROCESS_SELECTION_SCOPE_MISMATCH");
    if (facts.requestedRequirement === undefined)
      fail("PROCESS_REQUIREMENT_MISSING");
    if (
      !/^[0-9a-f-]{36}$/i.test(facts.snapshot.id) ||
      !Number.isSafeInteger(facts.snapshot.version) ||
      facts.snapshot.version < 1 ||
      !/^[a-f0-9]{64}$/.test(facts.snapshot.hash)
    )
      fail("PROCESS_SNAPSHOT_INVALID");
    if (!["basic", "standard", "enhanced"].includes(facts.requestedRequirement))
      fail("PROCESS_REQUIREMENT_INVALID");
    if (
      (facts.reason !== null &&
        (typeof facts.reason !== "string" || facts.reason.length > 2000)) ||
      (facts.requestedRequirement === "basic" && !facts.reason?.trim())
    )
      fail("PROCESS_REQUIREMENT_REASON_INVALID");
    if (!Number.isFinite(Date.parse(facts.authorityAsOf)))
      fail("PROCESS_AUTHORITY_UNAVAILABLE");
    const pinned = await ports.pinned?.(context, caseId, tx);
    const publications = pinned
      ? [pinned.publication]
      : await ports.publications(facts.scope, facts.authorityAsOf, tx);
    if (publications.length !== 1)
      fail("PROCESS_SELECTION_BINDING_UNAVAILABLE");
    const publication = structuredClone(publications[0]!);
    if (!same(publication.scope, facts.scope))
      fail("PROCESS_SELECTION_SCOPE_MISMATCH");
    // The current domain owners supply controls; publication data cannot weaken them.
    if (!facts.minimumControls.length) fail("PROCESS_AUTHORITY_UNAVAILABLE");
    const controls = [
      ...publication.minimumControls,
      ...facts.minimumControls,
    ].filter((c, i, all) => all.findIndex((other) => same(c, other)) === i);
    if (
      controls.some((control, index) =>
        controls.some(
          (other, j) =>
            j !== index &&
            same(control.authority, other.authority) &&
            !same(control, other),
        ),
      )
    )
      fail("PROCESS_AUTHORITY_AMBIGUOUS");
    const compiled = await compileProcessSelection(
      { ...publication, minimumControls: controls },
      ports.compiler(tx),
    );
    if (!compiled.valid) fail("PROCESS_SELECTION_CONFIGURATION_INVALID");
    const envelope = {
      request: { requestedComplianceLevel: facts.requestedRequirement },
      context: facts.scope,
      controls,
      source: {
        caseId,
        snapshot: facts.snapshot,
        authorityAsOf: facts.authorityAsOf,
      },
      factSchema: publication.factSchema,
    };
    const policyEffectiveOn = (
      pinned?.evidence.policyEffectiveOn ??
      pinned?.evidence.authorityAsOf ??
      facts.authorityAsOf
    ).slice(0, 10);
    const evaluated = await ports.policy.evaluateExact(
      {
        context,
        entityType: publication.definition.entityType,
        entityId: caseId,
        revision: publication.policy,
        effectiveOn: policyEffectiveOn,
        facts: envelope,
      },
      tx,
    );
    if (
      !same(
        { ...evaluated.definition, definitionHash: publication.policy.hash },
        { ...publication.definition, definitionHash: publication.policy.hash },
      )
    )
      fail("PROCESS_POLICY_DEFINITION_MISMATCH");
    const winning = evaluated.decision.winning;
    if (
      !winning ||
      evaluated.decision.action !== "require_workflow" ||
      evaluated.decision.outcomes.length !== 1
    )
      fail("PROCESS_SELECTION_RESULT_MISSING");
    const action = parseProcessSelectionAction(
      winning.action,
      winning.actionConfig,
    );
    if (!action) fail("PROCESS_SELECTION_RESULT_INVALID");
    const candidate = publication.manifests.find((m) =>
      same(m.profile, action.profile),
    );
    if (!candidate) fail("PROCESS_SELECTION_PROFILE_UNAVAILABLE");
    const floor = Math.max(
      rank[candidate.profile.code],
      ...controls.map((c) => rank[c.minimumProfile]),
    );
    const manifest = publication.manifests.find(
      (m) => rank[m.profile.code] === floor,
    );
    if (
      !manifest ||
      controls.some((c) =>
        c.mandatoryGateCodes.some(
          (g) => !manifest.mandatoryGateCodes.includes(g),
        ),
      )
    )
      fail("PROCESS_MINIMUM_CONTROL_UNSATISFIED");
    if (
      pinned &&
      (!same(manifest.profile, pinned.evidence.effectiveProfile) ||
        !same(manifest, pinned.evidence.executionManifest))
    )
      fail("PROCESS_CORRECTION_PROFILE_CHANGE_UNSUPPORTED");
    const trace = [...publication.definition.rules]
      .sort((a, b) => a.priority - b.priority)
      .map((rule) => {
        const item = evaluated.trace.find((t) => t.ruleId === rule.id);
        return {
          ruleId: rule.id,
          priority: rule.priority,
          result: item
            ? item.matched
              ? ("matched" as const)
              : ("false" as const)
            : ("not_evaluated" as const),
        };
      });
    const selection: ProcessSelectionEvaluation = {
      policy: publication.policy,
      policyEffectiveOn,
      evaluatorVersion: evaluated.evaluatorVersion,
      factSchema: publication.factSchema,
      factHash: createHash("sha256")
        .update(processSelectionCanonical(envelope))
        .digest("hex"),
      authorityAsOf: facts.authorityAsOf,
      requestedRequirement: facts.requestedRequirement,
      candidateProfile: candidate.profile,
      effectiveProfile: manifest.profile,
      minimumControls: controls,
      trace,
      winningRuleId: winning.ruleId,
      executionManifest: manifest,
    };
    return { facts, selection };
  };
  return {
    async preview(
      context: VerifiedRequestContext,
      caseId: string,
      tx: T,
    ): Promise<ProcessSelectionPreview> {
      try {
        return {
          status: "ready",
          selection: (await load(context, caseId, "preview", tx)).selection,
        };
      } catch (error) {
        // Authorization failures propagate. Only owned configuration/validation failures become preview explanations.
        if (error instanceof ProcessSelectionError)
          return {
            status:
              error.code === "PROCESS_REQUIREMENT_MISSING"
                ? "incomplete"
                : "unavailable",
            code: error.code,
          };
        if (error instanceof Error && error.message.startsWith("POLICY_EXACT_"))
          return { status: "unavailable", code: error.message };
        throw error;
      }
    },
    async select(
      context: VerifiedRequestContext,
      caseId: string,
      coordinate: ProcessAttemptCoordinate,
      idempotencyKey: string,
      tx: T,
    ): Promise<ProcessSelectionEvidence> {
      const uuid = (v: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          v,
        );
      if (
        ![
          coordinate.caseId,
          coordinate.selectionId,
          coordinate.cycleRunId,
          coordinate.attemptId,
          coordinate.submissionSnapshot.id,
        ].every(uuid) ||
        !Number.isSafeInteger(coordinate.attemptNumber) ||
        coordinate.attemptNumber < 1 ||
        idempotencyKey.length < 8 ||
        idempotencyKey.length > 200
      )
        fail("PROCESS_SELECTION_COORDINATE_INVALID");
      const { facts, selection } = await load(context, caseId, "select", tx);
      if (
        coordinate.caseId !== caseId ||
        !same(coordinate.scope, facts.scope) ||
        !same(coordinate.submissionSnapshot, facts.snapshot) ||
        !same(coordinate.manifest, selection.executionManifest.revision)
      )
        fail("PROCESS_SELECTION_COORDINATE_MISMATCH");
      return ports.evidence.append(
        {
          ...selection,
          coordinate,
          actorPrincipalId: context.principalId,
          reason: facts.reason,
          acceptedAt: (ports.now?.() ?? new Date()).toISOString(),
          idempotencyKey,
        },
        tx,
      );
    },
  };
}
