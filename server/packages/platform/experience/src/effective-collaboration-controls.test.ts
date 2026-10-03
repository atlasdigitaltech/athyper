import { resolveSourcePath } from "../../../../../tooling/scripts/metadata/source-workspace.mjs";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { capabilityArtifactMembers, type EntityCapabilityAuthoringMember } from "@athyper/server-contract-publication";
import type { PinnedCompiledEntityReader } from "@athyper/server-platform-metadata";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createEntityCapabilityPolicy } from "./entity-capability-policy.js";
import { resolveEffectiveCollaborationControls, type CollaborationOperationalControls } from "./effective-collaboration-controls.js";

const members = JSON.parse(readFileSync(resolveSourcePath(new URL("../../../../../metadata/entities/country/capabilities.json", import.meta.url)), "utf8")) as EntityCapabilityAuthoringMember[];
const mapped = capabilityArtifactMembers("country", members);
const files = mapped.operationBindings.attachmentBinding!;
const comments = mapped.operationBindings.commentBinding!;
describe("effective collaboration controls", () => {
  it("restricts ceilings and allow-lists without mutating published metadata", () => {
    const result = resolveEffectiveCollaborationControls(files, { revision: "1", maxFileBytes: 1024, maxBatchCount: 1, allowedContentTypes: ["text/plain", "unpublished/type"] });
    expect(result).toMatchObject({ maxFileBytes: 1024, maxBatchCount: 1, allowedContentTypes: ["text/plain"], scanRequired: true });
    expect(resolveEffectiveCollaborationControls(files, { revision: "2", maxFileBytes: 999999999 })).toMatchObject({ maxFileBytes: 5242880 });
    expect(files).toMatchObject({ maxFileBytes: 5242880, maxBatchCount: 3 });
  });
  it("restricts features and counts, and never rewrites an invalid default audience", () => {
    expect(resolveEffectiveCollaborationControls(comments, { revision: "1", maxAttachments: 0, maxTextLength: 12, features: { mentions: false } })).toMatchObject({ maxTextLength: 12, attachments: { maxCount: 0 }, features: { mentions: false } });
    const remaining = "allowedAudiences" in comments ? comments.allowedAudiences.filter(a => a !== comments.defaultAudience) : [];
    expect(() => resolveEffectiveCollaborationControls(comments, { revision: "1", allowedAudiences: remaining })).toThrow("default audience");
  });
  it.each([-1, NaN, Infinity, 1.5])("rejects invalid ceiling %s", limit => {
    expect(() => resolveEffectiveCollaborationControls(files, { revision: "1", maxFileBytes: limit })).toThrow();
  });
  it("treats zero as zero, not unlimited", () => {
    expect(resolveEffectiveCollaborationControls(files, { revision: "1", maxFileBytes: 0 })).toMatchObject({ maxFileBytes: 0 });
  });
  it("projects and enforces the same current ceiling across initiation and finalization", async () => {
    let controls: CollaborationOperationalControls = { revision: "before", maxFileBytes: 100 };
    const coordinate = { tenantId: "tenant", principalId: "actor", planeKey: "neon", entityCode: "country" };
    const reader = { resolve: async () => ({ coordinate, release: { releaseHash: "release" } }),
      core: async () => ({ content: { capabilities: mapped.capabilities } }),
      operation: async () => ({ artifactHash: "policy", content: mapped.operationBindings }),
    } as unknown as PinnedCompiledEntityReader;
    const policy = createEntityCapabilityPolicy({ reader, authorizer: { authorize: async () => ({ allowed: true }) },
      authorizeParent: async () => true, operationalControls: async () => controls });
    const input = { context: coordinate as unknown as VerifiedRequestContext, entityCode: "country", recordId: "record", kind: "attachments" as const,
      action: "read", input: { sizeBytes: 99, contentType: "text/plain", idempotencyKey: "fixture-key" } };
    expect((await policy.resolve(input)).projection).toMatchObject({ maxFileBytes: 100, configurationRevision: "before" });
    await expect(policy.resolve({ ...input, action: "create" })).resolves.toBeDefined();
    controls = { revision: "after", maxFileBytes: 50 };
    expect((await policy.resolve(input)).projection).toMatchObject({ maxFileBytes: 50, configurationRevision: "after" });
    await expect(policy.resolve({ ...input, action: "finalize" })).rejects.toMatchObject({ code: "ENTITY_CAPABILITY_DENIED" });
    await expect(policy.resolve({ ...input, action: "download" })).resolves.toBeDefined();
    await expect(policy.resolve({ ...input, action: "create", input: { ...input.input, sizeBytes: 25, batchCount: 4 } })).rejects.toMatchObject({ code: "ENTITY_CAPABILITY_DENIED" });
    for (const restriction of [{ maxFileBytes: 0 }, { maxBatchCount: 0 }]) {
      controls = { revision: "disabled", ...restriction };
      for (const action of ["create", "version", "finalize"]) for (const value of [input.input, { idempotencyKey: "fixture-key" }])
        await expect(policy.resolve({ ...input, action, input: value })).rejects.toMatchObject({ code: "ENTITY_CAPABILITY_DENIED" });
      await expect(policy.resolve({ ...input, action: "download" })).resolves.toBeDefined();
    }
    controls = { revision: "comment-restrictions", maxTextLength: 0, maxAttachments: 0 };
    const commentInput = { ...input, kind: "comments" as const, action: "create", input: { idempotencyKey: "fixture-key", visibility: "private" } };
    await expect(policy.resolve({ ...commentInput, input: {...commentInput.input, text: "x"} })).rejects.toMatchObject({code:"ENTITY_CAPABILITY_DENIED"});
    await expect(policy.resolve({ ...commentInput, input: {...commentInput.input, attachmentIds: ["file"]} })).rejects.toMatchObject({code:"ENTITY_CAPABILITY_DENIED"});
    // Zero text/file counts are independent restrictions, not a blanket ban on
    // comment actions. The comment service separately validates nonempty content.
    await expect(policy.resolve(commentInput)).resolves.toBeDefined();
    await expect(policy.resolve({...commentInput,input:{...commentInput.input,text:"",attachmentIds:[]}})).resolves.toBeDefined();
  });
});
