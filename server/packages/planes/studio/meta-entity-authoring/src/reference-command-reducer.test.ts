import { describe, it, expect } from "vitest";
import {
  emptyReferenceMembers,
  parseReferenceMembers,
  parseReferenceCommands,
  referenceCommandSchema,
} from "@athyper/server-contract-meta-entity-authoring";
import { applyReferenceCommands } from "./reference-command-reducer.js";
import {
  referenceFixture,
  referenceFixtureAnchors as anchors,
  fixtureId as id,
  referencePayload,
} from "./reference-command.fixtures.js";
const policy = {
  maxCommands: 100,
  maxBatchBytes: 64000,
  maxMembers: 200,
  maxPredicateDepth: 16,
};
const batch = (commands: unknown[]) =>
  parseReferenceCommands(
    {
      contract: "entity.authoring-reference-commands/1",
      expectedRevision: 1,
      idempotencyKey: "reference-fixture-0001",
      commands,
    },
    policy,
  );
describe("closed reference member commands", () => {
  it("rejects a second root even with a distinct key and position", () => {
    const g = referenceFixture();
    const root = {
      ...g.members.predicate[0]!,
      id: id(34),
      predicateKey: "second",
      position: 2,
    };
    expect(() =>
      parseReferenceMembers(
        {
          ...g,
          members: { ...g.members, predicate: [...g.members.predicate, root] },
        },
        anchors,
      ),
    ).toThrow("REFERENCE_PREDICATE_ROOT_CONFLICT");
  });
  it("requires explicit acyclic group parents within the depth budget", () => {
    const g = referenceFixture();
    const root = {
      ...referencePayload("predicate", {
        predicateKey: "group",
        nodeKind: "group",
        conjunction: "all",
        purpose: "list_filter",
        viewId: id(23),
      }),
      id: id(29),
    };
    const child = {
      ...referencePayload("predicate", {
        predicateKey: "child",
        nodeKind: "condition",
        parentPredicateId: id(29),
        entityFieldId: id(2),
        operator: "eq",
        valueKind: "text",
        valueText: "value",
      }),
      id: id(34),
    };
    const graph = { ...g, members: { ...g.members, predicate: [root, child] } };
    expect(() => parseReferenceMembers(graph, anchors)).not.toThrow();
    expect(() =>
      parseReferenceMembers(graph, { ...anchors, maxPredicateDepth: 1 }),
    ).toThrow("REFERENCE_PREDICATE_CYCLE_DEPTH");
  });

  it("validates every selected member and exact local ownership", () => {
    const graph = referenceFixture();
    expect(parseReferenceMembers(graph, anchors)).toEqual(graph);
    expect(() =>
      parseReferenceMembers(graph, {
        ...anchors,
        tables: { ...anchors.tables, entity_label: [] },
      }),
    ).toThrow("REFERENCE_FOREIGN_MEMBER");
  });
  it("supports forward references with stable typed temporary identities", () => {
    const commands = Object.entries(referenceFixture().members).map(
      ([memberKind, rows]) => {
        const { id: rowId, ...value } = rows[0]!;
        return {
          kind: "addMember",
          memberKind,
          tempRef: memberKind.toLowerCase(),
          value: Object.fromEntries(
            Object.entries(value).map(([p, v]) => [
              p,
              v === id(23) ? { $tempRef: "surfaceview" } : v,
            ]),
          ),
        };
      },
    );
    let n = 40;
    const result = applyReferenceCommands(
      emptyReferenceMembers(),
      batch(commands),
      anchors,
      () => id(n++),
    );
    expect(result.graph.members.surfaceViewField[0]?.viewId).toBe(
      result.identities.surfaceview,
    );
    expect(result.graph.members.predicate[0]?.viewId).toBe(
      result.identities.surfaceview,
    );
  });
  it("rejects cascaded removals, undeclared target planes and UUID presentation", () => {
    const graph = referenceFixture();
    expect(() =>
      applyReferenceCommands(
        graph,
        batch([
          { kind: "removeMember", memberKind: "surfaceView", id: id(23) },
        ]),
        anchors,
        () => id(40),
      ),
    ).toThrow("REFERENCE_FOREIGN_MEMBER");
    expect(() =>
      applyReferenceCommands(
        graph,
        batch([
          {
            kind: "updateMember",
            memberKind: "fieldAccess",
            id: id(28),
            set: { targetPlane: "neon" },
            clear: [],
          },
        ]),
        anchors,
        () => id(40),
      ),
    ).toThrow("REFERENCE_TARGET_UNDECLARED");
    const bad = {
      ...graph,
      members: {
        ...graph.members,
        surfaceViewField: [
          { ...graph.members.surfaceViewField[0]!, fieldBindingId: id(9) },
        ],
      },
    };
    expect(() => parseReferenceMembers(bad, anchors)).toThrow(
      "REFERENCE_UUID_PRESENTATION_FORBIDDEN",
    );
  });
  it("allows multiple null optional positions and per-owner predicate roots", () => {
    const g = referenceFixture();
    const extra = {
      id: id(31),
      ...referencePayload("surfaceViewField", {
        viewId: id(23),
        fieldBindingId: id(9),
        sortPosition: 1,
        sortDirection: "asc",
      }),
    };
    const view = {
      ...g.members.surfaceView[0]!,
      id: id(32),
      viewKey: "other",
      viewKind: "published" as const,
      position: 2,
    };
    const root = {
      ...g.members.predicate[0]!,
      id: id(33),
      predicateKey: "other",
      viewId: id(32),
    };
    expect(() =>
      parseReferenceMembers(
        {
          ...g,
          members: {
            ...g.members,
            surfaceView: [...g.members.surfaceView, view],
            surfaceViewField: [...g.members.surfaceViewField, extra],
            predicate: [...g.members.predicate, root],
          },
        },
        anchors,
      ),
    ).not.toThrow();
  });
  it("rejects mixed typed payloads and invalid owners", () => {
    const g = referenceFixture();
    for (const set of [
      { valueNumeric: "1" },
      { conjunction: "all" },
      { viewId: null },
      { operator: "in" },
    ])
      expect(() =>
        applyReferenceCommands(
          g,
          batch([
            {
              kind: "updateMember",
              memberKind: "predicate",
              id: id(29),
              set,
              clear: [],
            },
          ]),
          anchors,
          () => id(40),
        ),
      ).toThrow();
  });
  it("rejects unknown members, invalid immutable edits, and incomplete ordering", () => {
    expect(() =>
      batch([
        {
          kind: "addMember",
          memberKind: "not_defined",
          tempRef: "x",
          value: {},
        },
      ]),
    ).toThrow("REFERENCE_MEMBER_UNSUPPORTED");
    expect(() =>
      applyReferenceCommands(
        referenceFixture(),
        batch([
          {
            kind: "updateMember",
            memberKind: "surfaceView",
            id: id(23),
            set: { viewKey: "other" },
            clear: [],
          },
        ]),
        anchors,
        () => id(40),
      ),
    ).toThrow("REFERENCE_REMAP_REQUIRED");
    expect(() =>
      applyReferenceCommands(
        referenceFixture(),
        batch([
          {
            kind: "reorderMembers",
            memberKind: "target",
            scope: {},
            ids: [id(99)],
          },
        ]),
        anchors,
        () => id(40),
      ),
    ).toThrow("REFERENCE_REORDER_INCOMPLETE");
  });
  it("generates all command variants including typed temporary references", () => {
    const schema = JSON.stringify(referenceCommandSchema());
    for (const variant of [
      "reserveFieldIdentity",
      "reorderMembers",
      "$tempRef",
    ])
      expect(schema).toContain(variant);
  });
});

it.each(["string", "bigint"])(
  "validates retained predicates against native %s fields without accepting mismatched payloads",
  (type) => {
    const graph = referenceFixture();
    const original = graph.members.predicate[0]!;
    const predicate = {
      ...original,
      entityFieldId: id(2),
      operator: type === "bigint" ? "gte" : "eq",
      valueKind: type === "bigint" ? "numeric" : "text",
      valueText: type === "string" ? "value" : null,
      valueNumeric: type === "bigint" ? "9007199254740993" : null,
    };
    const context = {
      ...anchors,
      tables: {
        ...anchors.tables,
        entity_field: anchors.tables.entity_field!.map((f) =>
          f.id === id(2) ? { ...f, data_type: type } : f,
        ),
      },
    };
    const value = {
      ...graph,
      members: { ...graph.members, fieldChoice: [], predicate: [predicate] },
    };
    expect(() => parseReferenceMembers(value, context)).not.toThrow();
    expect(() =>
      parseReferenceMembers(
        {
          ...value,
          members: {
            ...value.members,
            predicate: [
              {
                ...predicate,
                valueKind: "boolean",
                valueText: null,
                valueNumeric: null,
                valueBoolean: true,
              },
            ],
          },
        },
        context,
      ),
    ).toThrow("REFERENCE_PREDICATE_TYPE_INVALID");
  },
);
