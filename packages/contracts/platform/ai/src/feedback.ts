export const atlasFeedbackCategories = [
  "vocabulary",
  "intent",
  "missing_context",
  "unsupported_capability",
  "owner_failure",
  "evidence",
  "presentation",
] as const;
export interface AtlasResponseFeedbackV1 {
  readonly schemaVersion: 1;
  readonly feedbackId: string;
  readonly runId: string;
  readonly messageId: string;
  readonly category: (typeof atlasFeedbackCategories)[number];
  readonly verdict: "correct" | "wrong" | "partial" | "missing";
}
export function parseAtlasResponseFeedback(
  value: unknown,
): AtlasResponseFeedbackV1 {
  const v = value as AtlasResponseFeedbackV1;
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some(
      (key) =>
        ![
          "schemaVersion",
          "feedbackId",
          "runId",
          "messageId",
          "category",
          "verdict",
        ].includes(key),
    ) ||
    v.schemaVersion !== 1 ||
    !atlasFeedbackCategories.includes(v.category) ||
    !["correct", "wrong", "partial", "missing"].includes(v.verdict) ||
    [v.feedbackId, v.runId, v.messageId].some(
      (id) =>
        typeof id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id,
        ),
    )
  )
    throw new TypeError("Invalid Atlas response feedback");
  return Object.freeze({
    schemaVersion: 1,
    feedbackId: v.feedbackId.toLowerCase(),
    runId: v.runId.toLowerCase(),
    messageId: v.messageId.toLowerCase(),
    category: v.category,
    verdict: v.verdict,
  });
}
