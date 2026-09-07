import { describe, expect, it, vi } from "vitest";
import type { AuditEvent, AuditRecordInput } from "@athyper/server-contract-audit";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { DocumentArtifactRepository, GeneratedDocument, PublishedDocumentTemplate } from "@athyper/server-contract-documents";
import type { OutboxEventInput } from "@athyper/server-contract-events";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { MalwareScannerUnavailableError } from "@athyper/server-contract-malware-scanning";
import type { PlaneKey } from "@athyper/server-foundation/context";
import type { DocumentServiceOptions } from "../document-service.js";
import { createDocumentService, renderStrictHandlebars } from "../index.js";

const ids={ tenant:"11111111-1111-4111-8111-111111111111", principal:"22222222-2222-4222-8222-222222222222", entity:"33333333-3333-4333-8333-333333333333", document:"44444444-4444-4444-8444-444444444444", template:"55555555-5555-4555-8555-555555555555", version:"66666666-6666-4666-8666-666666666666", binding:"77777777-7777-4777-8777-777777777777" };
const template: PublishedDocumentTemplate={ bindingId:ids.binding, templateId:ids.template, templateVersionId:ids.version, version:3, checksum:"a".repeat(64), name:"Purchase order", engine:"handlebars", locale:"en", variant:"default", html:"<h1>{{document.number}}</h1><p>{{supplier.name}}</p>", stylesCss:"h1{color:#111}", variablesSchema:{ required:["document","supplier"] }, renderOptions:{ format:"A4",headerHtml:"<span>{{document.number}}</span>" } };

describe("document delivery service",()=>{
  for(const planeKey of ["studio","neon","mesh"] as const) it(`renders, persists, publishes, audits, and downloads on ${planeKey}`,async()=>{
    const objects=new Map<string,Uint8Array>(); const audit:AuditEvent[]=[]; const events:OutboxEventInput[]=[]; const scheduled:string[]=[]; const saved=new Map<string,GeneratedDocument & {storageKey:string}>();
    const artifacts=memoryArtifacts(saved); const service=createDocumentService({ metadata:{ getEntityDescriptor:async()=>descriptor(planeKey) }, authorizer:{ authorize:async()=>({allowed:true}) }, audit:{record:async(input)=>{const event=auditEvent(input,audit.length);audit.push(event);return event;}}, outbox:{append:async(event)=>{events.push(event);}}, templates:{resolvePublished:async()=>template}, artifacts, transactions:{run:async(_plane,_actor,work)=>work({})}, renderer:{renderPdf:async(request)=>{expect(request.html).toContain("PO-42");expect(request.html).toContain("A &amp; B");expect(request.options?.headerHtml).toContain("PO-42");return {bytes:new TextEncoder().encode("%PDF-1.7 generated"),mediaType:"application/pdf",provider:"test",durationMs:7};}}, malwareScanner:cleanScanner(), extractionScheduler:{schedule:async(request)=>{scheduled.push(request.attachmentId);}}, storage:{put:async(key,body)=>{objects.set(key,typeof body==="string"?new TextEncoder().encode(body):body);},get:async(key)=>objects.get(key)!,delete:async(key)=>{objects.delete(key);},exists:async(key)=>objects.has(key),createDownloadUrl:async(key)=>`https://objects.example/${key}`}, storageBucket:"documents", createId:()=>ids.document, now:()=>new Date("2026-08-09T00:00:00Z") });
    const generated=await service.render({context:context(planeKey),entityType:"purchase_order",entityId:ids.entity,operationCode:"print",data:{document:{number:"PO-42"},supplier:{name:"A & B"}}});
    expect(generated).toMatchObject({id:ids.document,templateVersion:3,sizeBytes:18}); expect(objects.size).toBe(1); expect(events).toHaveLength(1); expect(scheduled).toEqual([ids.document]); expect(audit[0]?.eventCode).toBe("documents.artifact.rendered");
    await expect(service.createDownload({context:context(planeKey),documentId:ids.document})).resolves.toMatchObject({document:{id:ids.document},expiresInSeconds:300,url:expect.stringContaining("https://objects.example/generated/")});
    expect(audit.map((item)=>item.eventCode)).toEqual(["documents.artifact.rendered","documents.download_url.created"]);
  });

  it("deletes the uploaded object when durable persistence fails",async()=>{ let deleted=false; const service=createDocumentService({metadata:{getEntityDescriptor:async()=>descriptor("mesh")},authorizer:{authorize:async()=>({allowed:true})},audit:{record:async(input)=>auditEvent(input,0)},outbox:{append:async()=>undefined},templates:{resolvePublished:async()=>template},artifacts:{save:async()=>{throw new Error("database unavailable");},findAccessible:async()=>null,findIdempotent:async()=>null},transactions:{run:async(_plane,_actor,work)=>work({})},renderer:{renderPdf:async()=>({bytes:new TextEncoder().encode("%PDF-x"),mediaType:"application/pdf",provider:"test",durationMs:1})},malwareScanner:cleanScanner(),storage:{put:async()=>undefined,get:async()=>new Uint8Array(),delete:async()=>{deleted=true;},exists:async()=>false,createDownloadUrl:async()=>""},storageBucket:"documents",createId:()=>ids.document}); await expect(service.render({context:context("mesh"),entityType:"purchase_order",entityId:ids.entity,operationCode:"print",data:{document:{number:"1"},supplier:{name:"A"}}})).rejects.toThrow("database unavailable"); expect(deleted).toBe(true); });



  it("rejects infected rendered bytes before object storage",async()=>{let uploads=0;const service=createDocumentService({metadata:{getEntityDescriptor:async()=>descriptor("neon")},authorizer:{authorize:async()=>({allowed:true})},audit:{record:async(input)=>auditEvent(input,0)},outbox:{append:async()=>undefined},templates:{resolvePublished:async()=>template},artifacts:memoryArtifacts(new Map()),transactions:{run:async(_plane,_actor,work)=>work({})},renderer:{renderPdf:async()=>({bytes:new TextEncoder().encode("%PDF-infected"),mediaType:"application/pdf",provider:"test",durationMs:1})},malwareScanner:{scan:async()=>({status:"infected",scanner:"clamav",threatNames:["Eicar-Signature"],scannedAt:"2026-08-09T00:00:00.000Z",durationMs:2})},storage:{put:async()=>{uploads++;},get:async()=>new Uint8Array(),delete:async()=>undefined,exists:async()=>false,createDownloadUrl:async()=>""},storageBucket:"documents"});await expect(service.render({context:context("neon"),entityType:"purchase_order",entityId:ids.entity,operationCode:"print",data:{document:{number:"1"},supplier:{name:"A"}}})).rejects.toMatchObject({statusCode:422,code:"DOCUMENT_MALWARE_DETECTED"});expect(uploads).toBe(0);});

  it("fails closed when the malware scanner is unavailable",async()=>{let uploads=0;const service=createDocumentService({metadata:{getEntityDescriptor:async()=>descriptor("mesh")},authorizer:{authorize:async()=>({allowed:true})},audit:{record:async(input)=>auditEvent(input,0)},outbox:{append:async()=>undefined},templates:{resolvePublished:async()=>template},artifacts:memoryArtifacts(new Map()),transactions:{run:async(_plane,_actor,work)=>work({})},renderer:{renderPdf:async()=>({bytes:new TextEncoder().encode("%PDF-clean"),mediaType:"application/pdf",provider:"test",durationMs:1})},malwareScanner:{scan:async()=>{throw new MalwareScannerUnavailableError();}},storage:{put:async()=>{uploads++;},get:async()=>new Uint8Array(),delete:async()=>undefined,exists:async()=>false,createDownloadUrl:async()=>""},storageBucket:"documents"});await expect(service.render({context:context("mesh"),entityType:"purchase_order",entityId:ids.entity,operationCode:"print",data:{document:{number:"1"},supplier:{name:"A"}}})).rejects.toMatchObject({statusCode:503,code:"MALWARE_SCANNER_UNAVAILABLE"});expect(uploads).toBe(0);});
});

describe("strict template rendering",()=>{ it("escapes scalar values and rejects executable/raw syntax",()=>{ expect(renderStrictHandlebars("<b>{{name}}</b>",{name:"<script>"})).toBe("<b>&lt;script&gt;</b>"); expect(()=>renderStrictHandlebars("{{{name}}}",{name:"unsafe"})).toThrow("Raw values"); expect(()=>renderStrictHandlebars("{{#each lines}}{{name}}{{/each}}",{lines:[]})).toThrow("helpers"); }); });

function context(planeKey:PlaneKey):VerifiedRequestContext{return {planeKey,realmKey:"athyper",tenantId:ids.tenant,principalId:ids.principal,authEpoch:1,profileHash:"profile",requestId:"request-1",permissions:{planeKey,tenantId:ids.tenant,principalId:ids.principal,principalFingerprint:"fp",profileHash:"profile",schemaHash:"schema",resolvedAt:1,allowed:["documents.render","documents.download"],denied:[],planLocked:[],planeExcluded:[],entries:[],authorizationScopes:[]}};}
function descriptor(planeKey:PlaneKey):EntityRuntimeDescriptor{return {schema:"athyper.entity-runtime-descriptor/1.0",entityCode:"purchase_order",planeKey,releaseId:"release-1",releaseNo:1,contractHash:"a".repeat(64),compiledHash:"b".repeat(64),storage:{schema:"document",object:"purchase_order",idField:"id",tenantField:"tenant_id"},fields:[],operations:{print:{code:"print",permissionCode:"documents.render"}}};}
function memoryArtifacts(store:Map<string,GeneratedDocument & {storageKey:string}>):DocumentArtifactRepository<Record<string,never>>{return {save:async(input)=>{const value={id:input.id,entityType:input.entityType,entityId:input.entityId,fileName:input.fileName,contentType:"application/pdf" as const,sizeBytes:input.sizeBytes,sha256:input.sha256,templateId:input.template.templateId,templateVersionId:input.template.templateVersionId,templateVersion:input.template.version,createdAt:"2026-08-09T00:00:00.000Z",storageKey:input.storageKey};store.set(input.id,value);return value;},findAccessible:async(_context,id)=>store.get(id)??null,findIdempotent:async()=>null};}
function auditEvent(input:AuditRecordInput,sequence:number):AuditEvent{return {...input,id:`audit-${sequence}`,occurredAt:"2026-08-09T00:00:00.000Z",severity:input.severity??"info"};}
function cleanScanner(){return {scan:async()=>({status:"clean" as const,scanner:"clamav",scannedAt:"2026-08-09T00:00:00.000Z",durationMs:2})};}

function harness(overrides: Partial<DocumentServiceOptions<Record<string, never>>> = {}) {
  let stored: (GeneratedDocument & { requestHash?: string }) | null = null;
  const saved = new Map<string, GeneratedDocument & { storageKey: string }>();
  const repository = memoryArtifacts(saved);
  const renderer = { renderPdf: vi.fn(async () => ({ bytes: new TextEncoder().encode("%PDF-x"), mediaType: "application/pdf" as const, provider: "test", durationMs: 1 })) };
  const storage = { put: vi.fn(async () => undefined), get: async () => new Uint8Array(), delete: vi.fn(async () => undefined), exists: async () => true, createDownloadUrl: vi.fn(async () => "https://objects.example/download") };
  const audit = { record: vi.fn(async (input: AuditRecordInput) => auditEvent(input, 0)) };
  const artifacts: DocumentArtifactRepository<Record<string, never>> = {
    ...repository,
    save: async (input, tx) => {
      const { storageKey: _key, ...document } = await repository.save(input, tx) as GeneratedDocument & { storageKey: string };
      stored = { ...document, ...(input.requestHash ? { requestHash: input.requestHash } : {}) };
      return document;
    },
    findIdempotent: async () => stored,
  };
  const service = createDocumentService({ metadata: { getEntityDescriptor: async () => descriptor("neon") }, authorizer: { authorize: async () => ({ allowed: true }) }, audit, outbox: { append: async () => undefined }, templates: { resolvePublished: async () => template }, artifacts, transactions: { run: async (_plane, _actor, work) => work({}) }, renderer, malwareScanner: cleanScanner(), storage, storageBucket: "documents", createId: () => ids.document, ...overrides });
  const command = { context: context("neon"), entityType: "purchase_order", entityId: ids.entity, operationCode: "print", data: { document: { number: "42" }, supplier: { name: "A" } }, idempotencyKey: "request-42" };
  return { service, command, renderer, storage, audit, artifacts };
}

describe("document API regressions", () => {
  it("replays equivalent JSON without exposing the fingerprint", async () => {
    const { service, command, renderer, storage } = harness();
    const first = await service.render(command);
    const replay = await service.render({ ...command, data: { supplier: { name: "A" }, document: { number: "42" } }, variant: "default", locale: "en" });
    expect(replay).toEqual(first);
    expect(replay).not.toHaveProperty("requestHash");
    expect(renderer.renderPdf).toHaveBeenCalledTimes(1);
    expect(storage.put).toHaveBeenCalledTimes(1);
  });
  it.each([
    { entityId: ids.template }, { operationCode: "preview" }, { variant: "compact" },
    { locale: "fr" }, { fileName: "other.pdf" }, { data: { document: { number: "changed" }, supplier: { name: "A" } } },
    { context: { ...context("neon"), principalId: ids.template } },
  ])("rejects a reused key with changed input %j", async (changed) => {
    const published = descriptor("neon");
    const { service, command, renderer } = harness({ metadata: { getEntityDescriptor: async () => ({ ...published, operations: { ...published.operations, preview: { code: "preview", permissionCode: "documents.render" } } }) } });
    await service.render(command);
    await expect(service.render({ ...command, ...changed })).rejects.toMatchObject({ statusCode: 409, code: "IDEMPOTENCY_CONFLICT" });
    expect(renderer.renderPdf).toHaveBeenCalledTimes(1);
  });
  it("rejects legacy replay records without a verifiable fingerprint", async () => {
    const initial = harness();
    const document = await initial.service.render(initial.command);
    const { service, command } = harness({ artifacts: { ...initial.artifacts, findIdempotent: async () => document } });
    await expect(service.render(command)).rejects.toMatchObject({ statusCode: 409 });
  });
  it.each([true, false])("validates the concurrent winner (same request: %s)", async (sameRequest) => {
    const initial = harness();
    await initial.service.render(initial.command);
    const winner = await initial.artifacts.findIdempotent(initial.command.context, "request-42", {});
    let reads = 0;
    const { service, command, storage } = harness({ artifacts: { ...initial.artifacts, save: async () => { throw new Error("unique constraint"); }, findIdempotent: async () => ++reads === 1 ? null : { ...winner!, requestHash: sameRequest ? winner!.requestHash! : "different" } } });
    if (sameRequest) await expect(service.render(command)).resolves.toMatchObject({ id: ids.document });
    else await expect(service.render(command)).rejects.toMatchObject({ statusCode: 409 });
    expect(storage.delete).toHaveBeenCalledTimes(1);
  });
  it("checks download authorization against the linked entity before signing", async () => {
    const authorize = vi.fn(async (request: { permissionCode: string; resource?: Readonly<Record<string, unknown>> }) => (request.permissionCode !== "documents.download" ? { allowed: true as const } : { allowed: false as const, reason: "record_scope_denied" }));
    const { service, command, storage } = harness({ authorizer: { authorize } });
    await service.render(command);
    await expect(service.createDownload({ context: command.context, documentId: ids.document })).rejects.toMatchObject({ statusCode: 403 });
    expect(authorize).toHaveBeenLastCalledWith(expect.objectContaining({ permissionCode: "documents.download", resource: { tenantId: ids.tenant, resourceCode: "purchase_order", recordId: ids.entity } }));
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
  it("does not delete a committed document when scheduling throws synchronously", async () => {
    const { service, command, storage } = harness({ extractionScheduler: { schedule: () => { throw new Error("scheduler unavailable"); } } });
    await expect(service.render(command)).resolves.toMatchObject({ id: ids.document });
    expect(storage.delete).not.toHaveBeenCalled();
  });
  it("enforces the published operation permission before rendering", async () => {
    const published = descriptor("neon");
    const { service, command, renderer } = harness({
      metadata: { getEntityDescriptor: async () => ({ ...published, operations: { print: { code: "print", permissionCode: "invoice.print" } } }) },
      authorizer: { authorize: async (request) => request.permissionCode === "invoice.print" ? { allowed: false, reason: "denied" } : { allowed: true } },
    });
    await expect(service.render(command)).rejects.toMatchObject({ statusCode: 403 });
    expect(renderer.renderPdf).not.toHaveBeenCalled();
  });
  it.each(["descriptor", "template"])("returns 404 for a missing %s without rendering", async (missing) => {
    const { service, command, renderer } = harness(missing === "descriptor" ? { metadata: { getEntityDescriptor: async () => null } } : { templates: { resolvePublished: async () => null } });
    await expect(service.render(command)).rejects.toMatchObject({ statusCode: 404 });
    expect(renderer.renderPdf).not.toHaveBeenCalled();
  });
  it("rejects inherited operation names", async () => {
    const { service, command } = harness();
    await expect(service.render({ ...command, operationCode: "constructor" })).rejects.toMatchObject({ statusCode: 422, code: "DOCUMENT_OPERATION_NOT_PUBLISHED" });
  });
  it("rejects malformed identifiers before signing", async () => {
    const { service, command, storage } = harness();
    await expect(service.createDownload({ context: command.context, documentId: "bad" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.createDownload({ context: command.context, documentId: ids.document })).rejects.toMatchObject({ statusCode: 404 });
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
  it("allows literal template delimiters in data while still rejecting invalid template syntax", () => {
    expect(renderStrictHandlebars("<p>{{value}}</p>", { value: "{{example}} <b>" })).toBe("<p>{{example}} &lt;b&gt;</p>");
    expect(() => renderStrictHandlebars("{{value unsupported}}", { value: "x" })).toThrow("unsupported syntax");
    expect(() => renderStrictHandlebars("{{value}}", Object.create({ value: "inherited" }) as Record<string, unknown>)).toThrow("Missing template variable");
  });
});
