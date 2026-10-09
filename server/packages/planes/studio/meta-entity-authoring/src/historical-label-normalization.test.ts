import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  compileSharedReferenceProduct,
  parseSharedReferenceProduct,
} from "./authoring/product.js";
import { prepareHistoricalLabelNormalization } from "./historical-label-normalization.js";
import { applyLabelCommands } from "./label-command-reducer.js";
import { canonicalJson, sha256 } from "./deterministic.js";
const policy = {
  supportedLocales: ["en", "fr"],
  maxCommands: 1000,
  maxBatchBytes: 1000000,
};
const id = (i: number) =>
  "00000000-0000-4000-8000-" + String(i).padStart(12, "0");
function source(name = "country") {
  return compileSharedReferenceProduct(
    parseSharedReferenceProduct(
      JSON.parse(
        readFileSync(
          new URL(
            "../../../../../../metadata/entities/common/reference/" +
              name +
              "/definition.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    ),
    "studio",
  ).graph;
}
function input(s: ReturnType<typeof source>) {
  return {
    sourceHash: sha256(s),
    revision: 1,
    idempotencyKey: "historical-label-normalization-test",
    defaultLocale: "en",
    requiredLocales: ["en"],
  };
}
it.each(["country", "state_region"])(
  "prepares %s through existing typed commands with explicit source coverage",
  (name) => {
    const s = source(name),
      before = sha256(s),
      p = prepareHistoricalLabelNormalization(s, input(s), policy);
    let n = 10;
    const saved = applyLabelCommands(
      null,
      p.batch,
      {
        entityId: id(1),
        changeSetId: id(2),
        tenantId: null,
        supportedLocales: ["en"],
      },
      () => id(n++),
    );
    expect(saved.graph.labels.length).toBe(p.bindings.length);
    expect(p.bindings.length).toBeGreaterThan(0);
    for (const binding of p.bindings) {
      expect(saved.identities[binding.tempRef]).toBeDefined();
      expect(binding.sourcePaths.length).toBeGreaterThan(0);
    }
    expect(sha256(s)).toBe(before);
    expect(prepareHistoricalLabelNormalization(s, input(s), policy)).toEqual(p);
  },
);
it("rejects stale sources, unsupported locales and over-budget batches", () => {
  const s = source();
  expect(() =>
    prepareHistoricalLabelNormalization(
      s,
      { ...input(s), sourceHash: "0".repeat(64) },
      policy,
    ),
  ).toThrow("LEGACY_LABEL_SOURCE_MISMATCH");
  expect(() =>
    prepareHistoricalLabelNormalization(
      s,
      { ...input(s), requiredLocales: ["en", "de"] },
      policy,
    ),
  ).toThrow("LEGACY_LABEL_LOCALE_INVALID");
  expect(() =>
    prepareHistoricalLabelNormalization(s, input(s), {
      ...policy,
      maxCommands: 1,
    }),
  ).toThrow("AUTHORING_COMMAND_LIMIT");
});
it("rejects conflicting repeated keys and preserves supplied translations", () => {
  const s = source();
  const a = {
    labelKey: "test.label",
    defaultText: "Name",
    defaultLocale: "en",
    values: { en: "Name", fr: "Nom" },
  };
  // Existing JSON declaration location, not a new writable storage bag.
  s.surfaces![0]!.layoutConfig = { a, b: { ...a } };
  const p = prepareHistoricalLabelNormalization(s, input(s), policy);
  expect(
    p.batch.commands.some(
      (c) =>
        c.kind === "addMember" &&
        c.memberKind === "labelTranslation" &&
        c.value.text === "Nom",
    ),
  ).toBe(true);
  s.surfaces![0]!.layoutConfig = {
    a,
    b: { ...a, defaultText: "Other", values: { en: "Other", fr: "Nom" } },
  };
  expect(() =>
    prepareHistoricalLabelNormalization(s, input(s), policy),
  ).toThrow("LEGACY_LABEL_KEY_CONFLICT");
});
it("requires explicit mappings for unlocalized legacy text and rejects stale mappings", () => {
  const s = source();
  s.surfaces = [];
  // Remove nested declaration families for this isolated legacy case.
  const plain = {
    contractSchema: "athyper.meta-entity-contract/2.1",
    fields: [{ label: "Country" }],
  } as unknown as ReturnType<typeof source>;
  expect(() =>
    prepareHistoricalLabelNormalization(plain, input(plain), policy),
  ).toThrow("LEGACY_LABEL_DECLARATIONS_REQUIRED");
  const declarations = [
    {
      sourcePath: "/fields/0/label",
      labelKey: "entity.reference.field",
      defaultText: "Country",
    },
  ];
  const result = prepareHistoricalLabelNormalization(
    plain,
    { ...input(plain), declarations },
    policy,
  );
  expect(result.bindings).toEqual([
    {
      labelKey: "entity.reference.field",
      tempRef: "label_0",
      sourcePaths: ["/fields/0/label"],
    },
  ]);
  for (const changed of [
    { ...declarations[0]!, defaultText: "Changed" },
    { ...declarations[0]!, sourcePath: "/fields/1/label" },
  ])
    expect(() =>
      prepareHistoricalLabelNormalization(
        plain,
        { ...input(plain), declarations: [changed] },
        policy,
      ),
    ).toThrow();
  expect(() =>
    prepareHistoricalLabelNormalization(
      plain,
      { ...input(plain), declarations: [...declarations, ...declarations] },
      policy,
    ),
  ).toThrow("LEGACY_LABEL_MAPPING_PATH_INVALID");
});

it("replays explicit member references across canonical history ordering without guessing from text", () => {
  const first = {
    id: "00000000-0000-4000-8000-000000000002",
    fieldKey: "z",
    label: "Last",
  };
  const second = {
    id: "00000000-0000-4000-8000-000000000001",
    fieldKey: "a",
    label: "First",
  };
  const graph = {
    contractSchema: "athyper.meta-entity-contract/2.1",
    fields: [first, second],
  } as unknown as ReturnType<typeof source>;
  const history = JSON.parse(canonicalJson(graph));
  expect(history.fields[0].id).not.toBe(first.id);
  const declaration = {
    sourcePath: "/fields/0/label",
    sourceMemberId: first.id,
    labelKey: "field.last",
    defaultText: "Last",
  };
  const request = { ...input(graph), declarations: [declaration] };
  expect(prepareHistoricalLabelNormalization(history, request, policy)).toEqual(
    prepareHistoricalLabelNormalization(graph, request, policy),
  );
  expect(() =>
    prepareHistoricalLabelNormalization(
      history,
      {
        ...request,
        declarations: [
          declaration,
          { ...declaration, sourcePath: "/fields/1/label" },
        ],
      },
      policy,
    ),
  ).toThrow("LEGACY_LABEL_MAPPING_PATH_INVALID");
  for (const sourceMemberId of [
    second.id,
    "00000000-0000-4000-8000-000000000003",
    "invalid",
  ]) {
    expect(() =>
      prepareHistoricalLabelNormalization(
        history,
        { ...request, declarations: [{ ...declaration, sourceMemberId }] },
        policy,
      ),
    ).toThrow();
  }
});
