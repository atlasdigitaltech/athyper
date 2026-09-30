import { expect, it, vi } from "vitest";
import { EntityCapabilityPolicyError } from "./entity-capability-policy.js";
import {
  createEntityActivityService,
  type EntityActivityProvider,
} from "./entity-activity-service.js";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  let clock = new Date("2026-09-28T00:00:00Z");
  const admission = {
    releaseHash: "release",
    binding: { query: { defaultRangeDays: 30, maxRangeDays: 90, pageSize: 2 } },
    projection: {
      views: ["auditLog", "snapshots"],
      defaultView: "auditLog",
      actions: [{ key: "snapshots_capture" }],
    },
  };
  const policy = { resolve: vi.fn(async () => admission) };
  const audit = vi.fn<EntityActivityProvider["audit"]>(async () =>
    [1, 2, 3].map((n) => ({
      id: id(n),
      occurredAt: "2026-09-27T00:00:00.000123Z",
      event: "record.changed",
      operation: "update",
      outcome: "success",
      actor: null,
      changedFields: [],
    })),
  );
  const provider = {
    audit,
    snapshots: vi.fn(async () => []),
    snapshot: vi.fn(),
    compare: vi.fn(),
    capture: vi.fn(async () => ({ id: id(1), replayed: false })),
  } satisfies EntityActivityProvider;
  const service = createEntityActivityService({
    policy: policy as never,
    provider: () => provider,
    cursorKey: new Uint8Array(32).fill(7),
    now: () => clock,
  });
  const input = {
    context: {
      tenantId: id(4),
      principalId: id(5),
      planeKey: "neon",
      authEpoch: 1,
      profileHash: "profile",
    } as any,
    entityCode: "example_reference",
    recordId: id(6),
    view: "auditLog" as const,
  };
  return {
    service,
    provider,
    policy,
    input,
    admission,
    setClock: (date: string) => {
      clock = new Date(date);
    },
  };
}
it("binds signed cursors to principal, tenant, plane, record, query and release, preserving microseconds and upper bound", async () => {
  const f = fixture();
  const first = await f.service.page(f.input);
  expect(first.items).toHaveLength(2);
  expect(first.nextCursor).toBeTruthy();
  await f.service.page({ ...f.input, cursor: first.nextCursor });
  expect(f.provider.audit.mock.calls[1]![2]).toMatchObject({
    until: "2026-09-28T00:00:00.000Z",
    after: { at: "2026-09-27T00:00:00.000123Z", id: id(2) },
  });
  for (const changed of [
    { recordId: id(7) },
    { entityCode: "other" },
    { days: 7 },
    { view: "snapshots" },
    ...Object.entries({
      tenantId: id(8),
      principalId: id(9),
      planeKey: "mesh",
      authEpoch: 2,
      profileHash: "other",
    }).map(([key, value]) => ({
      context: { ...f.input.context, [key]: value },
    })),
  ])
    await expect(
      f.service.page({
        ...f.input,
        ...changed,
        cursor: first.nextCursor,
      } as any),
    ).rejects.toMatchObject({ code: "ACTIVITY_CURSOR_INVALID" });
  await expect(
    f.service.page({ ...f.input, cursor: first.nextCursor + "x" }),
  ).rejects.toMatchObject({ code: "ACTIVITY_CURSOR_INVALID" });
  f.admission.releaseHash = "other";
  await expect(
    f.service.page({ ...f.input, cursor: first.nextCursor }),
  ).rejects.toThrow();
  f.admission.releaseHash = "release";
  f.setClock("2026-09-28T02:00:00Z");
  await expect(
    f.service.page({ ...f.input, cursor: first.nextCursor }),
  ).rejects.toThrow();
});
it("reauthorizes every endpoint before provider access", async () => {
  const f = fixture();
  f.policy.resolve.mockRejectedValue(new EntityCapabilityPolicyError());
  expect(await f.service.describe(f.input)).toBeNull();
  await expect(f.service.page(f.input)).rejects.toThrow();
  await expect(f.service.snapshot({ ...f.input, id: id(1) })).rejects.toThrow();
  await expect(
    f.service.compare({ ...f.input, from: id(1), to: id(2) }),
  ).rejects.toThrow();
  await expect(
    f.service.capture({ ...f.input, idempotencyKey: "capture-key" }),
  ).rejects.toThrow();
  for (const fn of Object.values(f.provider)) expect(fn).not.toHaveBeenCalled();
});
it("bounds query ranges and denies uninstalled providers", async () => {
  const f = fixture();
  for (const days of [0, -1, 91, 1.5])
    await expect(f.service.page({ ...f.input, days })).rejects.toMatchObject({
      status: 400,
    });
  const absent = createEntityActivityService({
    policy: f.policy as never,
    provider: () => undefined,
  });
  expect(await absent.describe(f.input)).toBeNull();
  await expect(absent.page(f.input)).rejects.toMatchObject({ status: 503 });
});
it("versions uses its own authorized action and cursor namespace; absent provider fails closed", async () => {
  const f = fixture();
  await expect(f.service.page({...f.input,view:"versions"})).rejects.toMatchObject({code:"ACTIVITY_VERSIONS_UNAVAILABLE"});
  const versions = vi.fn(async () => [3,2,1].map(n=>({id:id(n),occurredAt:"2026-09-27T00:00:00.000123Z",version:n,operation:"patch",actor:id(5),changedFields:["name"]})));
  f.admission.projection.views = ["versions"];
  expect(await f.service.describe(f.input)).toBeNull();
  Object.assign(f.provider,{versions});
  f.admission.projection.defaultView = "versions";
  expect(await f.service.describe(f.input)).toMatchObject({views:["versions"],defaultView:"versions"});
  const page = await f.service.page({...f.input,view:"versions"});
  expect(f.policy.resolve).toHaveBeenLastCalledWith(expect.objectContaining({action:"versions_read"}));
  expect(page.items).toHaveLength(2);
  await expect(f.service.page({...f.input,cursor:page.nextCursor})).rejects.toMatchObject({code:"ACTIVITY_CURSOR_INVALID"});
  await f.service.page({...f.input,view:"versions",cursor:page.nextCursor});
  expect(versions).toHaveBeenCalledTimes(2);
});

it("rejects comparing a snapshot with itself before invoking a provider", async () => {
  const f = fixture();
  await expect(f.service.compare({ ...f.input, from: id(1), to: id(1) })).rejects.toMatchObject({ code: "ACTIVITY_INPUT_INVALID" });
  expect(f.provider.compare).not.toHaveBeenCalled();
});

function collectionFixture() {
 const f=fixture();
 Object.assign(f.admission.binding,{collections:[{definition:{key:'lines'}}]});
 const result={key:'lines',label:'Lines',snapshotId:id(1),capturedAt:'2026-09-28T00:00:00Z',notes:[],items:[1,2,3].map(n=>({id:id(n),fields:[]}))};
 const read=vi.fn(async()=>result);
 const compare=vi.fn(async()=>({...result,from:id(1),to:id(2),counts:{added:0,removed:0,replaced:0,updated:0,unchanged:3},items:result.items.map(row=>({...row,change:'unchanged' as const,beforePresence:'present' as const,afterPresence:'present' as const,valueComparison:'same_record' as const}))}));
 Object.assign(f.provider,{collection:read,compareCollection:compare});
 return {...f,result,read,compare,request:{...f.input,key:'lines',id:id(1)}};
}
it('pages only after current authorization and pins the complete projection to cursor scope',async()=>{
 const f=collectionFixture();const first=await f.service.collection(f.request);
 expect(first.items).toHaveLength(2);expect(first.totalItems).toBe(3);
 const second=await f.service.collection({...f.request,cursor:first.nextCursor});expect(second.items).toHaveLength(1);
 expect(f.read).toHaveBeenCalledTimes(2);expect(f.policy.resolve).toHaveBeenLastCalledWith(expect.objectContaining({action:'snapshots_read'}));
 for(const patch of [{id:id(2)},{context:{...f.input.context,tenantId:id(9)}},{context:{...f.input.context,principalId:id(9)}},{context:{...f.input.context,planeKey:'mesh'}},{context:{...f.input.context,authEpoch:2}},{recordId:id(9)}]) await expect(f.service.collection({...f.request,...patch,cursor:first.nextCursor})).rejects.toMatchObject({code:'ACTIVITY_CURSOR_INVALID'});
 f.result.items.pop();await expect(f.service.collection({...f.request,cursor:first.nextCursor})).rejects.toMatchObject({code:'ACTIVITY_CURSOR_INVALID'});
});
it('rejects expired/tampered cursors, missing bindings and missing collection providers',async()=>{
 const f=collectionFixture();const first=await f.service.collection(f.request);
 await expect(f.service.collection({...f.request,cursor:first.nextCursor+'x'})).rejects.toMatchObject({code:'ACTIVITY_CURSOR_INVALID'});
 f.setClock('2026-09-28T02:00:00Z');await expect(f.service.collection({...f.request,cursor:first.nextCursor})).rejects.toMatchObject({code:'ACTIVITY_CURSOR_INVALID'});
 await expect(f.service.collection({...f.request,key:'unknown'})).rejects.toMatchObject({status:404});
 delete (f.provider as EntityActivityProvider).collection;await expect(f.service.collection(f.request)).rejects.toMatchObject({status:503});
});
it('authorizes comparison separately, rejects equal snapshots and does not reuse read cursors',async()=>{
 const f=collectionFixture();const first=await f.service.collection(f.request);
 const request={...f.request,from:id(1),to:id(2)};
 const compared=await f.service.compareCollection(request);expect(compared.items).toHaveLength(2);
 expect(f.policy.resolve).toHaveBeenLastCalledWith(expect.objectContaining({action:'snapshots_compare'}));
 await expect(f.service.compareCollection({...request,cursor:first.nextCursor})).rejects.toMatchObject({code:'ACTIVITY_CURSOR_INVALID'});
 await expect(f.service.compareCollection({...request,to:id(1)})).rejects.toMatchObject({status:400});
 f.policy.resolve.mockRejectedValue(new EntityCapabilityPolicyError());f.compare.mockClear();await expect(f.service.compareCollection(request)).rejects.toThrow();expect(f.compare).not.toHaveBeenCalled();
});

it("timeline paging pins authorized sources and event filters without losing source identities", async()=>{
 const f=fixture();
 Object.assign(f.provider,{timeline:vi.fn(async()=>[1,2,3].map(n=>({id:`audit:${id(n)}`,occurredAt:"2026-09-27T00:00:00.000123Z",event:"record.changed",operation:"patch",outcome:"success",actor:null,changedFields:[],source:"audit" as const})))});
 const input={...f.input,view:"timeline" as const,filters:{event:"record.changed",outcome:"success" as const}};
 const first=await f.service.page(input);
 expect(f.policy.resolve).toHaveBeenLastCalledWith(expect.objectContaining({action:"timeline_query"}));
 await f.service.page({...input,cursor:first.nextCursor});
 await expect(f.service.page({...input,filters:{event:"other"},cursor:first.nextCursor})).rejects.toMatchObject({code:"ACTIVITY_CURSOR_INVALID"});
 f.admission.projection.actions.push({key:"snapshots_read"});
 await expect(f.service.page({...input,cursor:first.nextCursor})).rejects.toMatchObject({code:"ACTIVITY_CURSOR_INVALID"});
 await expect(f.service.page({...input,filters:{actor:"not-a-principal"}})).rejects.toMatchObject({code:"ACTIVITY_FILTER_INVALID"});
});

it("enforces calendar boundaries and binds custom ranges to pagination",async()=>{
 const f=fixture();
 const range={period:"custom" as const,timeZone:"Asia/Kuala_Lumpur",startDate:"2026-09-01",endDate:"2026-09-02"};
 const first=await f.service.page({...f.input,range});
 expect(f.provider.audit.mock.calls[0]![2]).toMatchObject({from:"2026-08-31T16:00:00.000Z",until:"2026-09-02T15:59:59.999999Z"});
 f.setClock("2026-09-28T00:01:00Z");
 await f.service.page({...f.input,range,cursor:first.nextCursor});
 expect(f.provider.audit.mock.calls[1]![2]).toMatchObject({from:"2026-08-31T16:00:00.000Z",until:"2026-09-02T15:59:59.999999Z"});
 await expect(f.service.page({...f.input,range:{...range,endDate:"2026-09-03"},cursor:first.nextCursor})).rejects.toMatchObject({code:"ACTIVITY_CURSOR_INVALID"});
 for(const invalid of [{...range,endDate:"2026-10-01"},{...range,startDate:"2026-01-01"},{...range,timeZone:"invalid"}]) await expect(f.service.page({...f.input,range:invalid})).rejects.toMatchObject({code:"ACTIVITY_RANGE_INVALID"});
});
