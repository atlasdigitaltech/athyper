import { readFileSync } from "node:fs";
import ts from "typescript";
import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { createCapabilityQualification } from "../shared/publication/capability-qualification.js";

function fixture() {
  const entityCode = "test_dictionary";
  const member = { capabilityKey: "attachments", declaration: { enabled: true, serviceKey: "platform.attachments.v1", ownerEntityCode: entityCode, load: "lazy" },
    binding: { schemaVersion: 1, serviceKey: "platform.attachments.v1", ownerEntityCode: entityCode, admissionResolverKey: "platform.records.admission.v1", layouts: ["drawer"],
      actions: ["read", "create", "finalize", "download", "archive"].map(key => ({ key, permissionCode: `common.collaboration.attachment.${key}`,
        handlerKey: `platform.attachments.${key}.v1`, concurrency: "none", idempotency: ["create", "finalize"].includes(key) ? "required" : "none" })),
      maxFileBytes: 5242880, maxBatchCount: 3, allowedContentTypes: ["text/plain"], scanRequired: true, linkKinds: ["context"], categories: [],
      folders: false, versioning: false, rename: false, duplicateBehavior: "reject", unlink: "association_only", download: "short_lived_authorized_url",
      processing: { preview: false, extraction: false, search: false, renditions: [] } } };
  const target = { targetPlane: "neon", graph: { entity: { entityCode }, capabilities: [member] } } as unknown as Parameters<ReturnType<typeof createCapabilityQualification>>[0];
  const query = vi.fn(async (_text: string) => ({ rows: [{ id: "present" }] }));
  const database = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: { connect: async () => ({ query, release() {} }), end: async () => {} } as never }) });
  const providers = { parentRead: true, resourceHeader: true, section: vi.fn(() => ({ read: vi.fn() })),
    attachments: { stage: vi.fn(), finalize: vi.fn(), createAuthorizedDownload: vi.fn(), archive: vi.fn() },
    storage: { validateAccess: vi.fn(async () => {}) }, scanner: { health: vi.fn(async () => ({ status: "healthy" })) } };
  const qualify = createCapabilityQualification({ databases: { neon: database }, providers: () => providers });
  return { target, member, query, database, providers, qualify };
}
it("qualifies actual actions, target catalog/RLS prerequisites and live infrastructure probes", async () => {
  const f = fixture();
  try {
    await f.qualify(f.target);
    expect(f.providers.storage.validateAccess).toHaveBeenCalledOnce(); expect(f.providers.scanner.health).toHaveBeenCalledOnce();
    expect(f.query.mock.calls.filter(([s]) => s.includes("canonical_code=")).length).toBe(5);
    expect(f.query.mock.calls.filter(([s]) => s.includes("c.relrowsecurity")).length).toBe(3);
    expect(f.query.mock.calls.some(([s]) => s.includes("SET TRANSACTION READ ONLY"))).toBe(true);
  } finally { await f.database.destroy(); }
});
it.each(["parentRead", "resourceHeader"] as const)("denies missing %s before probing", async key => {
  const f = fixture(); f.providers[key] = false;
  try { await expect(f.qualify(f.target)).rejects.toThrow("PARENT_UNAVAILABLE"); expect(f.query).not.toHaveBeenCalled(); }
  finally { await f.database.destroy(); }
});
it.each(["handler", "catalog", "persistence", "storage", "scanner", "feature", "section"])("denies unavailable %s", async gap => {
  const f = fixture();
  if (gap === "handler") f.member.binding.actions[1]!.handlerKey = "unregistered.handler.v1";
  if (gap === "catalog") f.query.mockImplementation(async text => ({ rows: text.includes("authz.permission") ? [] : [{ id: "present" }] }));
  if (gap === "persistence") f.query.mockImplementation(async text => ({ rows: text.includes("pg_class") ? [] : [{ id: "present" }] }));
  if (gap === "storage") f.providers.storage.validateAccess.mockRejectedValue(Error("storage denied"));
  if (gap === "scanner") f.providers.scanner.health.mockResolvedValue({ status: "unhealthy" });
  if (gap === "feature") f.member.binding.processing.preview = true;
  if (gap === "section") f.providers.section.mockReturnValue({ read: undefined } as never);
  const reasons: Record<string, string> = { handler: "ENTITY_CAPABILITY_INVALID", catalog: "PERMISSION_UNAVAILABLE", persistence: "PERSISTENCE_UNAVAILABLE", storage: "storage denied", scanner: "SCANNER_UNAVAILABLE", feature: "missing preview action", section: "SECTION_UNAVAILABLE" };
  try { await expect(f.qualify(f.target)).rejects.toThrow(gap === "handler" ? /handlerKey|HANDLER_UNAVAILABLE/ : reasons[gap]); }
  finally { await f.database.destroy(); }
});
it("enforces a product-free import boundary", () => {
  const text = readFileSync(new URL("../shared/publication/capability-qualification.ts", import.meta.url), "utf8");
  const allowed = new Set(["kysely", "@athyper/server-contract-publication", "@athyper/server-plane-studio-meta-entity-authoring"]);
  const ast = ts.createSourceFile("qualification.ts", text, ts.ScriptTarget.Latest, true);
  for (const node of ast.statements) if (ts.isImportDeclaration(node)) expect(allowed.has((node.moduleSpecifier as ts.StringLiteral).text)).toBe(true);
  expect(text).not.toMatch(/country|currency|business_partner/);
});

it.each(["studio", "neon", "mesh"] as const)("qualifies advanced signed-source prerequisites on %s and fails closed without processing", async plane => {
  const f = fixture();
  const members = JSON.parse(readFileSync(new URL("../../../../../../metadata/products/shared/entities/country/capabilities.json", import.meta.url), "utf8"));
  for (const member of members) {
    member.declaration.ownerEntityCode = member.binding.ownerEntityCode = "test_dictionary";
    if (member.binding.attachments) member.binding.attachments.bindingRef = "test_dictionary/operation#attachmentBinding";
  }
  f.target.graph.capabilities = members;
  const target = { ...f.target, targetPlane: plane };
  const fn = () => vi.fn();
  const providers = { ...f.providers,
    comments: { create:fn(),edit:fn(),remove:fn(),putReaction:fn(),deleteReaction:fn(),putDraft:fn(),deleteDraft:fn(),flag:fn(),participants:fn(),history:fn() },
    attachments: { ...f.providers.attachments, status:fn(),rename:fn(),manageFolder:fn(),unlink:fn() },
    discovery: {preview:fn(),extract:fn(),search:fn()},
    processing: {qualifyPreview:vi.fn(async()=>{}),qualifyExtraction:vi.fn(async()=>{})},
  };
  f.query.mockImplementation(async text => ({ rows: text.includes("lookup_value_is_active") ? [{active:true}] as never
    : text.includes("pg_trigger") ? ["comment_revision_capture","comment_revision_number","comment_revision_immutable"].map(name=>({name})) as never : [{id:"present"}] }));
  const qualify = createCapabilityQualification({ databases:{[plane]:f.database},providers:()=>providers });
  try {
    await qualify(target);
    expect(providers.processing.qualifyPreview).toHaveBeenCalledOnce();
    expect(providers.processing.qualifyExtraction).toHaveBeenCalledOnce();
    expect(f.query.mock.calls.some(([text])=>text.includes("extracted_text_chars"))).toBe(true);
    expect(f.query.mock.calls.some(([text])=>text.includes("source_sha256"))).toBe(true);
    providers.processing.qualifyPreview.mockRejectedValue(Error("conversion failed"));
    await expect(qualify(target)).rejects.toThrow("conversion failed");
    providers.processing.qualifyPreview.mockResolvedValue();
    providers.processing.qualifyExtraction.mockRejectedValue(Error("extraction failed"));
    await expect(qualify(target)).rejects.toThrow("extraction failed");
    providers.processing.qualifyExtraction.mockResolvedValue();
    providers.comments.participants = undefined as never;
    await expect(qualify(target)).rejects.toThrow("HANDLER_UNAVAILABLE");
  } finally { await f.database.destroy(); }
});

it.each([true, false])("checks global comment lookup defaults rather than inventing tables (available=%s)", async available => {
  const f = fixture();
  const entityCode = "test_dictionary";
  const comment = { capabilityKey: "comments", declaration: { enabled: true, serviceKey: "platform.comments.v1", ownerEntityCode: entityCode, load: "lazy" },
    binding: { schemaVersion: 1, serviceKey: "platform.comments.v1", ownerEntityCode: entityCode, admissionResolverKey: "platform.records.admission.v1", layouts: ["drawer"],
      actions: [{ key: "read", permissionCode: "common.collaboration.comment.read", handlerKey: "platform.comments.read.v1", concurrency: "none", idempotency: "none" }],
      richTextSchema: "athyper.rich-text/1.0", maxTextLength: 5000, maxDepth: 0, allowedAudiences: ["private"], defaultAudience: "private",
      features: { replies: false, edits: false, reactions: false, mentions: false, drafts: false, reporting: false, history: false },
      reactionCodes: [], attachments: { allowed: false, maxCount: 0, pinVersion: true } } };
  f.target.graph.capabilities = [comment] as never;
  f.query.mockImplementation(async text => ({ rows: text.includes("lookup_value_is_active") ? [{ active: available }] as never
    : text.includes("pg_trigger") ? ["comment_revision_capture", "comment_revision_number", "comment_revision_immutable"].map(name => ({ name })) as never
    : [{ id: "present" }] }));
  try {
    if (available) await expect(f.qualify(f.target)).resolves.toBeUndefined();
    else await expect(f.qualify(f.target)).rejects.toThrow("LOOKUP_UNAVAILABLE");
    expect(f.query.mock.calls.some(([s]) => s.includes("lookup_value_is_active('document.comment_intent'"))).toBe(true);
    expect(f.providers.storage.validateAccess).not.toHaveBeenCalled();
    if (available) {
      expect(f.query.mock.calls.filter(([s]) => s.includes("c.relrowsecurity")).every(([s]) => !s.includes("'INSERT'") && !s.includes("'UPDATE'"))).toBe(true);
      f.query.mockImplementation(async text => ({ rows: text.includes("lookup_value_is_active") ? [{ active: true }] as never : [] }));
      await expect(f.qualify(f.target)).rejects.toThrow("REVISION_INTEGRITY_UNAVAILABLE");
    }
  } finally { await f.database.destroy(); }
});
