import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import { sortDirectionKeys, sortPickerFields } from "../../packages/platform/entity/runtime/list-view/src/sort-direction";
import { groupAvailableColumns, SYSTEM_FIELD_GROUP } from "../../packages/platform/entity/runtime/list-view/src/columns";

const field = (key: string, valueKind: ListFieldDescriptorV1["valueKind"], options: Partial<ListFieldDescriptorV1> = {}): ListFieldDescriptorV1 => ({ key, label: key, valueKind, defaultVisible: false, defaultOrder: 0, filterOperators: [], sortable: true, groupable: false, aggregations: [], ...options });

describe("sort direction wording", () => {
  it("describes the order for the field's value kind", () => {
    assert.deepEqual(sortDirectionKeys("string"), { asc: "list.sort.az", desc: "list.sort.za" });
    assert.deepEqual(sortDirectionKeys("money"), { asc: "list.sort.lowHigh", desc: "list.sort.highLow" });
    assert.deepEqual(sortDirectionKeys("datetime"), { asc: "list.sort.oldestFirst", desc: "list.sort.newestFirst" });
    assert.deepEqual(sortDirectionKeys("boolean"), { asc: "list.sort.noFirst", desc: "list.sort.yesFirst" });
    assert.deepEqual(sortDirectionKeys(undefined), { asc: "list.sort.az", desc: "list.sort.za" });
  });

  it("never offers record identifiers or unsortable fields", () => {
    const fields = [field("id", "uuid"), field("name", "string"), field("notes", "text", { sortable: false }), field("updated_at", "datetime")];
    assert.deepEqual(sortPickerFields(fields).map((item) => item.key), ["name", "updated_at"]);
  });

  it("groups technical fields under the collapsible system group", () => {
    const groups = groupAvailableColumns([field("name", "string"), field("tenant_id", "string"), field("row_version", "integer")]);
    assert.deepEqual(groups.map((group) => group.label), ["General fields", SYSTEM_FIELD_GROUP]);
  });
});
