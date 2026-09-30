import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { prepareActivityCapabilityMember } from "../activity-enrollment.js";
import { capabilityArtifactMembers } from "../entity-capabilities.js";
import { parseActivityBinding } from "../activity-binding.js";
import { parseActivityCollections } from "../activity-collections.js";
const profile = () =>
  JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../metadata/profiles/activity/recorded-owned.v2.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
const collection = {
  sectionKey: "addresses",
  maximumRecords: 100,
  definition: {
    key: "addresses",
    sourceEntity: "address_link",
    sourceContract: "a".repeat(64),
    scope: "active-links.v1",
    identityField: "id",
    targetField: "target",
    fields: [
      { key: "id", comparison: "json" },
      { key: "target", comparison: "json" },
      { key: "name", comparison: "json" },
    ],
  },
};
const member = (collections: unknown = [collection], overrides = {}) => {
  const p = profile();
  return prepareActivityCapabilityMember(
    "example_record",
    {
      schema: "athyper.entity-activity-source/1",
      profile: { code: p.profileCode, version: 2 },
      overrides: { collections, ...overrides },
    },
    () => p,
    {
      versionHistoryAvailable: true,
      automaticCaptureAvailable: true,
      writableOperations: ["create", "patch", "aggregate"],
    },
  );
};
it("pins per-entity collection overrides in the compiled Activity binding without granting new permissions", () => {
  const value = member();
  const raw = capabilityArtifactMembers("example_record", [value])
    .operationBindings.activityBinding;
  const binding = parseActivityBinding(raw, "example_record");
  expect(binding.collections).toEqual([collection]);
  expect(binding.snapshots.manualCapture).toBe(false);
  expect(binding.actions.map((a) => a.permissionCode)).not.toContain(
    "common.records.snapshot.capture",
  );
  expect(
    binding.actions.every((a) =>
      ["common.audit.event.query", "common.records.snapshot.read"].includes(
        a.permissionCode,
      ),
    ),
  ).toBe(true);
});
it.each([
  { ...collection, sql: "SELECT secret" },
  { ...collection, maximumRecords: 1001 },
  {
    ...collection,
    definition: { ...collection.definition, identityField: "missing" },
  },
  {
    ...collection,
    definition: { ...collection.definition, sourceContract: "unpinned" },
  },
  {
    ...collection,
    definition: {
      ...collection.definition,
      fields: [
        ...collection.definition.fields,
        collection.definition.fields[0],
      ],
    },
  },
])("rejects unsafe or ambiguous collection binding %j", (value) =>
  expect(() => member([value])).toThrow(),
);
it("rejects duplicate sections/identities and unqualified manual capture", () => {
  expect(() => parseActivityCollections([collection, collection])).toThrow();
  expect(() =>
    member([collection], { snapshots: { manualCapture: true } }),
  ).toThrow();
  expect(() => member([collection], { views: ["auditLog"] })).toThrow();
});
it("does not permit standard v1 profiles to acquire collection bindings via an unapproved override", () => {
  const p = JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../metadata/profiles/activity/standard.v1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  expect(() =>
    prepareActivityCapabilityMember(
      "example_record",
      {
        schema: "athyper.entity-activity-source/1",
        profile: { code: p.profileCode, version: 1 },
        overrides: { collections: [collection] },
      },
      () => p,
      {
        versionHistoryAvailable: false,
        automaticCaptureAvailable: false,
        writableOperations: [],
      },
    ),
  ).toThrow();
});

it("enables manual collections only through the new locked global profile", () => {
 const p=JSON.parse(readFileSync(new URL("../../../../../../metadata/profiles/activity/recorded-owned.v3.json",import.meta.url),"utf8"));
 const value=prepareActivityCapabilityMember("example_record",{schema:"athyper.entity-activity-source/1",profile:{code:p.profileCode,version:3},overrides:{collections:[collection]}},()=>p,{versionHistoryAvailable:true,automaticCaptureAvailable:true,writableOperations:["create","patch","aggregate"]});
 const binding=parseActivityBinding(capabilityArtifactMembers("example_record",[value]).operationBindings.activityBinding,"example_record");
 expect(binding.snapshots.manualCapture).toBe(true);
 expect(binding.actions.map(a=>a.permissionCode)).toContain("common.records.snapshot.capture");
});

it("validates explicit manual coverage/consistency without executable configuration",()=>{
 expect(parseActivityCollections([{...collection,manualCapture:{coverage:"optional",consistency:"independent"}}])).toHaveLength(1);
 for(const manualCapture of [{coverage:"best-effort",consistency:"transaction"},{coverage:"optional",consistency:"guessed"},{coverage:"required",consistency:"independent",url:"https://arbitrary"}])expect(()=>parseActivityCollections([{...collection,manualCapture}])).toThrow();
});
it("publishes Timeline through the locked global profile with existing canonical permissions",()=>{
 const p=JSON.parse(readFileSync(new URL("../../../../../../metadata/profiles/activity/standard.v2.json",import.meta.url),"utf8"));
 const value=prepareActivityCapabilityMember("example_reference",{schema:"athyper.entity-activity-source/1",profile:{code:p.profileCode,version:2}},()=>p,{versionHistoryAvailable:false,automaticCaptureAvailable:false,writableOperations:[]});
 const binding=parseActivityBinding(capabilityArtifactMembers("example_reference",[value]).operationBindings.activityBinding,"example_reference");
 expect(binding.views).toEqual(["timeline","auditLog","snapshots"]);
 expect(binding.actions.find(action=>action.key==="timeline_query")).toMatchObject({permissionCode:"common.audit.event.query"});
});
