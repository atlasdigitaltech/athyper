import { expect, it, vi } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import { ActivitySnapshotRepository } from "@athyper/server-service-records";
import { readCompiledRuntimeContract } from "@athyper/server-platform-metadata";
import { createEntityActivityProvider } from "../shared/entity-runtime/activity-provider.js";
vi.mock("@athyper/server-platform-metadata", async (original) => ({
  ...(await original<object>()),
  readCompiledRuntimeContract: vi.fn(),
}));
const descriptor = {
  entityCode: "example_reference",
  planeKey: "neon",
  contractHash: "contract",
  storage: { schema: "shared", object: "example_reference", idField: "id" },
  fields: [
    { key: "name" },
    { key: "nullable" },
    { key: "uncaptured" },
    { key: "secret", readPermissionCode: "secret.read" },
  ],
};
const runtimeArtifact = {
  artifactType: "runtime_contract", entityCode: "example_reference", plane: "neon",
  content: { descriptor: { schema: "record/1", source: { entity_id: "entity" },
    storage: descriptor.storage, fields: descriptor.fields } },
};
function fixture(collectionProviders?: Parameters<typeof createEntityActivityProvider>[0]["collectionProviders"]) {
  vi.mocked(readCompiledRuntimeContract).mockResolvedValue(descriptor as never);
  const row = {
    id: "snapshot",
    tenantId: "tenant",
    entityType: "shared.example_reference",
    entityId: "record",
    entityCode: "example_reference",
    entityContractHash: "contract",
    payloadSchemaVersion: 2,
    versionNumber: 1,
    capturedAt: "2026-09-28T00:00:00Z",
    capturedBy: "actor",
    payload: {
      schema: "athyper.activity-snapshot/1",
      record: { name: "Name", nullable: null, secret: "hidden" },
      coverage: {
        kind: "authorized_fields",
        fields: ["name", "nullable", "secret"],
      },
    },
  };
  const get = vi
    .spyOn(ActivitySnapshotRepository.prototype, "get")
    .mockResolvedValue(row as never);
  const capture = vi
    .spyOn(ActivitySnapshotRepository.prototype, "capture")
    .mockResolvedValue({ id: "snapshot", replayed: false });
  const query = vi.fn(
    async (_text: string, _parameters: readonly unknown[]) => ({
      rows: [
        {
          id: "audit",
          occurredAt: "2026-09-28T00:00:00.000123Z",
          event: "record.updated",
          operation: "update",
          outcome: "success",
          actor: "actor",
          changedFields: ["name", "secret"],
        },
      ],
    }),
  );
  const database = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  const run = vi.fn(
    async (
      _plane: unknown,
      _identity: unknown,
      work: (tx: unknown) => unknown,
    ) => work(database),
  );
  const read = vi.fn(async () => ({
    name: "Current",
    nullable: null,
    secret: "must not capture",
  }));
  const provider = createEntityActivityProvider({
    reader: { artifactByKey: async () => runtimeArtifact } as never,
    collectionProviders,
    authorizer: {
      authorize: async (input) =>
        input.permissionCode === "secret.read"
          ? { allowed: false, reason: "denied" }
          : { allowed: true },
    },
    transactions: { run } as never,
    read,
  });
  const subject = {
    context: {
      tenantId: "tenant",
      principalId: "actor",
      planeKey: "neon",
    } as any,
    entityCode: "example_reference",
    recordId: "record",
  };
  const admission = {
    release: {},
    releaseHash: "release",
    binding: { snapshots: { retentionClass: "standard" } },
  } as any;
  return {
    row,
    get,
    capture,
    query,
    database,
    run,
    read,
    provider,
    subject,
    admission,
  };
}
it("projects current fields, preserves null versus uncaptured and never returns raw hashes/coverage names", async () => {
  const f = fixture();
  try {
    const result = await f.provider.snapshot(
      f.subject,
      f.admission,
      "snapshot",
    );
    expect(result.fields).toEqual([
      { key: "name", label: "name", state: "value", value: "Name" },
      { key: "nullable", label: "nullable", state: "value", value: null },
      { key: "uncaptured", label: "uncaptured", state: "uncaptured" },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /secret|hidden|payloadHash|contractHash/,
    );
    expect(f.get).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant",
        planeKey: "neon",
        entityType: "shared.example_reference",
        entityCode: "example_reference",
        entityId: "record",
      }),
      "snapshot",
    );
    const compared = await f.provider.compare(
      f.subject,
      f.admission,
      "first",
      "second",
    );
    expect(JSON.stringify(compared)).not.toContain("secret");
  } finally {
    await f.database.destroy();
    vi.restoreAllMocks();
  }
});
it("rejects missing, incompatible and unsupported snapshot payloads", async () => {
  const f = fixture();
  try {
    f.get.mockResolvedValue(null);
    await expect(
      f.provider.snapshot(f.subject, f.admission, "snapshot"),
    ).rejects.toMatchObject({ status: 404 });
    for (const mutation of [
      { entityContractHash: "older" },
      { payloadSchemaVersion: 4 },
      { payload: {} },
    ]) {
      f.get.mockResolvedValue({ ...f.row, ...mutation } as never);
      await expect(
        f.provider.snapshot(f.subject, f.admission, "snapshot"),
      ).rejects.toMatchObject({ status: 409 });
    }
  } finally {
    await f.database.destroy();
    vi.restoreAllMocks();
  }
});
it("captures only readable source fields with manual tenant-local policy and absent source version", async () => {
  const f = fixture();
  try {
    await f.provider.capture(f.subject, f.admission, "capture-key");
    expect(f.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant",
        entityType: "shared.example_reference",
        payload: { name: "Current", nullable: null },
        idempotencyKey: "capture-key",
        retentionClass: "standard",
      }),
    );
    expect(f.capture.mock.calls[0]![0]).not.toHaveProperty(
      "sourceRecordVersion",
    );
    f.read.mockResolvedValue(null as never);
    await expect(
      f.provider.capture(f.subject, f.admission, "other"),
    ).rejects.toMatchObject({ status: 404 });
  } finally {
    await f.database.destroy();
    vi.restoreAllMocks();
  }
});
it("queries only direct tenant/plane record events, redacting field names and preserving SQL tuple precision", async () => {
  const f = fixture();
  try {
    const result = await f.provider.audit(f.subject, f.admission, {
      from: "2026-09-01",
      until: "2026-09-28",
      after: { at: "2026-09-27T00:00:00.000123Z", id: "event" },
      limit: 5,
    });
    expect(result[0]!.changedFields).toEqual(["name"]);
    const text = String(f.query.mock.calls[0]?.[0]);
    expect(text).toContain("tenant_id=");
    expect(text).toContain("plane_code=");
    expect(text).toContain("entity_type=");
    expect(text).toContain("entity_id=");
    expect(text).toContain("(occurred_at,id)<");
    expect(text).not.toMatch(
      /old_values|new_values|reason_comment|tenant_id IS NULL/,
    );
  } finally {
    await f.database.destroy();
    vi.restoreAllMocks();
  }
});
it("automatic snapshot coverage is declared while read/compare still filter current field access", async () => {
  const f=fixture();
  try {
    f.row.payloadSchemaVersion=3;
    f.row.payload.coverage.kind="declared_fields";
    const result=await f.provider.snapshot(f.subject,f.admission,"snapshot");
    expect(result.coverage).toBe("declared_fields");
    expect(result.fields.map(field=>field.key)).not.toContain("secret");
    expect(JSON.stringify(await f.provider.compare(f.subject,f.admission,"first","second"))).not.toContain("hidden");
  } finally { await f.database.destroy(); vi.restoreAllMocks(); }
});
it("versions query is tenant/plane/root scoped and filters field names without returning stored values", async () => {
  const f=fixture();
  try {
    const window={from:"2020-01-01",until:"2100-01-01",limit:2};
    await expect(f.provider.versions!(f.subject,f.admission,window)).rejects.toMatchObject({code:"ACTIVITY_VERSIONS_UNAVAILABLE"});
    f.admission.binding.recording={providerKey:"platform.records.history.v1"};
    f.query.mockResolvedValue({rows:[{id:"version",occurredAt:"2026-09-28T00:00:00.000123Z",version:3,operation:"patch",actor:"actor",changedFields:["name","secret"]}]} as never);
    const result=await f.provider.versions!(f.subject,f.admission,window);
    expect(result[0]).toMatchObject({version:3,changedFields:["name"]});
    const [query,params]=f.query.mock.calls.find(([text])=>text.includes("snapshot.record_version"))!;
    expect(query).toContain("plane_code="); expect(query).not.toContain("payload_json");
    expect(params).toEqual(expect.arrayContaining(["tenant","neon","shared.example_reference","record"]));
  } finally { await f.database.destroy(); vi.restoreAllMocks(); }
});
it("manual and automatic envelopes with the same contract can be compared safely", async()=>{
  const f=fixture();
  try {
    f.get.mockResolvedValueOnce(f.row as never).mockResolvedValueOnce({...f.row,payloadSchemaVersion:3,payload:{...f.row.payload,coverage:{...f.row.payload.coverage,kind:"declared_fields"}}} as never);
    const result=await f.provider.compare(f.subject,f.admission,"manual","automatic");
    expect(result.fields.map(f=>f.key)).toEqual(["name","nullable","uncaptured"]);
    expect(JSON.stringify(result)).not.toContain("secret");
  } finally {await f.database.destroy();vi.restoreAllMocks();}
});

it("treats missing capture coverage as a limitation rather than a business change", async () => {
  const f = fixture();
  try {
    f.get.mockResolvedValueOnce(f.row as never).mockResolvedValueOnce({ ...f.row, payload: {
      ...f.row.payload, record: { name: "Updated", nullable: null, uncaptured: "Now captured", secret: "hidden" },
      coverage: { kind: "authorized_fields", fields: ["name", "nullable", "uncaptured", "secret"] },
    } } as never);
    const result = await f.provider.compare(f.subject, f.admission, "first", "second");
    expect(result.fields.find(field => field.key === "name")?.changed).toBe(true);
    expect(result.fields.find(field => field.key === "uncaptured")).toMatchObject({ changed: false, before: { state: "uncaptured" }, after: { state: "value", value: "Now captured" } });
    expect(JSON.stringify(result)).not.toContain("secret");
  } finally { await f.database.destroy(); vi.restoreAllMocks(); }
});

it("normalizes comparison direction using the record's snapshot sequence", async () => {
  const f = fixture();
  try {
    f.get.mockResolvedValueOnce({ ...f.row, versionNumber: 2 } as never).mockResolvedValueOnce(f.row as never);
    const result = await f.provider.compare(f.subject, f.admission, "later", "earlier");
    expect(result).toMatchObject({ from: "earlier", to: "later" });
  } finally { await f.database.destroy(); vi.restoreAllMocks(); }
});

it("projects qualified collection captures with current row/field access and chronological ordering", async () => {
  const definition = { key: "lines", sourceEntity: "child", sourceContract: "a".repeat(64), scope: "owned.v1", identityField: "id", fields: [{ key: "id", comparison: "json" }, { key: "name", comparison: "json" }, { key: "secret", comparison: "json" }] };
  const authorization = { discoverable: true, membership: "restricted", label: "Lines", fields: [{ key: "name", label: "Name" }], authorizeRecord: vi.fn(async ({id}: {id:string}) => ({ readable: id !== "hidden-row", fields: ["name"], targetReadable: false })) };
  const registration = { qualifyGraph: vi.fn(), qualifyRuntime: vi.fn(), authorize: vi.fn(async () => authorization) };
  const f = fixture(new Map([["adapter", registration as never]]));
  try {
    vi.mocked(readCompiledRuntimeContract).mockResolvedValue({ ...descriptor, aggregate: { collections: [{code:"lines",entityCode:"child"}] } } as never);
    f.admission.binding.recording = { adapterKey: "adapter" };
    f.admission.binding.collections = [{ sectionKey:"lines",maximumRecords:10,definition }];
    const envelope = { schema:"athyper.collection-capture/1",subject:{tenantId:"tenant",plane:"neon",entityCode:"example_reference",recordId:"record"},definition,coverage:"complete",consistency:"root_transaction",records:[{id:"visible",name:"Earlier",secret:"private"},{id:"hidden-row",name:"Hidden",secret:"private"}] };
    const earlier = { ...f.row, payloadSchemaVersion:3,payload:{...f.row.payload,coverage:{...f.row.payload.coverage,kind:"declared_fields"},owned:{lines:envelope}} };
    const later = { ...earlier,versionNumber:2,payload:{...earlier.payload,owned:{lines:{...envelope,records:[{id:"visible",name:"Later",secret:"private"}]}}} };
    f.get.mockResolvedValueOnce(later as never).mockResolvedValueOnce(earlier as never);
    const compared = await f.provider.compareCollection!(f.subject,f.admission,"later","earlier","lines");
    expect(compared).toMatchObject({from:"earlier",to:"later",counts:{updated:1},beforeCapturedAt:f.row.capturedAt});
    expect(compared.items).toHaveLength(1);
    expect(JSON.stringify(compared)).not.toMatch(/private|hidden-row|sourceContract/);
    expect(registration.qualifyRuntime).toHaveBeenCalled();
    f.get.mockResolvedValue(earlier as never);
    const read = await f.provider.collection!(f.subject,f.admission,"snapshot","lines");
    expect(read.items[0]?.fields).toEqual([{key:"name",label:"Name",state:"value",value:"Earlier"}]);
    expect((await f.provider.snapshot(f.subject,f.admission,"snapshot")).collections).toEqual([{key:"lines",label:"Lines",sectionKey:"lines"}]);
    authorization.discoverable=false;
    await expect(f.provider.collection!(f.subject,f.admission,"snapshot","lines")).rejects.toMatchObject({status:404});
    expect((await f.provider.snapshot(f.subject,f.admission,"snapshot")).collections).toEqual([]);
    authorization.discoverable=true;
    f.get.mockResolvedValue(f.row as never);
    await expect(f.provider.collection!(f.subject,f.admission,"snapshot","lines")).rejects.toMatchObject({status:409});
    f.admission.binding.recording.adapterKey="uninstalled";
    await expect(f.provider.collection!(f.subject,f.admission,"snapshot","lines")).rejects.toMatchObject({status:503});
  } finally { await f.database.destroy(); vi.restoreAllMocks(); }
});

it("manual multi-section capture validates provider output and fails closed on current access", async () => {
  const definition={key:"lines",sourceEntity:"child",sourceContract:"a".repeat(64),scope:"owned.v1",identityField:"id",fields:[{key:"id",comparison:"json"},{key:"name",comparison:"json"}]};
  const owned={lines:{schema:"athyper.collection-capture/1",subject:{tenantId:"tenant",plane:"neon",entityCode:"example_reference",recordId:"record"},definition,coverage:"complete",consistency:"root_transaction",records:[{id:"line",name:"Captured"}]}};
  const decision={readable:true,fields:["name"],targetReadable:false};
  const registration={qualifyGraph:vi.fn(),qualifyRuntime:vi.fn(),authorize:vi.fn(async()=>({discoverable:true,membership:"complete",label:"Lines",fields:[{key:"name",label:"Name"}],authorizeRecord:async()=>decision})),captureConsistent:vi.fn(async()=>({record:{name:"Root"},owned}))};
  const f=fixture(new Map([["adapter",registration as never]]));
  try {
    vi.mocked(readCompiledRuntimeContract).mockResolvedValue({...descriptor,aggregate:{collections:[{code:"lines",entityCode:"child"}]}} as never);
    f.admission.binding.recording={adapterKey:"adapter"};
    f.admission.binding.snapshots.manualCapture=true;
    f.admission.binding.collections=[{sectionKey:"lines",maximumRecords:10,definition}];
    f.capture.mockImplementation(async input=>{const value=await input.readConsistent!(f.database as never);expect(value).toMatchObject({record:{name:"Root"},owned});return {id:"snapshot",replayed:false};});
    expect(await f.provider.capture(f.subject,f.admission,"manual")).toEqual({id:"snapshot",replayed:false});
    expect(f.read).not.toHaveBeenCalled();
    expect(registration.captureConsistent).toHaveBeenCalledWith(expect.objectContaining({transaction:f.database,rootFields:["name","nullable","uncaptured"]}));
    decision.readable=false;
    await expect(f.provider.capture(f.subject,f.admission,"denied")).rejects.toMatchObject({status:409,code:"ACTIVITY_CONSISTENT_CAPTURE_FAILED"});
    decision.readable=true;
    owned.lines.coverage="partial";
    await expect(f.provider.capture(f.subject,f.admission,"partial")).rejects.toMatchObject({status:409});
    owned.lines.coverage="complete";
    owned.lines.subject.tenantId="other";
    await expect(f.provider.capture(f.subject,f.admission,"wrong-subject")).rejects.toMatchObject({status:409});
  } finally {await f.database.destroy();vi.restoreAllMocks();}
});

it("timeline includes only authorized sources and uses scoped stable SQL ordering and bound filters",async()=>{
 const f=fixture();
 try {
  f.admission.projection={actions:[{key:"timeline_query"}]};
  f.query.mockResolvedValue({rows:[{id:"audit:event",occurredAt:"2026-09-28T00:00:00.000123Z",event:"record.updated",operation:"update",outcome:"failure",actor:"actor",source:"audit",correlation:"command",changedFields:["name","secret"]}]} as never);
  const window={from:"2020-01-01",until:"2100-01-01",limit:10,filters:{event:"record.updated",outcome:"failure" as const}};
  const result=await f.provider.timeline!(f.subject,f.admission,window);
  expect(result[0]).toMatchObject({source:"audit",correlation:"command",changedFields:["name"],outcome:"failure"});
  const [query,values]=f.query.mock.calls.at(-1)!;
  expect(query).not.toContain("entity_snapshot_identity");expect(query).not.toContain("record_version");
  expect(query).toContain("ORDER BY at DESC,id DESC");expect(values).toEqual(expect.arrayContaining(["tenant","neon","record.updated","failure"]));
  f.admission.projection.actions.push({key:"snapshots_read"});
  await f.provider.timeline!(f.subject,f.admission,window);
  expect(f.query.mock.calls.at(-1)![0]).toContain("entity_snapshot_identity");
  expect(f.query.mock.calls.at(-1)![0]).not.toContain("record_version");
 }finally{await f.database.destroy();vi.restoreAllMocks();}
});

it("optional and independent manual sections retain truthful coverage and source observation",async()=>{
 const definition={key:"lines",sourceEntity:"child",sourceContract:"a".repeat(64),scope:"owned.v1",identityField:"id",fields:[{key:"id",comparison:"json"},{key:"name",comparison:"json"}]};
 const registration={qualifyGraph:vi.fn(),qualifyRuntime:vi.fn(),authorize:vi.fn(async()=>({discoverable:true,membership:"complete",label:"Lines",fields:[{key:"name",label:"Name"}],authorizeRecord:async()=>({readable:true,fields:["name"],targetReadable:false})})),captureConsistent:vi.fn(async()=>({record:{name:"Root"},owned:{}})),captureIndependent:vi.fn(async()=>undefined as unknown)};
 const f=fixture(new Map([["adapter",registration as never]]));
 try {
  vi.mocked(readCompiledRuntimeContract).mockResolvedValue({...descriptor,aggregate:{collections:[{code:"lines",entityCode:"child"}]}} as never);
  f.admission.binding.recording={adapterKey:"adapter"};f.admission.binding.snapshots.manualCapture=true;
  const binding={sectionKey:"lines",maximumRecords:10,definition,manualCapture:{coverage:"optional",consistency:"transaction"}};
  f.admission.binding.collections=[binding];
  let saved:any;
  f.capture.mockImplementation(async input=>{saved=await input.readConsistent!(f.database as never);return {id:"snapshot",replayed:false};});
  await f.provider.capture(f.subject,f.admission,"optional");
  expect(saved.owned.lines).toMatchObject({coverage:"not_captured",records:[]});
  binding.manualCapture={coverage:"required",consistency:"independent"};
  registration.captureIndependent.mockResolvedValue({schema:"athyper.collection-capture/1",subject:{tenantId:"tenant",plane:"neon",entityCode:"example_reference",recordId:"record"},definition,coverage:"complete",consistency:"independent",capturedAt:"2026-09-28T00:00:00Z",records:[{id:"line",name:"Observed"}]});
  await f.provider.capture(f.subject,f.admission,"independent");
  expect(saved.owned.lines).toMatchObject({consistency:"independent",capturedAt:"2026-09-28T00:00:00Z"});
  registration.captureIndependent.mockRejectedValue(Error("source unavailable"));
  await expect(f.provider.capture(f.subject,f.admission,"required-failure")).rejects.toMatchObject({status:409});
  binding.manualCapture.coverage="optional";
  await f.provider.capture(f.subject,f.admission,"optional-failure");
  expect(saved.owned.lines).toMatchObject({coverage:"not_captured",records:[]});
 }finally{await f.database.destroy();vi.restoreAllMocks();}
});

it("compares verified equivalent historical contracts across releases with current field authorization", async () => {
  const f = fixture();
  try {
    f.query.mockResolvedValue({ rows: [{ artifact: runtimeArtifact }] } as never);
    f.get.mockResolvedValueOnce({ ...f.row, entityContractHash: "previous" } as never)
      .mockResolvedValueOnce({ ...f.row, versionNumber: 2 } as never);
    const compared = await f.provider.compare(f.subject, f.admission, "older", "newer");
    expect(compared.fields.find(f => f.key === "name")?.changed).toBe(false);
    expect(JSON.stringify(compared)).not.toMatch(/secret|hidden/);
    expect(f.query.mock.calls[0]?.[0]).toContain("signature_verified");
    expect(f.query.mock.calls[0]?.[0]).toContain("activated_at");
  } finally { await f.database.destroy(); vi.restoreAllMocks(); }
});
it("rejects a historical same-key field with changed interpretation", async () => {
  const f = fixture();
  try {
    f.get.mockResolvedValue({ ...f.row, entityContractHash: "previous" } as never);
    const historical = structuredClone(runtimeArtifact);
    historical.content.descriptor.fields = [{ key: "name", type: "number" }] as never;
    f.query.mockResolvedValue({ rows: [{ artifact: historical }] } as never);
    await expect(f.provider.compare(f.subject, f.admission, "older", "newer"))
      .rejects.toMatchObject({ status: 409 });
  } finally { await f.database.destroy(); vi.restoreAllMocks(); }
});
