import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntityListDescriptorV1, ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import { recordCardLayout, RECORD_CARD_BODY_LIMIT } from "../../packages/platform/entity/runtime/list-view/src/record-card-layout";
import { listWidthTier } from "../../packages/platform/entity/runtime/list-view/src/presentation-tier";

const field = (key: string, options: Partial<ListFieldDescriptorV1> = {}): ListFieldDescriptorV1 => ({ key, label: key, valueKind: "string", defaultVisible: true, defaultOrder: 0, filterOperators: [], sortable: false, groupable: false, aggregations: [], ...options });
const fields = [
  field("code"), field("name", { semanticRole: "title" }), field("code3"), field("region"),
  field("subregion", { cardPriority: "primary" }), field("calling_code"), field("status", { semanticRole: "status" }),
  field("official_name", { cardPriority: "hidden" }), field("numeric3"),
];
const descriptor = { entity: { identityField: "code" }, fields } as unknown as EntityListDescriptorV1;
const keys = (items: readonly ListFieldDescriptorV1[]) => items.map((item) => item.key);

describe("record card layout", () => {
  it("fills identity, title and status slots from metadata roles", () => {
    const layout = recordCardLayout(descriptor, fields);
    assert.equal(layout.identity?.key, "code");
    assert.equal(layout.title?.key, "name");
    assert.equal(layout.status?.key, "status");
  });

  it("orders primary fields first, omits hidden fields and discloses the overflow", () => {
    const layout = recordCardLayout(descriptor, fields);
    assert.equal(layout.body.length, RECORD_CARD_BODY_LIMIT);
    assert.deepEqual(keys(layout.body), ["subregion", "code3", "region", "calling_code"]);
    assert.deepEqual(keys(layout.more), ["numeric3"]);
  });

  it("follows the user's visible columns, so hidden columns never reach a card", () => {
    const layout = recordCardLayout(descriptor, fields.filter((item) => !["name", "subregion"].includes(item.key)));
    assert.equal(layout.title, undefined);
    assert.deepEqual(keys(layout.body), ["code3", "region", "calling_code", "numeric3"]);
    assert.deepEqual(layout.more, []);
    assert.equal(layout.identity?.key, "code");
  });
});

describe("list width tiers", () => {
  it("maps the list's inline size to the framework tiers", () => {
    assert.equal(listWidthTier(390, 16), "narrow");
    assert.equal(listWidthTier(639, 16), "narrow");
    assert.equal(listWidthTier(640, 16), "medium");
    assert.equal(listWidthTier(1023, 16), "medium");
    assert.equal(listWidthTier(1024, 16), "wide");
    assert.equal(listWidthTier(780, 20), "narrow");
    assert.equal(listWidthTier(800, 20), "medium");
  });
});
