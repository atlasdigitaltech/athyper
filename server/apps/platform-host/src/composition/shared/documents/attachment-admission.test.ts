import { expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createEntityAttachmentAdmission } from "./attachment-admission.js";

const context = {
  tenantId: "tenant",
  principalId: "reader",
  planeKey: "neon",
} as VerifiedRequestContext;
it.each(["content.item", "atlas.prompt"])(
  "passes only stored %s ownership to the owner authority",
  async (entityType) => {
    const authorizeOwner = vi.fn(async () => false);
    const admit = createEntityAttachmentAdmission({
      load: async () => ({
        entity_type: entityType,
        entity_id: "stored-owner",
        uploaded_by: "uploader",
        has_record_link: true,
        draft_id: null,
        comment_id: null,
        admitted_policy_hash: "policy",
        content_type: "text/plain",
        size_bytes: "10",
      }),
      ownsDraft: async () => false,
      resolve: vi.fn(),
      authorizeOwner,
    });
    await expect(
      admit(context, "download", {
        attachmentId: "file",
        uploadedBy: "reader",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(authorizeOwner).toHaveBeenCalledWith({
      context,
      entityType,
      entityId: "stored-owner",
      action: "download",
      uploadedBy: "uploader",
      attachmentId: "file",
    });
    authorizeOwner.mockClear();
    await expect(
      admit(context, "download", {
        attachmentId: "file",
        entityType,
        entityId: "forged-owner",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(authorizeOwner).not.toHaveBeenCalled();
  },
);
