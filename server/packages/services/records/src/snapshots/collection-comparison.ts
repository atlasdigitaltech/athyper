import type {
  ActivityCollectionComparison,
  ActivityCollectionFieldFormat,
  ActivityCollectionComparisonItem,
} from "@athyper/contract-platform-entity-runtime";
import {
  canonicalDecimal,
  canonicalJson,
  collectionRecordId,
  parseCollectionCapture,
  type CollectionCapture,
} from "./collection-capture.js";

/** Provided by an installed authorization adapter on every read. Snapshot capture
 * privileges never establish current row/field access. No default allow path. */
export interface CollectionComparisonAuthorization {
  readonly discoverable: boolean;
  /** Complete means the viewer may determine membership across the declared scope.
   * A filtered page or a provider that cannot authorize removed rows is restricted. */
  readonly membership: "complete" | "restricted";
  readonly label: string;
  readonly fields: readonly { readonly key: string; readonly label: string; readonly format?:ActivityCollectionFieldFormat }[];
  authorizeRecord(input: {
    readonly id: string;
    readonly before?: Readonly<Record<string, unknown>>;
    readonly after?: Readonly<Record<string, unknown>>;
  }): Promise<{
    readonly readable: boolean;
    /** Current authorized display label; never used for matching. */
    readonly label?: string;
    readonly fields: readonly string[];
    readonly targetReadable: boolean;
  }>;
}
/** Compare whole bounded captures, never independently paged lists. A future API
 * must page this authorized result and pin its query, not page each input first. */
export async function compareCapturedCollection(input: {
  /** Coordinates and comparison definition from the current admitted release. */
  readonly subject: CollectionCapture["subject"];
  readonly definition: CollectionCapture["definition"];
  readonly before: unknown;
  readonly after: unknown;
  readonly authorization: CollectionComparisonAuthorization;
  readonly maximumRecords?: number;
}): Promise<ActivityCollectionComparison | null> {
  const access = input.authorization;
  if (access.discoverable !== true) return null;
  if (
    new Set(access.fields.map((field) => field.key)).size !==
    access.fields.length
  )
    throw Error("COLLECTION_COMPARISON_AUTHORIZATION_INVALID");
  const before = parseCollectionCapture(input.before, input.maximumRecords);
  const after = parseCollectionCapture(input.after, input.maximumRecords);
  if (
    canonicalJson(before.subject) !== canonicalJson(input.subject) ||
    canonicalJson(after.subject) !== canonicalJson(input.subject) ||
    before.definition.key !== input.definition.key ||
    after.definition.key !== input.definition.key
  )
    throw Error("COLLECTION_COMPARISON_SUBJECT_MISMATCH");
  const sourceTimes = {
    ...(before.capturedAt ? { beforeCapturedAt: before.capturedAt } : {}),
    ...(after.capturedAt ? { afterCapturedAt: after.capturedAt } : {}),
  };
  const counts = {
    added: 0,
    updated: 0,
    removed: 0,
    replaced: 0,
    unchanged: 0,
  };
  const notes: ActivityCollectionComparison["notes"][number][] = [];
  // Reordered field declarations do not change comparison identity.
  const signature = (definition: CollectionCapture["definition"]) =>
    canonicalJson({
      ...definition,
      fields: [...definition.fields].sort((a, b) => a.key.localeCompare(b.key)),
    });
  if (
    signature(before.definition) !== signature(input.definition) ||
    signature(after.definition) !== signature(input.definition)
  )
    return {
      ...sourceTimes,
      key: before.definition.key,
      label: access.label,
      items: [],
      notes: ["incompatible_scope"],
      counts,
    };
  const complete =
    before.coverage === "complete" && after.coverage === "complete";
  if (!complete) notes.push("incomplete_capture");
  if (access.membership !== "complete") notes.push("restricted_scope");
  if (
    before.consistency === "independent" ||
    after.consistency === "independent"
  )
    notes.push("independent_sources");
  const definition = before.definition;
  const index = (capture: CollectionCapture) =>
    new Map(
      capture.records.map((row) => [
        collectionRecordId(row, definition.identityField),
        row,
      ]),
    );
  const left = index(before),
    right = index(after);
  const items: ActivityCollectionComparisonItem[] = [];
  // Sorting stable IDs makes output independent of incidental row/line ordering.
  for (const id of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    const a = left.get(id),
      b = right.get(id);
    const decision = await access.authorizeRecord({ id, before: a, after: b });
    if (decision.readable !== true) {
      if (access.membership === "complete")
        throw Error("COLLECTION_COMPARISON_AUTHORIZATION_INCONSISTENT");
      continue;
    }
    const fields = access.fields.flatMap((field) => {
      const declared = definition.fields.find((f) => f.key === field.key);
      if (
        !declared ||
        !decision.fields.includes(field.key) ||
        (field.key === definition.targetField &&
          decision.targetReadable !== true)
      )
        return [];
      const presentA = !!a && Object.hasOwn(a, field.key),
        presentB = !!b && Object.hasOwn(b, field.key);
      const normalize = (v: unknown) =>
        declared.comparison === "decimal" && v !== null
          ? canonicalDecimal(v)
          : canonicalJson(v);
      return [
        {
          key: field.key,
          label: field.label,
          ...(field.format ? {format:field.format} : {}),
          before: presentA
            ? { state: "value" as const, value: a![field.key] }
            : { state: "uncaptured" as const },
          after: presentB
            ? { state: "value" as const, value: b![field.key] }
            : { state: "uncaptured" as const },
          changed:
            presentA &&
            presentB &&
            normalize(a![field.key]) !== normalize(b![field.key]),
        },
      ];
    });
    let change: ActivityCollectionComparisonItem["change"];
    if (!a || !b)
      change =
        complete && access.membership === "complete"
          ? a
            ? "removed"
            : "added"
          : "uncomparable";
    else if (
      definition.targetField &&
      decision.targetReadable === true &&
      a[definition.targetField] !== b[definition.targetField]
    )
      change = "replaced";
    else if (definition.targetField && decision.targetReadable !== true)
      change = "uncomparable";
    else if (fields.some((field) => field.changed)) change = "updated";
    else if (
      fields.some(
        (field) =>
          field.before.state !== "value" || field.after.state !== "value",
      ) ||
      !fields.length ||
      (definition.targetField && decision.targetReadable !== true)
    )
      change = "uncomparable";
    else change = "unchanged";
    // Replacement pairs different target records: retain captured values for inspection,
    // but do not call cross-target value differences edits to the same target record.
    const valueComparison =
      change === "replaced"
        ? "different_target"
        : a &&
            b &&
            (!definition.targetField || decision.targetReadable === true)
          ? "same_record"
          : "unavailable";
    if (
      a &&
      b &&
      fields.some(
        (field) =>
          field.before.state !== "value" || field.after.state !== "value",
      ) &&
      !notes.includes("incomplete_capture")
    )
      notes.push("incomplete_capture");
    items.push({
      id,
      ...(decision.label ? {label:decision.label} : {}),
      change,
      beforePresence: a
        ? "present"
        : complete && access.membership === "complete"
          ? "absent"
          : "unknown",
      afterPresence: b
        ? "present"
        : complete && access.membership === "complete"
          ? "absent"
          : "unknown",
      valueComparison,
      fields:
        valueComparison !== "same_record"
          ? fields.map((field) => ({ ...field, changed: false }))
          : fields,
    });
    if (change !== "uncomparable") counts[change]++;
  }
  return {
    ...sourceTimes,
    key: definition.key,
    label: access.label,
    items,
    notes,
    counts,
  };
}
