import type { AttachmentBinding, CommentBinding } from "@athyper/server-contract-publication";

export interface CollaborationOperationalControls {
  readonly revision: string;
  readonly maxFileBytes?: number;
  readonly maxBatchCount?: number;
  readonly maxAttachments?: number;
  readonly maxTextLength?: number;
  readonly allowedContentTypes?: readonly string[];
  readonly allowedAudiences?: readonly ("public" | "private" | "internal")[];
  readonly features?: Readonly<Partial<Record<keyof CommentBinding["features"], boolean>>>;
}
export class CollaborationControlsError extends Error {
  readonly statusCode = 503;
  readonly code = "COLLABORATION_CONTROLS_INVALID";
}

/** Single server composition point; projection and enforcement consume its result. */
export function resolveEffectiveCollaborationControls<T extends CommentBinding | AttachmentBinding>(published: T, operational: CollaborationOperationalControls): T {
  if (!operational || typeof operational.revision !== "string" || !operational.revision.trim()) throw new CollaborationControlsError("Configuration revision is required");
  const next = structuredClone(published);
  const ceiling = (value: number, limit: number | undefined) => {
    if (limit === undefined) return value;
    if (!Number.isSafeInteger(limit) || limit < 0) throw new CollaborationControlsError("Operational ceiling must be a nonnegative integer");
    return Math.min(value, limit);
  };
  const intersect = <S extends string>(values: readonly S[], limit: readonly S[] | undefined): S[] => {
    if (limit === undefined) return [...values];
    if (!Array.isArray(limit) || limit.some(item => typeof item !== "string")) throw new CollaborationControlsError("Operational allow-list is invalid");
    return values.filter(value => limit.includes(value));
  };
  if ("maxFileBytes" in next) return { ...next,
    maxFileBytes: ceiling(next.maxFileBytes, operational.maxFileBytes),
    maxBatchCount: ceiling(next.maxBatchCount, operational.maxBatchCount),
    allowedContentTypes: intersect(next.allowedContentTypes, operational.allowedContentTypes),
  } as T;
  const features = { ...next.features };
  for (const key of Object.keys(operational.features ?? {})) {
    if (!(key in features) || typeof operational.features![key as keyof typeof features] !== "boolean") throw new CollaborationControlsError("Operational feature restriction is invalid");
    const name = key as keyof typeof features;
    features[name] = features[name] && operational.features![name]!;
  }
  const audiences = intersect(next.allowedAudiences, operational.allowedAudiences);
  if (!audiences.includes(next.defaultAudience)) throw new CollaborationControlsError("Published default audience is not currently allowed");
  const featureActions: Record<string, keyof typeof features> = { reply: "replies", react: "reactions", mention: "mentions", draft: "drafts", flag: "reporting", history: "history", update_own: "edits" };
  return { ...next, maxTextLength: ceiling(next.maxTextLength, operational.maxTextLength),
    attachments: { ...next.attachments, maxCount: ceiling(next.attachments.maxCount, operational.maxAttachments) },
    allowedAudiences: audiences, features,
    actions: next.actions.filter(action => !featureActions[action.key] || features[featureActions[action.key]!]),
  } as T;
}
