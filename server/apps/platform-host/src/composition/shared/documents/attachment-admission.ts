import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { EntityCapabilityPolicyError } from "@athyper/server-platform-experience";

export interface AttachmentCapabilitySubject {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly admitted_policy_hash: string;
  readonly content_type: string;
  readonly size_bytes: string;
  readonly draft_id: string | null;
  readonly uploaded_by: string;
  readonly comment_id: string | null;
  readonly has_record_link: boolean;
}

/** Resolve stored ownership before passing any resource identity to policy. */
export function createEntityAttachmentAdmission(options: {
  load(
    context: VerifiedRequestContext,
    attachmentId: string,
  ): Promise<AttachmentCapabilitySubject | undefined>;
  ownsDraft(
    context: VerifiedRequestContext,
    draftId: string,
    entityCode: string,
    recordId: string,
  ): Promise<boolean>;
  resolve(input: {
    context: VerifiedRequestContext;
    entityCode: string;
    recordId: string;
    kind: "attachments";
    action: string;
    input: Readonly<Record<string, unknown>>;
    preflight?: boolean;
  }): Promise<{ releaseHash: string; policyHash: string }>;
}) {
  return async (
    context: VerifiedRequestContext,
    action: string,
    input: Readonly<Record<string, unknown>>,
    mode?: { readonly preflight: boolean },
  ) => {
    let entityCode =
      typeof input.entityType === "string" ? input.entityType : undefined;
    let recordId =
      typeof input.entityId === "string" ? input.entityId : undefined;
    let admittedPolicyHash: string | undefined;
    // Association evidence is always loaded from storage. Never forward a caller's commentId.
    const { commentId: _ignored, ...supplied } = input;
    let currentInput: Readonly<Record<string, unknown>> = supplied;
    const versionUpload =
      action === "version" && typeof input.parentAttachmentId === "string";
    const targetId = versionUpload
      ? input.parentAttachmentId
      : action !== "create"
        ? input.attachmentId
        : undefined;
    if (typeof targetId === "string") {
      const row = await options.load(context, targetId);
      if (!row || (row.draft_id && row.uploaded_by !== context.principalId))
        throw new EntityCapabilityPolicyError();
      if (
        !row.has_record_link &&
        !row.comment_id &&
        row.uploaded_by !== context.principalId
      )
        throw new EntityCapabilityPolicyError();
      // The admitted record must be the same record the subsequent command mutates.
      if (
        (entityCode !== undefined && entityCode !== row.entity_type) ||
        (recordId !== undefined && recordId !== row.entity_id)
      )
        throw new EntityCapabilityPolicyError();
      entityCode = row.entity_type;
      recordId = row.entity_id;
      admittedPolicyHash = row.admitted_policy_hash;
      currentInput = {
        ...supplied,
        attachmentId: targetId,
        // A new version is constrained by its NEW bytes, not its parent's size/MIME.
        ...(!versionUpload
          ? { contentType: row.content_type, sizeBytes: Number(row.size_bytes) }
          : {}),
        ...(row.comment_id ? { commentId: row.comment_id } : {}),
      };
    }
    if (entityCode === "content.item" || entityCode === "atlas.prompt")
      return undefined;
    if (!entityCode || !recordId) throw new EntityCapabilityPolicyError();
    if (
      (action === "create" || versionUpload) &&
      typeof input.draftId === "string" &&
      !(await options.ownsDraft(context, input.draftId, entityCode, recordId))
    )
      throw new EntityCapabilityPolicyError();
    const resolved = await options.resolve({
      context,
      entityCode,
      recordId,
      kind: "attachments",
      action,
      input: currentInput,
      ...(mode?.preflight ? {preflight:true} : {}),
    });
    if (action === "finalize" && admittedPolicyHash !== resolved.policyHash)
      throw new EntityCapabilityPolicyError();
    return {
      admittedReleaseHash: resolved.releaseHash,
      admittedPolicyHash: resolved.policyHash,
      entityType: entityCode,
      entityId: recordId,
      ...(typeof currentInput.commentId === "string" ? {commentId:currentInput.commentId} : {}),
    };
  };
}
