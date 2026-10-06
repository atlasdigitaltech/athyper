import { expect, it } from "vitest";
import {
  parseLabelCommands,
  type LabelCommandBatch,
} from "@athyper/server-contract-meta-entity-authoring";
import { applyLabelCommands } from "./label-command-reducer.js";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context = {
  entityId: id(1),
  changeSetId: id(2),
  tenantId: null,
  supportedLocales: ["en", "ms"],
};
const policy = {
  supportedLocales: ["en", "ms"],
  maxCommands: 20,
  maxBatchBytes: 8000,
};
const batch = (commands: unknown): LabelCommandBatch =>
  parseLabelCommands(
    {
      contract: "entity.authoring-label-commands/1",
      expectedRevision: 0,
      idempotencyKey: "fixture-command-0001",
      commands,
    },
    policy,
  );
const settings = {
  kind: "updateMember",
  memberKind: "labelSettings",
  set: { defaultLocale: "en", requiredLocales: ["en", "ms"] },
};
const label = {
  kind: "addMember",
  memberKind: "label",
  tempRef: "name",
  value: { labelKey: "reference.name", defaultText: "Name" },
};
const translation = {
  kind: "addMember",
  memberKind: "labelTranslation",
  tempRef: "translation",
  value: { label: { $tempRef: "name" }, localeCode: "ms", text: "Nama" },
};
it("resolves a typed forward label reference and retains IDs across edits/rename", () => {
  let n = 10;
  const first = applyLabelCommands(
    null,
    batch([settings, translation, label]),
    context,
    () => id(n++),
  );
  const next = applyLabelCommands(
    first.graph,
    batch([
      {
        kind: "renameDraftMember",
        memberKind: "label",
        member: { id: first.identities.name },
        labelKey: "reference.title",
      },
      {
        kind: "updateMember",
        memberKind: "label",
        member: { id: first.identities.name },
        set: { defaultText: "Title" },
      },
    ]),
    context,
    () => {
      throw Error("No new allocation");
    },
  );
  expect(next.graph.labels[0]).toMatchObject({
    id: first.identities.name,
    labelKey: "reference.title",
    defaultText: "Title",
  });
  expect(next.graph.translations[0]?.labelId).toBe(first.identities.name);
  expect(first.graph.labels[0]?.labelKey).toBe("reference.name");
});
it("rejects implicit dependent removal and accepts explicit child+parent removal", () => {
  let n = 10;
  const first = applyLabelCommands(
    null,
    batch([settings, label, translation]),
    context,
    () => id(n++),
  );
  const remove = {
    kind: "removeMember",
    memberKind: "label",
    member: { id: first.identities.name },
  };
  expect(() =>
    applyLabelCommands(first.graph, batch([remove]), context, () => id(99)),
  ).toThrow("FOUNDATION_REFERENCE_INVALID");
  const next = applyLabelCommands(
    first.graph,
    batch([
      remove,
      {
        kind: "removeMember",
        memberKind: "labelTranslation",
        member: { id: first.identities.translation },
      },
    ]),
    context,
    () => id(99),
  );
  expect(next.graph.labels).toEqual([]);
  expect(next.graph.translations).toEqual([]);
});
it.each([
  [settings, label, label],
  [
    settings,
    {
      ...translation,
      value: { ...translation.value, label: { $tempRef: "missing" } },
    },
    label,
  ],
  [
    settings,
    {
      ...translation,
      value: { ...translation.value, label: { $tempRef: "translation" } },
    },
    label,
  ],
  [
    settings,
    { kind: "removeMember", memberKind: "label", member: { id: id(99) } },
  ],
])(
  "rejects duplicate, unknown, wrong-kind or foreign references",
  (commands) => {
    let n = 10;
    expect(() =>
      applyLabelCommands(null, batch(commands), context, () => id(n++)),
    ).toThrow();
  },
);
it("rejects unregistered members, controls, property clears and oversized batches", () => {
  for (const command of [
    { ...label, memberKind: "operation" },
    { ...label, value: { ...label.value, requiresMfa: false } },
    {
      kind: "updateMember",
      memberKind: "label",
      member: { id: id(3) },
      clear: ["defaultText"],
      set: {},
    },
  ])
    expect(() => batch([command])).toThrow();
  expect(() =>
    parseLabelCommands({ commands: [] }, { ...policy, maxCommands: 0 }),
  ).toThrow("AUTHORING_BUDGET_REQUIRED");
  expect(() =>
    parseLabelCommands({ description: "x".repeat(9000) }, policy),
  ).toThrow("AUTHORING_BATCH_LIMIT");
});

it("versions normalized snapshots and blocks legacy whole-entity compilation", async () => {
  const { validateGraph, compileGraph } = await import("./deterministic.js");
  let n = 10;
  const { graph: ownedLabels } = applyLabelCommands(
    null,
    batch([settings, label, translation]),
    context,
    () => id(n++),
  );
  const graph = {
    contractSchema: "athyper.meta-entity-contract/2.2" as const,
    entity: { entityCode: "fixture_reference" },
    fields: [],
    operations: [],
    ownedLabels,
  };
  expect(
    validateGraph({
      ...graph,
      contractSchema: "athyper.meta-entity-contract/2.1",
    }).issues,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "CONTRACT_SCHEMA_INVALID" }),
    ]),
  );
  expect(() => compileGraph(graph)).toThrow(
    "NORMALIZED_LABEL_PUBLICATION_NOT_QUALIFIED",
  );
});
