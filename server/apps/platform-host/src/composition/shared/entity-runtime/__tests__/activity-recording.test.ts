import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import {
  prepareActivityCapabilityMember,
  capabilityArtifactMembers,
  parseActivityBinding,
} from "@athyper/server-contract-publication";
import { readCompiledRuntimeContract } from "@athyper/server-platform-metadata";
import {
  createActivityRecordingResolver,
  qualifyActivityRecordingGraph,
  resolveRecordHistoryBinding,
} from "../activity-recording.js";
vi.mock("@athyper/server-platform-metadata", async (original) => ({
  ...(await original<object>()),
  readCompiledRuntimeContract: vi.fn(),
}));
function fixture() {
  const p = JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../../../metadata/profiles/activity/recorded-root.v1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const member = prepareActivityCapabilityMember(
    "example_record",
    {
      schema: "athyper.entity-activity-source/1",
      profile: { code: p.profileCode, version: 1 },
    },
    () => p,
    {
      versionHistoryAvailable: true,
      automaticCaptureAvailable: true,
      writableOperations: ["create", "patch"],
    },
  );
  const binding = parseActivityBinding(
    capabilityArtifactMembers("example_record", [member]).operationBindings
      .activityBinding,
    "example_record",
  );
  const descriptor = {
    entityCode: "example_record",
    planeKey: "neon",
    releaseId: "release",
    contractHash: "hash",
    compiledHash: "compiled",
    compiledRelease: {},
    storage: {
      schema: "master",
      object: "example_record",
      tenantField: "tenant_id",
      idField: "id",
      versionField: "row_version",
    },
    fields: [
      {
        key: "name",
        storagePath: "name",
        valueOrigin: "stored",
        writableOn: ["create", "patch"],
      },
      {
        key: "row_version",
        storagePath: "row_version",
        valueOrigin: "stored",
        writableOn: [],
      },
    ],
    operations: { create: {}, patch: {} },
  } as any;
  vi.mocked(readCompiledRuntimeContract).mockResolvedValue(descriptor);
  const core = { content: { capabilities: { activity: { enabled: true } } } };
  const reader = {
    resolve: vi.fn(async () => ({})),
    core: vi.fn(async () => core),
    operation: vi.fn(async () => ({ content: { activityBinding: binding } })),
  };
  const command = {
    context: { tenantId: "tenant", principalId: "actor", planeKey: "neon" },
    entityCode: "example_record",
  } as any;
  return { binding, descriptor, core, reader, command, member };
}
it("derives a reusable stored-root projection, pins the mutation release and fails on drift", async () => {
  const f = fixture();
  const resolve = createActivityRecordingResolver(f.reader as never);
  expect(await resolve(f.command, f.descriptor)).toMatchObject({
    fields: ["name"],
    operations: ["create", "patch"],
  });
  await expect(
    resolve(f.command, { ...f.descriptor, releaseId: "different" }),
  ).rejects.toThrow("RELEASE_CHANGED");
  expect(resolveRecordHistoryBinding(f.descriptor, f.binding).fields).toEqual([
    "name",
  ]);
  f.core.content.capabilities.activity.enabled = false;
  expect(
    await resolve(f.command, { ...f.descriptor, releaseId: "legacy" }),
  ).toBeUndefined();
});
it("source qualification rejects reference/facade writers, undeclared operations and incomplete projections", async () => {
  const f = fixture();
  const graph = {
    entity: { entityCode: "example_record" },
    capabilities: [f.member],
    runtimeProfiles: [
      {
        writeMode: "generic",
        concurrencyMode: "optimistic",
        tenantFieldKey: "tenant_id",
        recordVersionFieldKey: "row_version",
      },
    ],
    fields: [
      {
        fieldKey: "name",
        storagePath: "name",
        valueOrigin: "stored",
        writeMode: "mutable",
      },
    ],
    operations: [{ operationKey: "create" }, { operationKey: "patch" }],
  } as any;
  await expect(qualifyActivityRecordingGraph(graph)).resolves.toBeUndefined();
  await expect(
    qualifyActivityRecordingGraph({
      ...graph,
      runtimeProfiles: [{ ...graph.runtimeProfiles[0], writeMode: "none" }],
    }),
  ).rejects.toThrow("WRITE_OWNERSHIP");
  await expect(
    qualifyActivityRecordingGraph({
      ...graph,
      operations: [...graph.operations, { operationKey: "delete" }],
    }),
  ).rejects.toThrow("DOMAIN_PROVIDER");
  await expect(
    qualifyActivityRecordingGraph({
      ...graph,
      fields: [
        { fieldKey: "computed", writeMode: "mutable", valueOrigin: "computed" },
      ],
    }),
  ).rejects.toThrow("PROJECTION");
});
it("requires installed owning adapters and domain handlers at source and runtime", async () => {
  const p = JSON.parse(readFileSync(new URL("../../../../../../../../metadata/profiles/activity/recorded-owned.v1.json",import.meta.url),"utf8"));
  const member = prepareActivityCapabilityMember("example_record",{schema:"athyper.entity-activity-source/1",profile:{code:p.profileCode,version:1}},()=>p,
    {versionHistoryAvailable:true,automaticCaptureAvailable:true,writableOperations:["create","patch","aggregate"]});
  const graph = {entity:{entityCode:"example_record"},capabilities:[member],operations:[]} as any;
  await expect(qualifyActivityRecordingGraph(graph)).rejects.toThrow("ADAPTER_UNAVAILABLE");
  const registration = {adapter:{key:p.defaults.recording.adapterKey,qualify:vi.fn(),read:vi.fn()},qualifyGraph:vi.fn(async()=>{}),aggregateExecutor:{execute:vi.fn()}};
  const registrations = new Map([[registration.adapter.key,registration]]);
  await expect(qualifyActivityRecordingGraph(graph,registrations)).resolves.toBeUndefined();
  expect(registration.qualifyGraph).toHaveBeenCalledOnce();
  await expect(qualifyActivityRecordingGraph({...graph,operations:[{handlerKey:"missing.domain"}]},registrations)).rejects.toThrow("DOMAIN_HANDLER_UNAVAILABLE");
  const f = fixture();
  f.reader.operation.mockResolvedValue({content:{activityBinding:capabilityArtifactMembers("example_record",[member]).operationBindings.activityBinding!}} as any);
  f.descriptor.operations.aggregate = {};
  await expect(createActivityRecordingResolver(f.reader as never)(f.command,f.descriptor)).rejects.toThrow("PROVIDER_INCOMPATIBLE");
  await expect(createActivityRecordingResolver(f.reader as never,new Map([[registration.adapter.key,registration.adapter]]))(f.command,f.descriptor)).resolves.toMatchObject({adapterKey:registration.adapter.key});
});

it("requires published sections and installed collection qualification before publication", async () => {
  const p=JSON.parse(readFileSync(new URL("../../../../../../../../metadata/profiles/activity/recorded-owned.v2.json",import.meta.url),"utf8"));
  const collections=[{sectionKey:"lines",maximumRecords:100,definition:{key:"lines",sourceEntity:"child",sourceContract:"a".repeat(64),scope:"owned.v1",identityField:"id",fields:[{key:"id",comparison:"json"}]}}];
  const member=prepareActivityCapabilityMember("example_record",{schema:"athyper.entity-activity-source/1",profile:{code:p.profileCode,version:2},overrides:{collections}},()=>p,{versionHistoryAvailable:true,automaticCaptureAvailable:true,writableOperations:["create","patch","aggregate"]});
  const graph={entity:{entityCode:"example_record"},capabilities:[member],operations:[],surfaceSections:[{sectionKey:"lines"}]} as any;
  const registration={adapter:{key:p.defaults.recording.adapterKey,qualify:vi.fn(),read:vi.fn()},qualifyGraph:vi.fn(),aggregateExecutor:{execute:vi.fn()}};
  await expect(qualifyActivityRecordingGraph(graph,new Map([[registration.adapter.key,registration]]))).rejects.toThrow("COLLECTION_PROVIDER_UNAVAILABLE");
  const provider={qualifyGraph:vi.fn(async()=>{}),qualifyRuntime:vi.fn(),authorize:vi.fn()};
  const installed=new Map([[registration.adapter.key,{...registration,collections:provider}]]);
  await expect(qualifyActivityRecordingGraph({...graph,surfaceSections:[]},installed)).rejects.toThrow("COLLECTION_SECTION_REQUIRED");
  await expect(qualifyActivityRecordingGraph(graph,installed)).resolves.toBeUndefined();
  expect(provider.qualifyGraph).toHaveBeenCalledOnce();
  provider.qualifyGraph.mockRejectedValueOnce(Error("SOURCE_CONTRACT_MISMATCH"));
  await expect(qualifyActivityRecordingGraph(graph,installed)).rejects.toThrow("SOURCE_CONTRACT_MISMATCH");
});

it("manual collection publication requires an installed consistent reader", async () => {
 const p=JSON.parse(readFileSync(new URL("../../../../../../../../metadata/profiles/activity/recorded-owned.v3.json",import.meta.url),"utf8"));
 const collections=[{sectionKey:"lines",maximumRecords:10,definition:{key:"lines",sourceEntity:"child",sourceContract:"a".repeat(64),scope:"owned.v1",identityField:"id",fields:[{key:"id",comparison:"json"}]}}];
 const member=prepareActivityCapabilityMember("example_record",{schema:"athyper.entity-activity-source/1",profile:{code:p.profileCode,version:3},overrides:{collections}},()=>p,{versionHistoryAvailable:true,automaticCaptureAvailable:true,writableOperations:["create","patch","aggregate"]});
 const graph={entity:{entityCode:"example_record"},capabilities:[member],operations:[],surfaceSections:[{sectionKey:"lines"}]} as any;
 const collectionsProvider={qualifyGraph:vi.fn(),qualifyRuntime:vi.fn(),authorize:vi.fn()};
 const registration={adapter:{key:p.defaults.recording.adapterKey,qualify:vi.fn(),read:vi.fn()},qualifyGraph:vi.fn(),aggregateExecutor:{execute:vi.fn()},collections:collectionsProvider};
 await expect(qualifyActivityRecordingGraph(graph,new Map([[registration.adapter.key,registration]]))).rejects.toThrow("CONSISTENT_CAPTURE_REQUIRED");
 await expect(qualifyActivityRecordingGraph(graph,new Map([[registration.adapter.key,{...registration,collections:{...collectionsProvider,captureConsistent:vi.fn()}}]]))).resolves.toBeUndefined();
});
