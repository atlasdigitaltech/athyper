import { describe, expect, it, vi } from "vitest";
import {
  compareCapturedCollection,
  type CollectionComparisonAuthorization,
} from "../snapshots/collection-comparison.js";
import {
  parseCollectionCapture,
  type CollectionCapture,
} from "../snapshots/collection-capture.js";

const definition = {
  key: "addresses",
  sourceEntity: "address_link",
  sourceContract: "contract-1",
  scope: "all-active-links.v1",
  identityField: "id",
  targetField: "target",
  fields: [
    { key: "id", comparison: "json" },
    { key: "target", comparison: "json" },
    { key: "street", comparison: "json" },
    { key: "secret", comparison: "json" },
  ],
} as const;
function capture(
  records: CollectionCapture["records"],
  extra: Partial<CollectionCapture> = {},
): CollectionCapture {
  return {
    schema: "athyper.collection-capture/1",
    subject: {
      tenantId: "tenant",
      plane: "neon",
      entityCode: "partner",
      recordId: "parent",
    },
    definition,
    coverage: "complete",
    consistency: "root_transaction",
    capturedAt: "2026-09-28T10:00:00Z",
    records,
    ...extra,
  };
}
const row = (id: string, street = "Street", target = "target-1") => ({
  id,
  target,
  street,
  secret: "hidden",
});
function access(
  extra: Partial<CollectionComparisonAuthorization> = {},
): CollectionComparisonAuthorization {
  return {
    discoverable: true,
    membership: "complete",
    label: "Addresses",
    fields: [{ key: "street", label: "Street" }],
    authorizeRecord: vi.fn(async () => ({
      readable: true,
      fields: ["street"],
      targetReadable: true,
    })),
    ...extra,
  };
}
const compare = (
  before: CollectionCapture,
  after: CollectionCapture,
  authorization = access(),
) =>
  compareCapturedCollection({
    before,
    after,
    authorization,
    subject: capture([]).subject,
    definition: before.definition,
  });

describe("collection identity and coverage", () => {
  it("classifies added, removed, updated and replaced links without exposing protected data", async () => {
    const result = await compare(
      capture([row("update"), row("remove"), row("replace")]),
      capture([
        row("update", "New street"),
        row("add"),
        row("replace", "Other street", "target-2"),
      ]),
    );
    expect(result?.counts).toEqual({
      added: 1,
      removed: 1,
      updated: 1,
      replaced: 1,
      unchanged: 0,
    });
    expect(result?.items.find((i) => i.id === "remove")).toMatchObject({
      afterPresence: "absent",
    });
    expect(result?.items.find((i) => i.id === "replace")).toMatchObject({
      valueComparison: "different_target",
      fields: [{ changed: false }],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /hidden|secret|target-1|target-2|contract-1|tenant/,
    );
  });
  it("keeps a one-record collection as a collection and ignores incidental reorder", async () => {
    const one = await compare(capture([row("a")]), capture([row("a")]));
    expect(one?.items).toHaveLength(1);
    expect(one?.counts.unchanged).toBe(1);
    const result = await compare(
      capture([row("b"), row("a")]),
      capture([row("a"), row("b")]),
    );
    expect(result?.counts.unchanged).toBe(2);
    expect(result?.items.map((i) => i.id)).toEqual(["a", "b"]);
  });
  it.each(["partial", "unknown", "not_captured"] as const)(
    "does not infer addition/removal with %s coverage",
    async (coverage) => {
      const before = capture(
        coverage === "not_captured" ? [] : [row("old"), row("same")],
        { coverage },
      );
      const result = await compare(
        before,
        capture([row("new"), row("same", "Changed")]),
      );
      expect(result?.counts.added).toBe(0);
      expect(result?.counts.removed).toBe(0);
      expect(result?.notes).toContain("incomplete_capture");
      expect(result?.items.find((i) => i.id === "new")).toMatchObject({
        change: "uncomparable",
        beforePresence: "unknown",
      });
      if (coverage !== "not_captured") expect(result?.counts.updated).toBe(1);
    },
  );
  it("does not treat a missing field as cleared, empty, or changed", async () => {
    const result = await compare(
      capture([{ id: "a", target: "t" }]),
      capture([{ id: "a", target: "t", street: null }]),
    );
    expect(result?.items[0]).toMatchObject({
      change: "uncomparable",
      fields: [
        {
          before: { state: "uncaptured" },
          after: { state: "value", value: null },
          changed: false,
        },
      ],
    });
    expect(result?.notes).toContain("incomplete_capture");
  });
  it("rejects duplicate or missing identities and oversized captures", () => {
    expect(() => parseCollectionCapture(capture([row("a"), row("a")]))).toThrow(
      "DUPLICATE_IDENTITY",
    );
    expect(() => parseCollectionCapture(capture([{ target: "t" }]))).toThrow();
    expect(() =>
      parseCollectionCapture(capture([row("a"), row("b")]), 1),
    ).toThrow();
    expect(() =>
      parseCollectionCapture(capture([row("a")], { coverage: "not_captured" })),
    ).toThrow();
  });
  it("rejects crossing tenant, plane, parent or collection identity", async () => {
    for (const field of [
      "tenantId",
      "plane",
      "entityCode",
      "recordId",
    ] as const) {
      const a = capture([row("a")]);
      await expect(
        compare(a, { ...a, subject: { ...a.subject, [field]: "other" } }),
      ).rejects.toThrow("SUBJECT_MISMATCH");
    }
    const a = capture([]);
    await expect(
      compare(a, { ...a, definition: { ...definition, key: "other" } }),
    ).rejects.toThrow("SUBJECT_MISMATCH");
  });
  it("returns a limitation for incompatible schema or scope; field declaration order is immaterial", async () => {
    for (const field of ["sourceContract", "sourceEntity", "scope"] as const) {
      const result = await compare(
        capture([row("a")]),
        capture([row("a")], {
          definition: { ...definition, [field]: "other" },
        }),
      );
      expect(result?.items).toEqual([]);
      expect(result?.notes).toEqual(["incompatible_scope"]);
    }
    const result = await compare(
      capture([row("a")]),
      capture([row("a")], {
        definition: { ...definition, fields: [...definition.fields].reverse() },
      }),
    );
    expect(result?.counts.unchanged).toBe(1);
  });
  it("labels independently captured sources without claiming root atomicity", async () => {
    expect(
      (await compare(capture([]), capture([], { consistency: "independent" })))
        ?.notes,
    ).toContain("independent_sources");
  });
});

describe("current authorization", () => {
  it("omits an undiscoverable section without inspecting its hidden payload", async () => {
    expect(
      await compareCapturedCollection({
        subject: capture([]).subject,
        definition,
        before: {},
        after: {},
        authorization: access({ discoverable: false }),
      }),
    ).toBeNull();
  });
  it("filters hidden rows before output and never uses a restricted scope to infer membership changes", async () => {
    const auth = access({
      membership: "restricted",
      authorizeRecord: async ({ id }) => ({
        readable: id !== "hidden-row",
        fields: ["street"],
        targetReadable: true,
      }),
    });
    const result = await compare(
      capture([row("a"), row("hidden-row")]),
      capture([row("b"), row("hidden-row")]),
      auth,
    );
    expect(result?.counts.added).toBe(0);
    expect(result?.counts.removed).toBe(0);
    expect(result?.items).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain("hidden-row");
    expect(result?.notes).toEqual(["restricted_scope"]);
  });
  it("fails closed if an adapter claims full membership while denying a row", async () => {
    await expect(
      compare(
        capture([row("a")]),
        capture([]),
        access({
          authorizeRecord: async () => ({
            readable: false,
            fields: [],
            targetReadable: false,
          }),
        }),
      ),
    ).rejects.toThrow("AUTHORIZATION_INCONSISTENT");
  });
  it("cannot infer target replacement or expose target identity without target access", async () => {
    const auth = access({
      fields: [
        { key: "target", label: "Target" },
        { key: "street", label: "Street" },
      ],
      authorizeRecord: async () => ({
        readable: true,
        fields: ["target", "street"],
        targetReadable: false,
      }),
    });
    const result = await compare(
      capture([row("a")]),
      capture([row("a", "Changed", "target-2")]),
      auth,
    );
    expect(result?.items[0]).toMatchObject({
      change: "uncomparable",
      valueComparison: "unavailable",
      fields: [{ key: "street", changed: false }],
    });
    expect(JSON.stringify(result)).not.toContain("target-2");
  });
});

it("compares purchase-order quantity strings exactly and never uses line number as identity", async () => {
  const d: CollectionCapture["definition"] = {
    key: "lines",
    sourceEntity: "order_line",
    sourceContract: "v1",
    scope: "all-lines",
    identityField: "id",
    fields: [
      { key: "id", comparison: "json" },
      { key: "quantity", comparison: "decimal" },
      { key: "position", comparison: "json" },
    ],
  };
  const a = capture(
    [{ id: "stable-line", quantity: "12345678901234567890.00", position: 1 }],
    { definition: d },
  );
  const auth = access({
    fields: [
      { key: "quantity", label: "Quantity" },
      { key: "position", label: "Line number" },
    ],
    authorizeRecord: async () => ({
      readable: true,
      fields: ["quantity", "position"],
      targetReadable: false,
    }),
  });
  const same = await compare(
    a,
    capture(
      [{ id: "stable-line", quantity: "12345678901234567890", position: 1 }],
      { definition: d },
    ),
    auth,
  );
  expect(same?.counts.unchanged).toBe(1);
  const different = await compare(
    a,
    capture(
      [{ id: "stable-line", quantity: "12345678901234567890.01", position: 2 }],
      { definition: d },
    ),
    auth,
  );
  expect(different?.counts.updated).toBe(1);
  expect(different?.counts.added).toBe(0);
  expect(different?.counts.removed).toBe(0);
});

it("rejects two mutually matching foreign captures against the admitted subject", async () => {
  const foreign = capture([], {
    subject: { ...capture([]).subject, tenantId: "foreign" },
  });
  await expect(
    compareCapturedCollection({
      before: foreign,
      after: foreign,
      subject: capture([]).subject,
      definition,
      authorization: access(),
    }),
  ).rejects.toThrow("SUBJECT_MISMATCH");
});
it("requires compatibility with the admitted definition, not just between two old captures", async () => {
  const old = capture([row("a")]);
  const result = await compareCapturedCollection({
    before: old,
    after: old,
    subject: old.subject,
    definition: { ...definition, sourceContract: "current" },
    authorization: access(),
  });
  expect(result?.items).toEqual([]);
  expect(result?.notes).toEqual(["incompatible_scope"]);
});

it("inherits parent capture time only for transactional sources", () => {
  const root = capture([]);
  delete (root as { capturedAt?: string }).capturedAt;
  expect(parseCollectionCapture(root).capturedAt).toBeUndefined();
  expect(() =>
    parseCollectionCapture({ ...root, consistency: "independent" }),
  ).toThrow();
  expect(() =>
    parseCollectionCapture({ ...root, consistency: "consistent_read" }),
  ).toThrow();
});
it("rejects non-finite or imprecise decimal numbers instead of rounding them", () => {
  const definition = {
    key: "lines",
    sourceEntity: "line",
    sourceContract: "v1",
    scope: "all",
    identityField: "id",
    fields: [
      { key: "id", comparison: "json" as const },
      { key: "quantity", comparison: "decimal" as const },
    ],
  };
  for (const quantity of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    9007199254740992,
    1.2345,
  ])
    expect(() =>
      parseCollectionCapture(capture([{ id: "a", quantity }], { definition })),
    ).toThrow();
  expect(
    parseCollectionCapture(
      capture([{ id: "a", quantity: "1.2345" }], { definition }),
    ).records,
  ).toHaveLength(1);
});

it("projects only currently authorized record labels and field formats, matching by identity", async () => {
  const result=await compare(capture([row("one"),row("two"),row("hidden")]),capture([row("two","New"),row("one","New"),row("hidden")]),access({
    membership:"restricted",
    fields:[{key:"street",label:"Street",format:{kind:"enum",options:[{value:"New",label:"New street"}]}},{key:"secret",label:"Hidden",format:{kind:"date"}}],
    authorizeRecord:async({id})=>({readable:id!=="hidden",label:id==="hidden"?"Forbidden label":"Same display label",fields:["street"],targetReadable:true}),
  }));
  expect(result?.items.map(item=>item.id)).toEqual(["one","two"]);
  expect(result?.items.every(item=>item.label==="Same display label")).toBe(true);
  expect(result?.items[0]?.fields[0]?.format).toEqual({kind:"enum",options:[{value:"New",label:"New street"}]});
  expect(JSON.stringify(result)).not.toMatch(/Forbidden label|Hidden|secret/);
});
