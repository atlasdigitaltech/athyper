import type {
  EntityListDescriptorV1,
  ListFieldDescriptorV1,
} from "@athyper/contract-platform-entity-list";
import { recordCardLayout, type RecordCardLayout } from "./record-card-layout";

/** One card resolution for every card-based layout (Cards and Board).
 * Published card content (the compiled summary placements) defines the body
 * exactly and takes precedence over `cardPriority`; without it, the body is
 * today's layout over the user's visible columns. `omitField` (the active lane
 * field on a board) is never repeated on the card. */
export function resolveCardLayout(
  descriptor: EntityListDescriptorV1,
  visible: readonly ListFieldDescriptorV1[],
  omitField?: string,
): RecordCardLayout {
  const fallback = recordCardLayout(descriptor, visible);
  const placements = descriptor.surface.cardContent?.fields;
  const keep = (field: ListFieldDescriptorV1 | undefined) => (field && field.key !== omitField ? field : undefined);
  if (!placements) {
    const status = keep(fallback.status);
    return Object.freeze({
      ...(fallback.identity ? { identity: fallback.identity } : {}),
      ...(fallback.title ? { title: fallback.title } : {}),
      ...(status ? { status } : {}),
      body: fallback.body.filter((field) => field.key !== omitField),
      more: fallback.more.filter((field) => field.key !== omitField),
    });
  }
  const byKey = new Map(descriptor.fields.map((field) => [field.key, field]));
  const identityKey = descriptor.entity.identityField;
  const title = descriptor.fields.find((field) => field.semanticRole === "title" && field.key !== identityKey);
  const status = keep(descriptor.fields.find((field) => field.semanticRole === "status" && field.key !== identityKey && field.key !== title?.key));
  const slotted = new Set([identityKey, title?.key, status?.key, omitField]);
  const body = placements.flatMap((placement) => {
    const field = byKey.get(placement.field);
    if (!field || slotted.has(field.key)) return [];
    return [placement.rendererKey ? { ...field, rendererKey: placement.rendererKey } : field];
  });
  return Object.freeze({
    ...(byKey.get(identityKey) ? { identity: byKey.get(identityKey)! } : {}),
    ...(title ? { title } : {}),
    ...(status ? { status } : {}),
    body,
    more: [],
  });
}
