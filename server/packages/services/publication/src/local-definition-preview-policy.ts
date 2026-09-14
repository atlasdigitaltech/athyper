/** Changes with implemented runtime consumers. Authorization declarations are not UI metadata. */
import type { BusinessPartnerDefinitionBundleV1 } from "@athyper/server-contract-publication";

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const fail = (path: string[]) => {
  throw new Error(`LOCAL_PREVIEW_UNSUPPORTED_CHANGE:${path.join(".")}`);
};
const text = new Set([
  "label",
  "title",
  "description",
  "helpText",
  "placeholder",
  "submitLabel",
  "addLabel",
]);

export function assertPresentationChange(
  before: unknown,
  after: unknown,
  path: string[] = [],
): void {
  if (canonical(before) === canonical(after)) return;
  const key = path.at(-1) ?? "";
  if (
    text.has(key) &&
    (before === undefined || typeof before === "string") &&
    typeof after === "string" &&
    after.trim().length > 0 &&
    after.length <= 2000
  )
    return;
  if (
    key === "columnSpan" &&
    Number.isInteger(after) &&
    Number(after) >= 1 &&
    Number(after) <= 12
  )
    return;
  if (
    key === "widget" &&
    ["text", "textarea"].includes(String(before)) &&
    ["text", "textarea"].includes(String(after))
  )
    return;
  // Reordering declared sections/fields/options changes layout, not their bindings or values.
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) fail(path);
    if (!["sections", "fields", "columns", "panels", "options"].includes(key)) {
      before.forEach((value, index) =>
        assertPresentationChange(value, after[index], [...path, String(index)]),
      );
      return;
    }
    const identity = (value: unknown) =>
      typeof value === "string"
        ? value
        : record(value)
          ? String(value.key ?? value.code ?? value.value ?? "")
          : "";
    const prior = new Map(before.map((value) => [identity(value), value]));
    if (
      prior.size !== before.length ||
      prior.has("") ||
      new Set(after.map(identity)).size !== after.length
    )
      fail(path);
    for (const value of after) {
      const id = identity(value);
      if (!prior.has(id)) fail([...path, id]);
      assertPresentationChange(prior.get(id), value, [...path, id]);
    }
    return;
  }
  if (!record(before) || !record(after)) fail(path);
  const a = before as Record<string, unknown>,
    b = after as Record<string, unknown>;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
    assertPresentationChange(a[key], b[key], [...path, key]);
}

export function assessLocalDefinitionChange(
  before: BusinessPartnerDefinitionBundleV1,
  after: BusinessPartnerDefinitionBundleV1,
) {
  const changes: string[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = (before as unknown as Record<string, unknown>)[key],
      b = (after as unknown as Record<string, unknown>)[key];
    if (canonical(a) === canonical(b) || key === "semanticVersion") continue;
    if (key === "formDescriptors" || key === "viewDescriptors")
      assertPresentationChange(a, b, [key]);
    else if (key === "workflowDefinitions") {
      if (
        !record(a) ||
        !record(b) ||
        canonical(Object.keys(a).sort()) !== canonical(Object.keys(b).sort())
      )
        fail([key]);
      for (const journey of Object.keys(a as object)) {
        const prior = (a as Record<string, unknown>)[journey],
          next = (b as Record<string, unknown>)[journey];
        if (!record(prior) || !record(next)) fail([key, journey]);
        // Stages are executed by the native workflow resolver. SoD, permissions,
        // approver resolution and any other declarations must stay unchanged.
        const withoutStages = (value: Record<string, unknown>) =>
          Object.fromEntries(
            Object.entries(value).filter(([k]) => k !== "stages"),
          );
        if (
          canonical(withoutStages(prior as Record<string, unknown>)) !==
          canonical(withoutStages(next as Record<string, unknown>))
        )
          fail([key, journey]);
        validatePreviewStages((next as Record<string, unknown>).stages);
      }
    } else if (key === "requestSchemas") {
      if (
        !record(a) ||
        !record(b) ||
        canonical(Object.keys(a).sort()) !== canonical(Object.keys(b).sort())
      )
        fail([key]);
      for (const name of Object.keys(a as object)) {
        const prior = (a as Record<string, any>)[name],
          next = (b as Record<string, any>)[name];
        if (!record(prior) || !record(next)) fail([key, name]);
        const withoutSources = (value: Record<string, unknown>) =>
          Object.fromEntries(
            Object.entries(value).filter(([k]) => k !== "supportedSources"),
          );
        if (
          canonical(withoutSources(prior)) !== canonical(withoutSources(next))
        )
          fail([key, name]);
        const sources = next.supportedSources;
        if (
          !Array.isArray(sources) ||
          sources.length === 0 ||
          new Set(sources).size !== sources.length ||
          sources.some(
            (source) =>
              !Array.isArray(prior.supportedSources) ||
              !prior.supportedSources.includes(source),
          )
        )
          fail([key, name, "supportedSources"]);
      }
    } else fail([key]);
    changes.push(key);
  }
  return {
    changedSections: changes.sort(),
    operational: changes.some((key) =>
      ["requestSchemas", "workflowDefinitions"].includes(key),
    ),
  };
}

export function validatePreviewStages(value: unknown): void {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20)
    fail(["workflowDefinitions", "stages"]);
  const stages = value as unknown[];
  const codes = new Set();
  for (const raw of stages) {
    if (!record(raw)) fail(["workflowDefinitions", "stage"]);
    const stage = raw as Record<string, any>;
    const allowed = [
      "code",
      "name",
      "mode",
      "quorum",
      "slaMinutes",
      "remindersAtMinutes",
      "escalateAtMinutes",
      "when",
      "noSelfApproval",
    ];
    if (
      stage.noSelfApproval !== true ||
      Object.keys(stage).some((key) => !allowed.includes(key)) ||
      typeof stage.code !== "string" ||
      !/^[A-Za-z][A-Za-z0-9_.-]{0,62}$/.test(stage.code) ||
      codes.has(stage.code) ||
      typeof stage.name !== "string" ||
      !stage.name.trim() ||
      !["serial", "parallel"].includes(stage.mode)
    )
      fail(["workflowDefinitions", "stage"]);
    codes.add(stage.code);
    const quorum = stage.quorum;
    if (
      !record(quorum) ||
      !["all", "any", "count", "percentage"].includes(String(quorum.kind)) ||
      Object.keys(quorum).some((key) => !["kind", "value"].includes(key)) ||
      (quorum.kind === "count" &&
        (!Number.isInteger(quorum.value) || Number(quorum.value) < 1)) ||
      (quorum.kind === "percentage" &&
        (typeof quorum.value !== "number" ||
          !Number.isFinite(quorum.value) ||
          quorum.value <= 0 ||
          quorum.value > 100))
    )
      fail(["workflowDefinitions", "quorum"]);
    for (const key of ["slaMinutes", "escalateAtMinutes"])
      if (
        stage[key] !== undefined &&
        (!Number.isSafeInteger(stage[key]) || stage[key] < 1)
      )
        fail(["workflowDefinitions", key]);
    if (
      stage.remindersAtMinutes !== undefined &&
      (!Array.isArray(stage.remindersAtMinutes) ||
        stage.remindersAtMinutes.some(
          (n: unknown) => !Number.isSafeInteger(n) || Number(n) < 1,
        ))
    )
      fail(["workflowDefinitions", "remindersAtMinutes"]);
    if (stage.when !== undefined) {
      const condition = stage.when;
      if (
        !record(condition) ||
        Object.keys(condition).some(
          (key) => !["path", "field", "operator", "value"].includes(key),
        ) ||
        typeof (condition.path ?? condition.field) !== "string" ||
        !String(condition.path ?? condition.field).trim() ||
        !["equals", "not_equals", "in", "exists"].includes(
          String(condition.operator),
        ) ||
        (condition.operator === "in" && !Array.isArray(condition.value))
      )
        fail(["workflowDefinitions", "when"]);
    }
  }
  if (!stages.some((stage) => record(stage) && stage.when === undefined))
    fail(["workflowDefinitions", "unconditionalStageRequired"]);
}
