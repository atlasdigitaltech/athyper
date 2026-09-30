export type AtlasEvaluationState =
  | "evaluated_pass"
  | "evaluated_fail"
  | "not_evaluated"
  | "definition_unavailable"
  | "provider_unavailable"
  | "restricted";
export interface AtlasInsightScope {
  readonly entityCode: string;
  readonly fingerprint: string;
  readonly role?: string;
  readonly companyCodeId?: string;
  readonly operatingOrganizationId?: string;
}
export interface AtlasInsightCoverage {
  readonly target: "selection" | "visible_page" | "filtered_set" | "record";
  readonly state: "complete" | "partial" | "unavailable";
  readonly evaluatedCount?: number;
  readonly authorizedTotalCount?: number;
}
export interface AtlasInsightEvidence {
  readonly id: string;
  readonly entityCode: string;
  readonly recordId: string;
  readonly descriptorRevision: string;
  readonly sourceRevision: string;
  readonly sourceRevisionKind: "record_version" | "projected_content_hash";
  readonly observedAt: string;
  readonly ruleVersion?: string;
}
export interface AtlasInsightAction {
  readonly id: string;
  /** Registry capability identifier, never a route or executable model argument. */
  readonly actionId: string;
  readonly evidenceIds: readonly string[];
}
export interface AtlasInsightFinding {
  readonly id: string;
  readonly code: string;
  readonly severity: "info" | "warning" | "blocker";
  readonly state: Exclude<AtlasEvaluationState, "restricted">;
  readonly facts: Readonly<Record<string, string | number | boolean | null>>;
  readonly ruleVersion: string;
  readonly evidenceIds: readonly string[];
  readonly actionIds: readonly string[];
}
export interface AtlasInsightResult {
  readonly schemaVersion: 1;
  readonly scope: AtlasInsightScope;
  readonly coverage: AtlasInsightCoverage;
  readonly evaluatedAt: string;
  readonly freshness: "current" | "stale";
  readonly findings: readonly AtlasInsightFinding[];
  readonly evidence: readonly AtlasInsightEvidence[];
  readonly actions: readonly AtlasInsightAction[];
}

/** Exact, bounded transport validation; protected diagnostics/URLs cannot ride along. */
export function parseAtlasInsightResult(value: unknown): AtlasInsightResult {
  const fail = (): never => {
    throw new TypeError("Invalid Atlas insight result.");
  };
  const obj = (
    v: unknown,
    keys: readonly string[],
  ): Record<string, unknown> => {
    if (
      !v ||
      typeof v !== "object" ||
      Array.isArray(v) ||
      Object.keys(v).some((k) => !keys.includes(k))
    )
      fail();
    return v as Record<string, unknown>;
  };
  const str = (v: unknown): void => {
    if (typeof v !== "string" || !v.trim() || v.length > 2048) fail();
  };
  const date = (v: unknown): void => {
    str(v);
    if (!Number.isFinite(Date.parse(v as string))) fail();
  };
  const one = (v: unknown, allowed: readonly unknown[]): void => {
    if (!allowed.includes(v)) fail();
  };
  const arr = (v: unknown): unknown[] => {
    if (!Array.isArray(v) || v.length > 100) fail();
    return v as unknown[];
  };
  const refs = (v: unknown, ids: Set<unknown>): void => {
    const items = arr(v);
    if (new Set(items).size !== items.length) fail();
    for (const id of items) if (!ids.has(id)) fail();
  };
  const root = obj(value, [
    "schemaVersion",
    "scope",
    "coverage",
    "evaluatedAt",
    "freshness",
    "findings",
    "evidence",
    "actions",
  ]);
  one(root.schemaVersion, [1]);
  date(root.evaluatedAt);
  one(root.freshness, ["current", "stale"]);
  const scope = obj(root.scope, [
    "entityCode",
    "fingerprint",
    "role",
    "companyCodeId",
    "operatingOrganizationId",
  ]);
  str(scope.entityCode);
  str(scope.fingerprint);
  for (const k of ["role", "companyCodeId", "operatingOrganizationId"])
    if (scope[k] !== undefined) str(scope[k]);
  const coverage = obj(root.coverage, [
    "target",
    "state",
    "evaluatedCount",
    "authorizedTotalCount",
  ]);
  one(coverage.target, ["selection", "visible_page", "filtered_set", "record"]);
  one(coverage.state, ["complete", "partial", "unavailable"]);
  for (const k of ["evaluatedCount", "authorizedTotalCount"])
    if (
      coverage[k] !== undefined &&
      (!Number.isSafeInteger(coverage[k]) || (coverage[k] as number) < 0)
    )
      fail();
  if (
    coverage.evaluatedCount !== undefined &&
    coverage.authorizedTotalCount !== undefined &&
    (coverage.evaluatedCount as number) >
      (coverage.authorizedTotalCount as number)
  )
    fail();
  const evidence = arr(root.evidence).map((v) =>
    obj(v, [
      "id",
      "entityCode",
      "recordId",
      "descriptorRevision",
      "sourceRevision",
      "sourceRevisionKind",
      "observedAt",
      "ruleVersion",
    ]),
  );
  for (const e of evidence) {
    for (const k of [
      "id",
      "entityCode",
      "recordId",
      "descriptorRevision",
      "sourceRevision",
    ])
      str(e[k]);
    date(e.observedAt);
    one(e.sourceRevisionKind, ["record_version", "projected_content_hash"]);
    if (e.ruleVersion !== undefined) str(e.ruleVersion);
  }
  const ids = (items: Record<string, unknown>[]): Set<unknown> => {
    const values = new Set(items.map((i) => i.id));
    if (values.size !== items.length) fail();
    return values;
  };
  const evidenceIds = ids(evidence);
  const actions = arr(root.actions).map((v) =>
    obj(v, ["id", "actionId", "evidenceIds"]),
  );
  for (const a of actions) {
    str(a.id);
    str(a.actionId);
    refs(a.evidenceIds, evidenceIds);
  }
  const actionIds = ids(actions);
  const findings = arr(root.findings).map((v) =>
    obj(v, [
      "id",
      "code",
      "severity",
      "state",
      "facts",
      "ruleVersion",
      "evidenceIds",
      "actionIds",
    ]),
  );
  ids(findings);
  for (const f of findings) {
    for (const k of ["id", "code", "ruleVersion"]) str(f[k]);
    one(f.severity, ["info", "warning", "blocker"]);
    one(f.state, [
      "evaluated_pass",
      "evaluated_fail",
      "not_evaluated",
      "definition_unavailable",
      "provider_unavailable",
    ]);
    if (
      !f.facts ||
      typeof f.facts !== "object" ||
      Array.isArray(f.facts) ||
      Object.keys(f.facts).length > 32
    )
      fail();
    for (const [key, fact] of Object.entries(f.facts as object)) {
      str(key);
      if (typeof fact === "string") str(fact);
      else if (
        fact !== null &&
        typeof fact !== "boolean" &&
        !(typeof fact === "number" && Number.isFinite(fact))
      )
        fail();
    }
    refs(f.evidenceIds, evidenceIds);
    refs(f.actionIds, actionIds);
  }
  if (new TextEncoder().encode(JSON.stringify(value)).length > 65536) fail();
  // Detached value: owner/model mutations after validation cannot change the disclosure.
  return JSON.parse(JSON.stringify(value)) as AtlasInsightResult;
}
