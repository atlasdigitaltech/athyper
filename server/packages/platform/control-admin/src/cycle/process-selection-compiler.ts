import { createHash } from "node:crypto";
import { calculateDefinitionHash } from "@athyper/server-platform-policy";
import type {
  CompiledProcessSelection,
  ProcessSelectionPublication,
  ProcessSelectionCompilerPorts,
  ProcessRevision,
  ProcessScope,
  ProcessProfileRevision,
  ProcessRequirement,
  ProcessSelectionAction,
  ProcessSelectionIssue,
} from "@athyper/server-contract-control-admin";

const levels = ["basic", "standard", "enhanced"] as const;
const profiles = ["simple", "standard", "enhanced"] as const;
const purposes = [
  "submitted_review_pack",
  "decision_document",
  "activation_confirmation",
] as const;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = /^[a-f0-9]{64}$/;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const same = (a: ProcessRevision, b: ProcessRevision) =>
  a.id === b.id && a.version === b.version && a.hash === b.hash;
const sameScope = (a: ProcessScope, b: ProcessScope) =>
  [
    "tenantId",
    "planeKey",
    "processFamily",
    "operatingOrganizationId",
    "companyCodeId",
  ].every((k) => a[k as keyof ProcessScope] === b[k as keyof ProcessScope]);
const exact = (r: ProcessRevision) =>
  !!r &&
  uuid.test(r.id) &&
  Number.isSafeInteger(r.version) &&
  r.version > 0 &&
  hash.test(r.hash);

/** Scoped publication validation, not a second expression engine or runtime selector. */
export async function compileProcessSelection(
  publication: ProcessSelectionPublication,
  ports: ProcessSelectionCompilerPorts,
): Promise<CompiledProcessSelection> {
  const issues: ProcessSelectionIssue[] = [];
  const fail = (code: string, path: string, message: string) => {
    issues.push({ code, path, message });
  };
  const pins: {
    kind: Parameters<typeof ports.isPublished>[0];
    revision: ProcessRevision;
    path: string;
  }[] = [];
  const pin = (
    kind: Parameters<typeof ports.isPublished>[0],
    revision: ProcessRevision,
    path: string,
  ) => {
    if (!exact(revision))
      fail(
        "INVALID_REVISION",
        path,
        "Exact immutable revision ID, positive version and SHA-256 are required.",
      );
    else pins.push({ kind, revision, path });
  };
  const mappings = {} as Record<ProcessRequirement, ProcessProfileRevision>;
  try {
    // Clone so an author cannot mutate a validated object while external references resolve.
    publication = structuredClone(publication);
    const { scope, definition, manifests } = publication;
    if (
      publication.schema !== "athyper.process-selection-publication/1" ||
      !uuid.test(scope.tenantId) ||
      !uuid.test(scope.operatingOrganizationId) ||
      (scope.companyCodeId !== null && !uuid.test(scope.companyCodeId)) ||
      !["neon", "studio", "mesh"].includes(scope.planeKey) ||
      !/^[a-z][a-z0-9_.-]{1,126}$/.test(scope.processFamily)
    )
      fail(
        "INVALID_SCOPE",
        "scope",
        "A single tenant, plane, process family and organization/company scope is required.",
      );
    pin("policy", publication.policy, "policy");
    pin("fact_schema", publication.factSchema, "factSchema");
    if (publication.factSchema.code !== "supplier_onboarding_requirement")
      fail(
        "INVALID_FACT_SCHEMA",
        "factSchema",
        "Increment A requires the declared requirement fact schema.",
      );
    if (
      !uuid.test(publication.policy.definitionId) ||
      definition.id !== publication.policy.definitionId ||
      publication.policy.id !== publication.policy.definitionId ||
      definition.entityType !== scope.processFamily ||
      definition.versionNo !== publication.policy.version ||
      calculateDefinitionHash(definition) !== publication.policy.hash ||
      definition.tenantId !== scope.tenantId
    )
      fail(
        "POLICY_REVISION_MISMATCH",
        "definition",
        "Definition content, version and tenant must match the exact policy binding.",
      );
    if (definition.evaluationMode !== "first_match")
      fail(
        "INVALID_EVALUATION_MODE",
        "definition.evaluationMode",
        "Process selection requires one first-match definition.",
      );
    const priorities = new Set<number>(),
      ids = new Set<string>();
    for (const [i, rule] of definition.rules.entries()) {
      const path = `definition.rules[${i}]`;
      if (
        !Number.isSafeInteger(rule.priority) ||
        priorities.has(rule.priority) ||
        !uuid.test(rule.id) ||
        ids.has(rule.id)
      )
        fail(
          "AMBIGUOUS_RULE",
          path,
          "Rules require unique IDs and unique integer priorities.",
        );
      priorities.add(rule.priority);
      ids.add(rule.id);
      // A intentionally publishes three exact predicates. Compound fact policy is Increment C.
      const condition = rule.condition;
      const args =
        record(condition) && Object.keys(condition).length === 1
          ? condition["==="]
          : undefined;
      if (
        !Array.isArray(args) ||
        args.length !== 2 ||
        !record(args[0]) ||
        Object.keys(args[0]).length !== 1 ||
        args[0].var !== "request.requestedComplianceLevel" ||
        !levels.includes(args[1] as never)
      )
        fail(
          "UNDECLARED_FACT_OR_PREDICATE",
          `${path}.condition`,
          "A requires strict equality against the declared requirement fact.",
        );
      const result = parseProcessSelectionAction(
        rule.action,
        rule.actionConfig,
      );
      if (!result)
        fail(
          "UNSAFE_RESULT",
          path,
          "Only a typed require_workflow process profile result is allowed.",
        );
      else if (
        !manifests.some(
          (m) =>
            m.profile.code === result.profile.code &&
            same(m.profile, result.profile),
        )
      )
        fail(
          "MISSING_PROFILE",
          path,
          "Rule references no exact registered profile manifest.",
        );
    }
    if (definition.rules.length !== 3)
      fail(
        "INVALID_RULE_COUNT",
        "definition.rules",
        "All three requirement values need one rule each.",
      );
    for (const [i, level] of levels.entries()) {
      const matches = definition.rules.filter(
        (rule) =>
          ports.evaluator.evaluate(rule.condition, {
            request: { requestedComplianceLevel: level },
          }) === true,
      );
      if (matches.length !== 1) {
        fail(
          "AMBIGUOUS_OR_MISSING_ROUTE",
          `requirements.${level}`,
          "Exactly one matching rule is required.",
        );
        continue;
      }
      const result = parseProcessSelectionAction(
        matches[0]!.action,
        matches[0]!.actionConfig,
      );
      if (!result || result.profile.code !== profiles[i])
        fail(
          "INVALID_REQUIREMENT_MAPPING",
          `requirements.${level}`,
          "Basic/Standard/Enhanced must map to Simple/Standard/Enhanced before minimum controls.",
        );
      else mappings[level] = result.profile;
    }
    if (
      manifests.length !== 3 ||
      new Set(manifests.map((m) => m.profile.code)).size !== 3 ||
      manifests.some((m) => !profiles.includes(m.profile.code))
    )
      fail(
        "INVALID_PROFILE_CATALOG",
        "manifests",
        "All three distinct profile catalogs are required.",
      );
    for (const [i, manifest] of manifests.entries()) {
      const path = `manifests[${i}]`;
      if (
        manifest.schema !== "athyper.process-execution-manifest/1" ||
        !sameScope(scope, manifest.scope)
      )
        fail(
          "SCOPE_MISMATCH",
          path,
          "Manifest scope must exactly match selection scope.",
        );
      pin("manifest", manifest.revision, path);
      if (manifest.editPolicy !== undefined) {
        pin("edit_policy", manifest.editPolicy, `${path}.editPolicy`);
        if (!uuid.test(manifest.editPolicy.definitionId) || manifest.editPolicy.id !== manifest.editPolicy.definitionId ||
          !/^\d{4}-\d{2}-\d{2}$/.test(manifest.editPolicy.effectiveOn))
          fail("INVALID_EDIT_POLICY", `${path}.editPolicy`, "Edit policy requires an exact definition revision and eligibility date.");
      }
      pin("profile", manifest.profile, `${path}.profile`);
      pin("cycle", manifest.cycle, `${path}.cycle`);
      if (!uuid.test(manifest.cycle.cycleTypeId))
        fail("INVALID_CYCLE", path, "Cycle type identity is required.");
      if (processManifestHash(manifest) !== manifest.revision.hash)
        fail(
          "MANIFEST_HASH_MISMATCH",
          path,
          "Manifest content must match the pinned hash.",
        );
      const tasks = manifest.tasks;
      if (
        tasks.length !==
          { simple: 2, standard: 3, enhanced: 10 }[manifest.profile.code] ||
        new Set(tasks.map((t) => t.taskTemplateId)).size !== tasks.length ||
        new Set(tasks.map((t) => t.code)).size !== tasks.length
      )
        fail(
          "INVALID_TASK_CATALOG",
          path,
          "Distinct preparation and decision tasks are required.",
        );
      if (
        tasks.filter((t) => t.outcomeScope === "case_final_decision").length !==
          1 ||
        tasks.at(-1)?.outcomeScope !== "case_final_decision" ||
        tasks[0]?.executionKind !== "preparation"
      )
        fail(
          "UNSAFE_DECISION_AUTHORITY",
          path,
          "Only the last approval task may decide the case; preparation must come first.",
        );
      for (const [j, task] of tasks.entries()) {
        if (
          !uuid.test(task.taskTemplateId) ||
          !/^[A-Z][A-Z0-9_]{1,62}$/.test(task.code) ||
          task.predecessorTaskTemplateId !==
            (tasks[j - 1]?.taskTemplateId ?? null)
        )
          fail(
            "UNSAFE_TASK_ORDER",
            `${path}.tasks[${j}]`,
            "A tasks must form one sequential chain with exact template identities.",
          );
        if (
          (["review", "approval"].includes(task.executionKind) &&
            !task.requiredDocumentPurposes.includes("submitted_review_pack")) ||
          task.requiredDocumentPurposes.some(
            (p) => p !== "submitted_review_pack",
          ) ||
          new Set(task.requiredDocumentPurposes).size !==
            task.requiredDocumentPurposes.length
        )
          fail(
            "MISSING_DOCUMENT_GATE",
            path,
            "Review/approval tasks require the submitted review pack; later documents cannot precede the decision.",
          );
        if (task.executionKind === "preparation") {
          if (
            task.outcomeScope !== "task" ||
            !/^[a-z][a-z0-9_.-]{1,126}$/.test(task.commandCode)
          )
            fail(
              "INVALID_PREPARATION",
              path,
              "Preparation needs a task-only command binding.",
            );
        } else if (task.executionKind === "document") {
          if (
            task.outcomeScope !== "task" ||
            task.documentPurpose !== "submitted_review_pack" ||
            task.requiredDocumentPurposes.length
          )
            fail(
              "UNSAFE_DOCUMENT_TASK",
              path,
              "Review-pack generation must be task-owned and cannot depend on its own artifact.",
            );
        } else if (
          task.executionKind === "review" ||
          task.executionKind === "approval"
        ) {
          if (task.informationPolicy !== undefined && (
            !record(task.informationPolicy) || task.informationPolicy.schema !== "athyper.task-information-policy/1" ||
            !["elapsed", "bounded_pause"].includes(task.informationPolicy.clockMode) || !Number.isSafeInteger(task.informationPolicy.responseHours) ||
            task.informationPolicy.responseHours < 1 || task.informationPolicy.responseHours > 168 ||
            Object.keys(task.informationPolicy).some(k => !["clockMode","responseHours","schema","overdueSupervisorRole"].includes(k)) ||
            (task.informationPolicy.overdueSupervisorRole !== undefined && !/^[a-z][a-z0-9_.-]{1,126}$/.test(task.informationPolicy.overdueSupervisorRole))
          )) fail("UNSAFE_INFORMATION_POLICY", `${path}.tasks[${j}].informationPolicy`, "Information exchanges require a supported policy and a bounded response deadline.");
          if (task.escalationPolicy !== undefined && (
            !record(task.escalationPolicy) || task.escalationPolicy.schema !== "athyper.task-escalation-policy/1" ||
            !["notify", "consult", "reassign"].includes(task.escalationPolicy.mode) ||
            !/^[a-z][a-z0-9_.-]{1,126}$/.test(task.escalationPolicy.supervisorRole) ||
            (task.escalationPolicy.mode === "consult" ? (!Number.isSafeInteger(task.escalationPolicy.responseHours) || task.escalationPolicy.responseHours! < 1 || task.escalationPolicy.responseHours! > 168 || Object.keys(task.escalationPolicy).sort().join() !== "mode,responseHours,schema,supervisorRole") : Object.keys(task.escalationPolicy).sort().join() !== "mode,schema,supervisorRole")
          )) fail("UNSAFE_ESCALATION_POLICY", `${path}.tasks[${j}].escalationPolicy`, "Escalation requires a supported mode and explicit scoped supervisor role.");
          if (task.caseAuthority !== undefined && (
            !record(task.caseAuthority) ||
            task.caseAuthority.schema !== "athyper.task-case-authority/1" ||
            typeof task.caseAuthority.returnForChanges !== "boolean" ||
            typeof task.caseAuthority.rejectProposal !== "boolean" ||
            Object.keys(task.caseAuthority).sort().join() !== "rejectProposal,returnForChanges,schema"
          )) fail("UNSAFE_TASK_AUTHORITY", `${path}.tasks[${j}].caseAuthority`,
            "Task authority requires the supported schema and explicit boolean return/reject grants.");
          pin("workflow", task.workflow, `${path}.tasks[${j}].workflow`);
          pin(
            "reviewer_policy",
            task.reviewerPolicy,
            `${path}.tasks[${j}].reviewerPolicy`,
          );
          if (
            !uuid.test(task.workflow.definitionId) ||
            !task.workflow.code ||
            task.makerChecker !== true ||
            !["task", "case_final_decision"].includes(task.outcomeScope) ||
            (task.outcomeScope === "case_final_decision" &&
              task.executionKind !== "approval")
          )
            fail(
              "UNSAFE_WORKFLOW",
              path,
              "Workflow requires exact definition, reviewer policy, maker-checker and task/final-approval scope.",
            );
        } else
          fail(
            "INVALID_EXECUTION_KIND",
            path,
            "Unsupported task execution kind.",
          );
      }
      if (
        manifest.documents.length !== 3 ||
        new Set(manifest.documents.map((d) => d.purpose)).size !== 3
      )
        fail(
          "MISSING_DOCUMENT_PURPOSE",
          path,
          "Each of the three document purposes requires one binding.",
        );
      for (const doc of manifest.documents) {
        const n = purposes.indexOf(doc.purpose);
        if (
          n < 0 ||
          doc.source !==
            ["submitted_snapshot", "decision_snapshot", "result_snapshot"][n] ||
          doc.requiredBefore !==
            ["review_execution", "materialization", "cycle_completion"][n]
        )
          fail(
            "UNSAFE_DOCUMENT_GATE",
            path,
            "Document purpose, source and blocking step must agree.",
          );
        pin(
          "template",
          doc.template,
          `${path}.documents.${doc.purpose}.template`,
        );
        pin(
          "projection",
          doc.projection,
          `${path}.documents.${doc.purpose}.projection`,
        );
        pin(
          "recipient_policy",
          doc.recipientPolicy,
          `${path}.documents.${doc.purpose}.recipientPolicy`,
        );
        if (
          !uuid.test(doc.template.templateId) ||
          !uuid.test(doc.template.bindingId) ||
          !doc.template.locale ||
          !doc.template.variant ||
          !doc.projection.code
        )
          fail(
            "INVALID_DOCUMENT_BINDING",
            path,
            "Exact template binding, locale, variant and authorized projection are required.",
          );
      }
      if (
        new Set(manifest.mandatoryGateCodes).size !==
          manifest.mandatoryGateCodes.length ||
        manifest.mandatoryGateCodes.some(
          (g) => !/^[a-z][a-z0-9_.-]{1,126}$/.test(g),
        )
      )
        fail(
          "INVALID_MANDATORY_GATES",
          path,
          "Gate codes must be unique registered identifiers.",
        );
    }
    if (!publication.minimumControls.length)
      fail(
        "MISSING_MINIMUM_AUTHORITY",
        "minimumControls",
        "Publish an explicit owner-supplied minimum, even when it is Simple.",
      );
    for (const control of publication.minimumControls) {
      if (
        !sameScope(scope, control.scope) ||
        !profiles.includes(control.minimumProfile) ||
        !control.authority.owner
      )
        fail(
          "INVALID_MINIMUM_CONTROL",
          "minimumControls",
          "Minimum controls require exact scope and authority.",
        );
      pin("minimum_control", control.authority, "minimumControls.authority");
      for (const m of manifests.filter(
        (m) =>
          profiles.indexOf(m.profile.code) >=
          profiles.indexOf(control.minimumProfile),
      ))
        if (
          control.mandatoryGateCodes.some(
            (g) => !m.mandatoryGateCodes.includes(g),
          )
        )
          fail(
            "MINIMUM_CONTROL_WEAKENED",
            "minimumControls",
            "Every selectable effective profile must retain mandatory gates.",
          );
    }
  } catch {
    fail(
      "INVALID_PUBLICATION",
      "$",
      "Malformed publication or unsupported policy expression.",
    );
  }
  if (issues.length) return { valid: false, issues };
  for (const { kind, revision, path } of pins) {
    try {
      if (!(await ports.isPublished(kind, revision, publication.scope)))
        fail(
          "UNAVAILABLE_REVISION",
          path,
          "Exact published revision is unavailable in this scope.",
        );
    } catch {
      fail(
        "UNAVAILABLE_REVISION",
        path,
        "Revision authority could not verify this binding.",
      );
    }
  }
  return issues.length
    ? { valid: false, issues }
    : { valid: true, issues: [], publication, mappings };
}

export function parseProcessSelectionAction(
  action: unknown,
  config: unknown,
): ProcessSelectionAction | undefined {
  if (
    action !== "require_workflow" ||
    !record(config) ||
    Object.keys(config).sort().join() !== "profile,schema" ||
    config.schema !== "athyper.process-selection-result/1" ||
    !record(config.profile)
  )
    return undefined;
  const p = config.profile;
  if (
    Object.keys(p).sort().join() !== "code,hash,id,version" ||
    !profiles.includes(p.code as never) ||
    !exact(p as unknown as ProcessRevision)
  )
    return undefined;
  return config as unknown as ProcessSelectionAction;
}

export function processManifestHash(
  manifest: import("@athyper/server-contract-control-admin").ProcessExecutionManifest,
): string {
  const stable = (v: unknown): string =>
    Array.isArray(v)
      ? `[${v.map(stable).join(",")}]`
      : v && typeof v === "object"
        ? `{${Object.entries(v)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`)
            .join(",")}}`
        : JSON.stringify(v);
  return createHash("sha256")
    .update(
      stable({
        ...manifest,
        revision: {
          id: manifest.revision.id,
          version: manifest.revision.version,
        },
      }),
    )
    .digest("hex");
}
