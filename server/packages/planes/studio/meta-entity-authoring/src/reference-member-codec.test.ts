import { describe, expect, it } from "vitest";
import type { ReferenceFieldIdentity } from "@athyper/server-contract-meta-entity-authoring";
import {
  decodeReferenceMembers,
  encodeReferenceMembers,
  type ReferenceMemberCodecContext,
} from "./reference-member-codec.js";
import {
  fixtureId,
  referenceFixture,
  referenceFixtureAnchors,
} from "./reference-command.fixtures.js";
import { sha256 } from "./deterministic.js";
const identity: ReferenceFieldIdentity = {
  id: fixtureId(90),
  entityId: fixtureId(91),
  tenantId: fixtureId(92),
  fieldKey: "status",
  parentIdentityId: null,
  identityStatus: "reserved",
  introducedChangeSetId: fixtureId(1),
  firstReleaseId: null,
  retiredAt: null,
  retiredBy: null,
  retirementReleaseId: null,
  replacementIdentityId: null,
  createdAt: "2026-10-06T00:00:00Z",
  createdBy: fixtureId(93),
};
const context: ReferenceMemberCodecContext = {
  entityId: identity.entityId,
  tenantId: identity.tenantId,
  revision: 7,
  authoringSchemaHash: "a".repeat(64),
  anchors: referenceFixtureAnchors,
  identities: [identity],
  maximumBytes: 100_000,
};
const mutate = (packet: string, work: (value: any) => void): string => {
  const value = JSON.parse(packet);
  work(value);
  return JSON.stringify(value);
};
describe("selected reference member portable codec", () => {
  it("round-trips every registered member family, IDs, positions and catalogue provenance", () => {
    const graph = referenceFixture();
    const packet = encodeReferenceMembers(graph, context);
    expect(decodeReferenceMembers(packet, context)).toEqual({
      graph,
      identities: [identity],
    });
    expect(
      encodeReferenceMembers(
        decodeReferenceMembers(packet, context).graph,
        context,
      ),
    ).toBe(packet);
  });
  it("rejects wrong entity/tenant/draft/revision, descriptor or anchor evidence", () => {
    const packet = encodeReferenceMembers(referenceFixture(), context);
    for (const changed of [
      { ...context, entityId: fixtureId(99), identities: [] },
      { ...context, tenantId: fixtureId(99), identities: [] },
      {
        ...context,
        anchors: { ...context.anchors, changeSetId: fixtureId(99) },
      },
      { ...context, revision: 8 },
      { ...context, authoringSchemaHash: "b".repeat(64) },
      {
        ...context,
        anchors: {
          ...context.anchors,
          tables: { ...context.anchors.tables, entity_label: [] },
        },
      },
    ]) {
      expect(() => decodeReferenceMembers(packet, changed)).toThrow();
    }
  });
  it("rejects undeclared properties, absent families and unsupported source conventions", () => {
    const packet = encodeReferenceMembers(referenceFixture(), context);
    for (const work of [
      (v: any) => {
        v.extra = true;
      },
      (v: any) => {
        v.schema = "legacy";
      },
      (v: any) => {
        v.positionConvention = "zero-based";
      },
      (v: any) => {
        delete v.graph.members.target;
      },
      (v: any) => {
        v.graph.members.target[0].extra = true;
      },
    ]) {
      expect(() =>
        decodeReferenceMembers(mutate(packet, work), context),
      ).toThrow();
    }
  });
  it("does not let a portable package restore or mutate service-owned identity evidence", () => {
    const packet = encodeReferenceMembers(referenceFixture(), context);
    expect(() =>
      decodeReferenceMembers(
        mutate(packet, (value) => {
          value.identities[0].createdBy = fixtureId(99);
        }),
        context,
      ),
    ).toThrow("REFERENCE_PACKAGE_IDENTITY_AUTHORITY_MISMATCH");
    expect(() =>
      decodeReferenceMembers(
        mutate(packet, (value) => {
          value.identities = [];
        }),
        context,
      ),
    ).toThrow("REFERENCE_PACKAGE_IDENTITY_AUTHORITY_MISMATCH");
  });
  it("preserves high precision numeric strings without number coercion", () => {
    const graph = referenceFixture();
    const predicate = {
      ...graph.members.predicate[0]!,
      valueKind: "numeric" as const,
      valueText: null,
      valueNumeric: "9007199254740993.123456789012345678901",
    };
    const anchors = {
      ...context.anchors,
      tables: {
        ...context.anchors.tables,
        entity_field: [
          { id: fixtureId(2), data_type: "decimal" },
          ...context.anchors.tables.entity_field!.slice(1),
        ],
      },
    };
    // The enum choice is removed explicitly because this numeric fixture changes
    // the trusted anchor type; the codec never rewrites it as a hidden no-op.
    const numericGraph = {
      ...graph,
      members: { ...graph.members, fieldChoice: [], predicate: [predicate] },
    };
    const packet = encodeReferenceMembers(numericGraph, {
      ...context,
      anchors,
    });
    expect(
      decodeReferenceMembers(packet, { ...context, anchors }).graph.members
        .predicate[0]!.valueNumeric,
    ).toBe(predicate.valueNumeric);
  });
  it("preserves a UTC microsecond timestamp without date coercion", () => {
    const graph = referenceFixture();
    const valueDatetime = "2026-10-06T00:00:00.123456Z";
    const anchors = {
      ...context.anchors,
      tables: {
        ...context.anchors.tables,
        entity_field: [
          { id: fixtureId(2), data_type: "datetime" },
          ...context.anchors.tables.entity_field!.slice(1),
        ],
      },
    };
    const selected = {
      ...graph,
      members: {
        ...graph.members,
        fieldChoice: [],
        predicate: [
          {
            ...graph.members.predicate[0]!,
            valueKind: "datetime" as const,
            valueText: null,
            valueDatetime,
          },
        ],
      },
    };
    const packet = encodeReferenceMembers(selected, { ...context, anchors });
    expect(
      decodeReferenceMembers(packet, { ...context, anchors }).graph.members
        .predicate[0]!.valueDatetime,
    ).toBe(valueDatetime);
  });
  it("rejects tampered graph hashes and foreign local operation references even when rehashed", () => {
    const packet = encodeReferenceMembers(referenceFixture(), context);
    expect(() =>
      decodeReferenceMembers(
        mutate(packet, (value) => {
          value.graph.members.navigationGroup[0].groupKey = "changed";
        }),
        context,
      ),
    ).toThrow("REFERENCE_PACKAGE_GRAPH_HASH_MISMATCH");
    expect(() =>
      decodeReferenceMembers(
        mutate(packet, (value) => {
          value.graph.members.fieldAccess[0].readOperationChangeSetId =
            fixtureId(99);
          value.graphHash = sha256(value.graph);
        }),
        context,
      ),
    ).toThrow();
  });
  it("enforces host-supplied byte bounds and rejects malformed JSON", () => {
    const packet = encodeReferenceMembers(referenceFixture(), context);
    expect(() =>
      encodeReferenceMembers(referenceFixture(), {
        ...context,
        maximumBytes: 10,
      }),
    ).toThrow("REFERENCE_PACKAGE_LIMIT");
    expect(() =>
      decodeReferenceMembers(packet, { ...context, maximumBytes: 10 }),
    ).toThrow("REFERENCE_PACKAGE_LIMIT");
    expect(() => decodeReferenceMembers("{", context)).toThrow(
      "REFERENCE_PACKAGE_JSON_INVALID",
    );
  });
});
