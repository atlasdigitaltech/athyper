import { createHash } from "node:crypto";
import { assertCommonReferenceGraph } from "@athyper/server-contract-metadata";
import {
  parseDevPublicationPolicy, parseDevPublicationTarget, parseDevPublicationAssessment,
  type DevPublicationAssessment, type DevReviewReason,
} from "@athyper/server-contract-publication";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Row = { [key: string]: Json };
const object = (v: Json | undefined): Row | undefined => v !== null && typeof v === "object" && !Array.isArray(v) ? v : undefined;
const objects = (v: Json | undefined): Row[] => Array.isArray(v) && v.every(item => object(item)) ? v as Row[] : [];

/** Explicit assessment hash format. Does not replace any published release hash. */
function canonical(value: unknown, depth = 0): string {
  if (depth > 64) throw new TypeError("DEV_ASSESSMENT_JSON_DEPTH");
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new TypeError("DEV_ASSESSMENT_JSON_ARRAY");
    return `[${value.map(item => canonical(item, depth + 1)).join(",")}]`;
  }
  if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError("DEV_ASSESSMENT_JSON_SYMBOL");
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map(key => {
      if (["__proto__", "prototype", "constructor"].includes(key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(row, key) ?? {}, "value")) throw new TypeError("DEV_ASSESSMENT_JSON_PROPERTY");
      return `${JSON.stringify(key)}:${canonical(row[key], depth + 1)}`;
    }).join(",")}}`;
  }
  throw new TypeError("DEV_ASSESSMENT_JSON_REQUIRED");
}
const hash = (text: string) => `sha256:${createHash("sha256").update(text).digest("hex")}`;
const equal = (a: Json | undefined, b: Json | undefined) => a === undefined || b === undefined ? a === b : canonical(a) === canonical(b);
const pointer = (key: string) => key.replaceAll("~", "~0").replaceAll("/", "~1");
function diff(a: Json | undefined, b: Json | undefined, path = ""): string[] {
  if (equal(a, b)) return [];
  if (Array.isArray(a) && Array.isArray(b)) return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => diff(a[i], b[i], `${path}/${i}`)).flat();
  const left = object(a), right = object(b);
  if (left && right) return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().flatMap(key => diff(left[key], right[key], `${path}/${pointer(key)}`));
  return [path];
}

export interface ClassifyDevPublicationChangeInput {
  readonly policy: unknown;
  /** Full persisted MetaEntity graph; an omitted baseline never enrolls a first release. */
  readonly baseline: unknown;
  readonly candidate: unknown;
  readonly target: unknown;
  readonly initiatingPrincipalId: string;
  readonly assessorId: string;
  /** Supplied by the caller for deterministic assessments; not a trusted clock proof. */
  readonly assessedAt: string;
}

/** Pure assessment only: no DB, auth provider, signing, environment lookup or activation.
 * Eligibility is conditional on the supplied baseline/policy and is NOT proof that
 * either was approved. Future authorization must independently establish that fact.
 */
export function classifyDevPublicationChange(input: ClassifyDevPublicationChangeInput): DevPublicationAssessment {
  const policy = parseDevPublicationPolicy(input.policy), target = parseDevPublicationTarget(input.target);
  const candidateText = canonical(input.candidate);
  const baselineText = input.baseline === null || input.baseline === undefined ? null : canonical(input.baseline);
  const candidate = JSON.parse(candidateText) as Json;
  const baseline = baselineText === null ? undefined : JSON.parse(baselineText) as Json;
  const reasons = new Set<DevReviewReason>();
  if (!policy.targets.some(t => t.tenantId === target.tenantId && t.plane === target.plane && t.entityCode === target.entityCode)) reasons.add("TARGET_NOT_ENROLLED");
  if (baseline === undefined) reasons.add("BASELINE_REQUIRED");
  for (const graph of baseline === undefined ? [candidate] : [baseline, candidate]) {
    if (object(graph)?.contractSchema !== "athyper.meta-entity-contract/2.1") reasons.add("REFERENCE_SHAPE_INVALID");
    try { assertCommonReferenceGraph(graph, target.plane); }
    catch { reasons.add("REFERENCE_SHAPE_INVALID"); }
    if (object(object(graph)?.entity)?.entityCode !== target.entityCode) reasons.add("TARGET_MISMATCH");
  }
  const changedPaths = baseline === undefined ? [] : diff(baseline, candidate);
  if (baseline !== undefined && !reasons.has("REFERENCE_SHAPE_INVALID") && !reasons.has("TARGET_MISMATCH")) {
    const left = object(baseline)!, right = object(candidate)!;
    const label = (a: Row, b: Row, key: string) => {
      if (equal(a[key], b[key]) || !policy.allowedChanges.includes("labels")) return;
      const valid = (v: Json | undefined) => typeof v === "string" && v.trim().length > 0 && v.length <= policy.maxLabelLength && !/[\x00-\x1f\x7f<>{}]/.test(v);
      if (valid(a[key]) && valid(b[key])) b[key] = a[key]!;
      else reasons.add("INVALID_PRESENTATION");
    };
    // Row identity/order remains fixed; adding/removing/reordering declarations is
    // unsupported. Only visible list binding positions may be permuted below.
    for (const branch of ["fields", "surfaces", "surfaceFieldBindings"]) {
      const before = objects(left[branch]), after = objects(right[branch]);
      if (before.length !== after.length) continue;
      before.forEach((a, index) => {
        const b = after[index]!;
        const identity = branch === "surfaceFieldBindings" ? "bindingKey" : "id";
        if (typeof a[identity] !== "string" || a[identity] !== b[identity]) return;
        label(a, b, branch === "fields" ? "label" : branch === "surfaces" ? "title" : "labelOverride");
      });
    }
    const surfaces = objects(left.surfaces), nextSurfaces = objects(right.surfaces);
    if (surfaces.length === nextSurfaces.length) surfaces.forEach((surface, index) => {
      const next = nextSurfaces[index]!;
      if (surface.surfaceKind !== "list" || next.surfaceKind !== "list" || typeof surface.id !== "string" || surface.id !== next.id) return;
      const layout = object(surface.layoutConfig), nextLayout = object(next.layoutConfig);
      const limits = object(layout?.limits), nextLimits = object(nextLayout?.limits);
      if (limits && nextLimits && !equal(limits.defaultPageSize, nextLimits.defaultPageSize) && policy.allowedChanges.includes("page_size")) {
        const allowed = limits.allowedPageSizes;
        if (Array.isArray(allowed) && allowed.length && allowed.every(n => Number.isSafeInteger(n) && Number(n) > 0 && Number(n) <= 1000)
          && allowed.includes(limits.defaultPageSize!) && allowed.includes(nextLimits.defaultPageSize!)) nextLimits.defaultPageSize = limits.defaultPageSize!;
        else reasons.add("INVALID_PRESENTATION");
      }
      const state = object(layout?.defaultState), nextState = object(nextLayout?.defaultState);
      if (state && nextState && !equal(state.sort, nextState.sort) && policy.allowedChanges.includes("default_sort")) {
        const fields = objects(left.fields).filter(f => f.status !== "deprecated").map(f => f.fieldKey);
        const sortable = objects(object(layout?.authorization)?.fieldPolicies).filter(p => Array.isArray(p.queryUses) && p.queryUses.includes("sort")).flatMap(p => Array.isArray(p.fields) ? p.fields : []);
        const max = limits?.maxSortLevels;
        const validSort = (sort: Json | undefined) => Array.isArray(sort) && sort.length > 0 && Number.isSafeInteger(max) && Number(max) > 0 && sort.length <= Number(max)
          && sort.every(item => { const row = object(item); return row && typeof row.field === "string" && Object.keys(row).sort().join(",") === "direction,field" && fields.includes(row.field) && sortable.includes(row.field) && (row.direction === "asc" || row.direction === "desc"); })
          && new Set(sort.map(item => object(item)!.field)).size === sort.length;
        if (validSort(state.sort) && validSort(nextState.sort)) nextState.sort = state.sort!;
        else reasons.add("INVALID_PRESENTATION");
      }
      if (policy.allowedChanges.includes("visible_column_order")) {
        const before = objects(left.surfaceFieldBindings).filter(b => b.entitySurfaceId === surface.id && object(b.displayConfig)?.defaultVisible === true);
        const after = objects(right.surfaceFieldBindings).filter(b => b.entitySurfaceId === surface.id && object(b.displayConfig)?.defaultVisible === true);
        if (before.length === after.length && before.length && before.every((b, i) => typeof b.bindingKey === "string" && b.bindingKey === after[i]!.bindingKey)) {
          const oldPositions = before.map(b => b.position), positions = after.map(b => b.position);
          if (oldPositions.every(n => Number.isSafeInteger(n) && Number(n) >= 0) && new Set(oldPositions).size === before.length
            && positions.every(n => oldPositions.includes(n)) && new Set(positions).size === after.length) after.forEach((b, i) => { b.position = before[i]!.position!; });
        }
      }
    });
    // Compare the ENTIRE graph after neutralizing only proven allowed changes.
    if (!equal(baseline, candidate)) reasons.add("UNSUPPORTED_CHANGE");
  }
  return parseDevPublicationAssessment({
    schema: "athyper.dev-publication-assessment/1", authority: "none", hashSchema: "dev-assessment-json/1",
    policyId: policy.policyId, policyRevision: policy.revision,
    policyHash: hash(canonical(policy)), candidateHash: hash(candidateText), baselineHash: baselineText === null ? null : hash(baselineText),
    target, initiatingPrincipalId: input.initiatingPrincipalId, assessorId: input.assessorId, assessedAt: input.assessedAt,
    outcome: reasons.size ? "review_required" : "eligible", reasons: [...reasons].sort(), changedPaths,
  });
}
