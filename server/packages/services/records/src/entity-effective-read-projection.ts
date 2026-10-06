import type {
  EntityEffectiveReadResultV1,
  EntityResourcePinV1,
  EntityRuntimeDescriptor,
} from "@athyper/server-contract-metadata";
import { RecordServiceError } from "./errors.js";

/** Projection occurs inside the locked read transaction. Unknown provider
 * fields reject instead of becoming an ungoverned output channel. */
export async function projectEffectiveReadRow(
  row: Readonly<Record<string, unknown>>,
  fields: Extract<EntityEffectiveReadResultV1, { state: "resolved" }>["fields"],
  mask: (pin: EntityResourcePinV1, value: unknown) => Promise<unknown>,
  descriptor: EntityRuntimeDescriptor,
): Promise<Readonly<Record<string, unknown>>> {
  const authorized = new Map(fields.map((field) => [field.key, field]));
  // Record identity and concurrency remain internal envelopes and still require
  // stable-identity enrollment. Status is an ordinary authorized output.
  const technical = new Set(
    [descriptor.storage.idField, descriptor.storage.versionField].filter(
      Boolean,
    ),
  );
  const entries: [string, unknown][] = [];
  for (const [key, value] of Object.entries(row)) {
    const field = authorized.get(key);
    if (!field)
      throw new RecordServiceError(
        409,
        "LIVE_READ_PROVIDER_PROJECTION_INVALID",
        "Provider returned an unenrolled field",
      );
    if (field?.representation === "masked" && technical.has(key))
      throw new RecordServiceError(
        409,
        "LIVE_READ_TECHNICAL_COORDINATE_MASK_INVALID",
        "Technical record coordinates cannot be transformed",
      );
    entries.push([
      key,
      field?.mask && value !== null && value !== undefined
        ? await mask(field.mask, value)
        : value,
    ]);
  }
  return Object.freeze(Object.fromEntries(entries));
}
