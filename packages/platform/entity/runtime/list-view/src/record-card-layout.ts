import type {
  EntityListDescriptorV1,
  ListFieldDescriptorV1,
} from "@athyper/contract-platform-entity-list";

/** Body rows shown before the "more fields" disclosure. Framework policy. */
export const RECORD_CARD_BODY_LIMIT = 4;

export interface RecordCardLayout {
  readonly identity?: ListFieldDescriptorV1;
  readonly title?: ListFieldDescriptorV1;
  readonly status?: ListFieldDescriptorV1;
  readonly body: readonly ListFieldDescriptorV1[];
  readonly more: readonly ListFieldDescriptorV1[];
}

/** Resolves record card slots from metadata roles. `visible` is the user's
 * current column list, so a hidden column never appears on a card and card
 * priority only orders what the authorized projection already returned. */
export function recordCardLayout(
  descriptor: EntityListDescriptorV1,
  visible: readonly ListFieldDescriptorV1[],
): RecordCardLayout {
  const identityKey = descriptor.entity.identityField;
  const identity = descriptor.fields.find((field) => field.key === identityKey);
  const role = (name: string, ...taken: (string | undefined)[]) =>
    visible.find(
      (field) => field.semanticRole === name && !taken.includes(field.key),
    );
  const title = role("title", identityKey);
  const status = role("status", identityKey, title?.key);
  const slotted = new Set([identityKey, title?.key, status?.key]);
  const remaining = visible
    .filter((field) => !slotted.has(field.key) && field.cardPriority !== "hidden")
    .map((field, index) => ({ field, index }))
    .sort(
      (left, right) =>
        Number(left.field.cardPriority !== "primary") -
          Number(right.field.cardPriority !== "primary") ||
        left.index - right.index,
    )
    .map(({ field }) => field);
  return Object.freeze({
    ...(identity ? { identity } : {}),
    ...(title ? { title } : {}),
    ...(status ? { status } : {}),
    body: remaining.slice(0, RECORD_CARD_BODY_LIMIT),
    more: remaining.slice(RECORD_CARD_BODY_LIMIT),
  });
}
