import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type {
  EntityRuntimeDescriptor,
  MetadataReader,
} from "@athyper/server-contract-metadata";
import type {
  RecordQueryService,
  RecordFilter,
} from "@athyper/server-contract-records";
import { RecordServiceError } from "./errors.js";
import {
  authorizeRecordListRead,
  readableRecordFields,
} from "./record-read-access.js";
import type { RecordListExecutor } from "./query-service.js";

export interface EntityReferenceRequest {
  readonly field: string;
  readonly recordId?: string;
  readonly query?: string;
  readonly cursor?: string;
  readonly value?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
}
export interface EntityReferencePage {
  readonly options: readonly {
    value: string;
    label: string;
    recordId: string;
    entityCode: string;
  }[];
  readonly nextCursor?: string;
}
const denied = (): never => {
  throw new RecordServiceError(
    403,
    "ENTITY_REFERENCE_FORBIDDEN",
    "Reference is unavailable in the current context",
  );
};
const missingContext = (): never => {
  throw new RecordServiceError(
    409,
    "ENTITY_REFERENCE_CONTEXT_REQUIRED",
    "Select the reference context first",
  );
};
function plain(descriptor: EntityRuntimeDescriptor, key: string) {
  return (
    !descriptor.authorization?.fieldPolicies.some(
      (policy) =>
        policy.fields.includes(key) && policy.representation !== "plain",
    ) &&
    !descriptor.policyBindings?.some(
      (policy) =>
        policy.stage === "masking" &&
        (!policy.fieldKey || policy.fieldKey === key),
    )
  );
}
/** Uses the existing Records owner on both sides. No SQL, inferred joins, grants or recursive hydration. */
export function createEntityReferenceReader(options: {
  metadata: MetadataReader;
  authorizer: Authorizer;
  listExecutor: RecordListExecutor;
  queries?: RecordQueryService;
}) {
  async function lookup(
    context: VerifiedRequestContext,
    source: EntityRuntimeDescriptor,
    request: EntityReferenceRequest,
    admittedValues?: Readonly<Record<string, unknown>>,
  ): Promise<EntityReferencePage> {
    await authorizeRecordListRead(options.authorizer, context, source);
    const field = source.fields.find((field) => field.key === request.field),
      relation = field?.keyReference;
    if (!relation || !options.queries || source.planeKey !== context.planeKey)
      return denied();
    const readable = await readableRecordFields(
      options.authorizer,
      context,
      source,
    );
    if (
      relation.fields.some(
        (mapping) =>
          !readable.some((field) => field.key === mapping.source) ||
          !plain(source, mapping.source),
      )
    )
      return denied();
    let values = admittedValues;
    if (request.recordId) {
      if (request.dependencies) return denied();
      values =
        (
          await options.queries.get({
            context,
            entityCode: source.entityCode,
            recordId: request.recordId,
          })
        ).data ?? undefined;
      if (!values) return denied();
    }
    const dependencies = relation.fields.filter(
      (mapping) => mapping.source !== request.field,
    );
    if (
      request.dependencies &&
      Object.keys(request.dependencies).some(
        (key) => !dependencies.some((mapping) => mapping.source === key),
      )
    )
      return denied();
    const target = await options.metadata.getEntityDescriptor(
      context,
      relation.targetEntity,
    );
    if (
      !target ||
      target.planeKey !== context.planeKey ||
      !target.operations.read ||
      !target.operations.list
    )
      return denied();
    await authorizeRecordListRead(options.authorizer, context, target);
    const targetReadable = await readableRecordFields(
      options.authorizer,
      context,
      target,
    );
    const projected = [
      ...new Set([
        relation.labelField,
        ...relation.fields.map((mapping) => mapping.target),
      ]),
    ];
    if (
      projected.some(
        (key) =>
          !targetReadable.some((field) => field.key === key) ||
          !plain(target, key),
      )
    )
      return denied();
    const filters: RecordFilter[] = [];
    for (const mapping of dependencies) {
      const value =
        values?.[mapping.source] ?? request.dependencies?.[mapping.source];
      if (typeof value !== "string" || !value) return missingContext();
      filters.push({ field: mapping.target, operator: "eq", value });
    }
    const valueField = relation.fields.find(
      (mapping) => mapping.source === request.field,
    )!.target;
    const selected =
      request.value ?? (admittedValues ? values?.[request.field] : undefined);
    if (selected !== undefined) {
      if (typeof selected !== "string" || !selected) return { options: [] };
      filters.push({ field: valueField, operator: "eq", value: selected });
    }
    // Lookup continuation is bound by the Records cursor to the exact filter/search context.
    const execution = await options.listExecutor.execute({
      context,
      entityCode: target.entityCode,
      filters,
      fields: projected,
      limit: selected === undefined ? 25 : 2,
      ...(request.query ? { search: request.query } : {}),
      ...(request.cursor ? { cursor: request.cursor } : {}),
      countMode: "none",
    });
    if (selected !== undefined && execution.result.data.length > 1)
      throw new RecordServiceError(
        409,
        "ENTITY_REFERENCE_AMBIGUOUS",
        "The reference does not resolve uniquely",
      );
    const items: {
      value: string;
      label: string;
      recordId: string;
      entityCode: string;
    }[] = [];
    for (const row of execution.result.data) {
      const recordId = row[target.storage.idField];
      if (typeof recordId !== "string") continue;
      // Collection permission alone must never expose a label from a record whose read is denied.
      let record;
      try {
        record = (
          await options.queries.get({
            context,
            entityCode: target.entityCode,
            recordId,
          })
        ).data;
      } catch (error) {
        if (
          error instanceof RecordServiceError &&
          [403, 404].includes(error.statusCode)
        )
          continue;
        throw error;
      }
      if (
        !record ||
        projected.some((key) => !Object.hasOwn(record, key)) ||
        filters.some((filter) => record![filter.field] !== filter.value)
      )
        continue;
      const value = record[valueField],
        label = record[relation.labelField];
      if (
        typeof value === "string" &&
        typeof label === "string" &&
        label.trim()
      )
        items.push({ value, label, recordId, entityCode: target.entityCode });
    }
    return {
      options: items,
      ...(execution.result.pagination.nextCursor
        ? { nextCursor: execution.result.pagination.nextCursor }
        : {}),
    };
  }
  async function presentation(
    context: VerifiedRequestContext,
    source: EntityRuntimeDescriptor,
    values: Readonly<Record<string, unknown>>,
    cache?: Map<string, Promise<EntityReferencePage>>,
  ) {
    const labels: Record<string, string> = {};
    const references: Record<string, EntityReferencePage["options"][number]> = {};
    for (const field of source.fields) {
      if (
        !field.keyReference ||
        typeof values[field.key] !== "string" ||
        !plain(source, field.key)
      )
        continue;
      try {
        const cacheKey = JSON.stringify([
          field.key,
          ...field.keyReference.fields.map((mapping) => values[mapping.source]),
        ]);
        let pending = cache?.get(cacheKey);
        if (!pending) {
          pending = lookup(
            context,
            source,
            { field: field.key, value: values[field.key] as string },
            values,
          );
          cache?.set(cacheKey, pending);
        }
        const page = await pending;
        if (page.options.length === 1) {
          labels[field.key] = page.options[0]!.label;
          references[field.key] = page.options[0]!;
        }
      } catch (error) {
        if (
          error instanceof RecordServiceError &&
          [403, 404, 409].includes(error.statusCode)
        )
          continue;
        throw error;
      }
    }
    return { displayValues: labels, references };
  }
  async function labels(context: VerifiedRequestContext, source: EntityRuntimeDescriptor, values: Readonly<Record<string, unknown>>, cache?: Map<string, Promise<EntityReferencePage>>) {
    return (await presentation(context, source, values, cache)).displayValues;
  }
  return {
    lookup,
    labels,
    presentation,
    async labelsMany(
      context: VerifiedRequestContext,
      source: EntityRuntimeDescriptor,
      rows: readonly Readonly<Record<string, unknown>>[],
    ) {
      // Request-local only: never reuse label admission across users, contexts or requests.
      const cache = new Map<string, Promise<EntityReferencePage>>();
      const output: Record<string, string>[] = new Array(rows.length);
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(4, rows.length) }, async () => {
          while (next < rows.length) {
            const index = next++;
            output[index] = await labels(context, source, rows[index]!, cache);
          }
        }),
      );
      return output;
    },
  };
}
