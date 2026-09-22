import { describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createEntityAttachmentAdmission } from "../entity-attachment-admission.js";

const context = {
  principalId: "author",
  tenantId: "tenant",
  planeKey: "neon",
} as VerifiedRequestContext;
function fixture() {
  const load = vi.fn(async () => ({
    entity_type: "business_partner",
    entity_id: "record",
    admitted_policy_hash: "policy",
    content_type: "image/png",
    size_bytes: "10",
    draft_id: null as string | null,
    uploaded_by: "author",
    has_record_link: true,
    comment_id: null as string | null,
  }));
  const ownsDraft = vi.fn(async () => true);
  const resolve = vi.fn(async (_input: unknown) => ({
    releaseHash: "release",
    policyHash: "policy",
  }));
  return {
    load,
    ownsDraft,
    resolve,
    admit: createEntityAttachmentAdmission({ load, ownsDraft, resolve }),
  };
}
describe("entity attachment admission", () => {
  it("returns only the stored, policy-authorized comment for preview delivery",async()=>{
    const f=fixture();const row=await f.load();f.load.mockResolvedValue({...row,has_record_link:false,comment_id:"stored-comment"});
    const result=await f.admit(context,"preview",{attachmentId:"file",commentId:"forged-comment"});
    expect(result).toMatchObject({commentId:"stored-comment",entityType:"business_partner",entityId:"record"});
    expect(f.resolve).toHaveBeenCalledWith(expect.objectContaining({input:expect.objectContaining({commentId:"stored-comment"})}));
  });
  it("loads the existing parent for a new version and evaluates the new bytes", async () => {
    const f = fixture();
    await f.admit(context, "version", {
      attachmentId: "new",
      parentAttachmentId: "old",
      expectedSeriesVersion: 1,
      contentType: "application/pdf",
      sizeBytes: 999,
    });
    expect(f.load).toHaveBeenCalledWith(context, "old");
    expect(f.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          attachmentId: "old",
          contentType: "application/pdf",
          sizeBytes: 999,
        }),
      }),
    );
  });
  it.each(["category", "folder", "version"])(
    "rejects %s mutation of a different record",
    async (action) => {
      const f = fixture();
      await expect(
        f.admit(context, action, {
          attachmentId: "file",
          parentAttachmentId: "old",
          entityType: "business_partner",
          entityId: "other",
        }),
      ).rejects.toMatchObject({ code: "ENTITY_CAPABILITY_DENIED" });
      expect(f.resolve).not.toHaveBeenCalled();
    },
  );
  it("uses stored comment evidence and never caller-nominated audience evidence", async () => {
    const f = fixture();
    await f.admit(context, "download", {
      attachmentId: "file",
      commentId: "public-comment",
    });
    expect(f.resolve.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        input: expect.not.objectContaining({ commentId: expect.anything() }),
      }),
    );
  });
  it("denies another author's draft and expired draft staging", async () => {
    const f = fixture();
    f.load.mockResolvedValueOnce({
      entity_type: "business_partner",
      entity_id: "record",
      admitted_policy_hash: "policy",
      content_type: "image/png",
      size_bytes: "10",
      draft_id: "draft",
      uploaded_by: "other",
      has_record_link: true,
      comment_id: null,
    });
    await expect(
      f.admit(context, "download", { attachmentId: "file" }),
    ).rejects.toMatchObject({ statusCode: 403 });
    f.ownsDraft.mockResolvedValue(false);
    await expect(
      f.admit(context, "create", {
        attachmentId: "new",
        entityType: "business_partner",
        entityId: "record",
        draftId: "expired",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(f.resolve).not.toHaveBeenCalled();
  });
  it("denies an unlinked attachment to a different record participant", async () => {
    const f = fixture();
    f.load.mockResolvedValue({
      entity_type: "business_partner",
      entity_id: "record",
      admitted_policy_hash: "policy",
      content_type: "image/png",
      size_bytes: "10",
      draft_id: null,
      uploaded_by: "other",
      comment_id: null,
      has_record_link: false,
    });
    await expect(
      f.admit(context, "download", { attachmentId: "file" }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(f.resolve).not.toHaveBeenCalled();
  });
  it("rejects finalization after policy replacement", async () => {
    const f = fixture();
    f.resolve.mockResolvedValue({
      releaseHash: "new-release",
      policyHash: "new-policy",
    });
    await expect(
      f.admit(context, "finalize", { attachmentId: "file" }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
