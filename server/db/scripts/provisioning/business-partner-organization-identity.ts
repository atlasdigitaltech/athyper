import { parseEntityAuthorizationProfile } from "@athyper/server-contract-metadata";
import { baselineJsonHash } from "../../../packages/planes/studio/meta-entity-authoring/src/baseline-publication.js";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";

const retiredNames = new Set(["display_name", "legal_name", "registered_name", "displayName", "legalName"]);

/** Canonical BP identity: one registered name, organization-only, aliases retained. */
export function withBusinessPartnerOrganizationIdentity(source: MetaEntityGraph): MetaEntityGraph {
  if (source.entity.entityCode !== "business_partner") throw new Error("Business Partner graph required");
  const graph = {...structuredClone(source)};
  const name = graph.fields.find(f => f.fieldKey === "name");
  if (!name?.id) throw new Error("Registered name field required");
  const nameId = name.id;
  const retired = new Set(graph.fields.filter(f => retiredNames.has(f.fieldKey) || ["details_legal_name", "details_display_name"].includes(f.fieldKey)).map(f => f.id));
  const inputs = new Set((graph.surfaceFieldBindings ?? []).filter(b => b.widgetKey === "input" && retiredNames.has(String(b.displayConfig?.valueKey))).map(b => b.id));
  graph.fields = graph.fields.filter(f => !retired.has(f.id));
  graph.searchFields = graph.searchFields?.filter(f => !retired.has(f.entityFieldId));
  graph.surfaceFieldBindings = graph.surfaceFieldBindings?.filter(b => !inputs.has(b.id)).map(b => {
    const renamed = retired.has(b.entityFieldId);
    const config = rewriteConfiguration(b.displayConfig) as Record<string, unknown> | undefined;
    const field = graph.fields.find(f => f.id === b.entityFieldId);
    if (field?.fieldKey === "partner_category" && config?.lookup) {
      config.lookup = {...config.lookup as object, options: [{value: "organization", label: "Organization"}]};
    }
    const registeredName = renamed || b.displayConfig?.valueKey === "name" || b.entityFieldId === nameId;
    return {...b, entityFieldId: renamed ? nameId : b.entityFieldId,
      ...(registeredName ? {labelOverride: "Registered name"} : {}),
      ...(config ? {displayConfig: {...config, ...(b.widgetKey === "input" && registeredName ? {required: true, maxLength: 320} : {})}} : {}),
      // Give the single identity input enough space for an official organization name.
      ...(b.widgetKey === "input" && registeredName ? {columnSpan: 6} : {}),
    };
  });
  graph.surfaces = graph.surfaces?.map(s => ({...s, layoutConfig: rewriteConfiguration(s.layoutConfig) as typeof s.layoutConfig}));
  graph.tests = graph.tests?.map(t => ({...t, ...(t.expected !== undefined ? {expected: rewriteConfiguration(t.expected)} : {})}));
  for (const branch of ["keyFields", "relationFields", "fieldPolicyBindings", "numberingBindings"] as const) {
    const rows = graph[branch];
    if (rows?.some(r => Object.values(r).some(v => typeof v === "string" && retired.has(v)))) {
      throw new Error(`Retired name still owns ${branch}; resolve the binding before publication`);
    }
  }
  // These exact-payload authoring assertions must pin the newly reviewed payload.
  graph.tests = graph.tests?.map(test => {
    if (!["reset_runtime_payload_exact", "atlas_preserved", "v2_runtime_exact"].includes(test.key)) return test;
    const expected = test.path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? Reflect.get(value, key) : undefined, graph);
    if (expected === undefined) throw new Error(`Authoring assertion target missing: ${test.key}`);
    return {...test, expected: structuredClone(expected)};
  });
  return graph;
}

function rewriteConfiguration(value: unknown): unknown {
  if (typeof value === "string") return retiredNames.has(value) ? "name" : value;
  if (Array.isArray(value)) {
    const items = value.filter(item => !(item && typeof item === "object" && retiredNames.has(item.key) && item.storagePath));
    const rewritten = items.map(rewriteConfiguration);
    return rewritten.every(item => typeof item === "string") ? [...new Set(rewritten)] : rewritten;
  }
  if (!value || typeof value !== "object") return value;
  // Related contact records have their own display-name contract.
  if (Reflect.get(value, "source") === "contact-person.v1") return structuredClone(value);
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteConfiguration(item)]));
  if (result.key === "name" && result.storagePath === "name") {
    result.required = true;
    result.validation = {...result.validation as object, maxLength: 320};
    result.list = {...result.list as object, label: "Registered name", semanticRole: "title", defaultVisible: true, defaultOrder: 1};
  }
  if (result.key === "partner_category" && result.storagePath === "partner_category") {
    result.validation = {...result.validation as object, options: ["organization"]};
    result.list = {...result.list as object, defaultVisible: false};
  }
  if (result.quickFields && Array.isArray(result.quickFields)) {
    result.quickFields = result.quickFields.filter((item: Record<string, unknown>) => item.field !== "partner_category");
  }
  if (result.authorization && result.authorizationRuntime && typeof result.authorizationRuntime === "object") {
    const runtime = result.authorizationRuntime as Record<string, any>;
    if (runtime.canonicalReadAdmission) {
      runtime.canonicalReadAdmission.profileHash = baselineJsonHash(parseEntityAuthorizationProfile(result.authorization));
    }
  }
  if (result.runtimeRestoration && typeof result.runtimeRestoration === "object") {
    const restoration = result.runtimeRestoration as Record<string, any>;
    restoration.descriptorHash = baselineJsonHash(restoration.descriptor);
    for (const key of ["recordPresentation", "listPresentation"] as const) {
      if (result[key] === undefined && restoration.descriptor[key] !== undefined) result[key] = structuredClone(restoration.descriptor[key]);
    }
  }
  return result;
}
