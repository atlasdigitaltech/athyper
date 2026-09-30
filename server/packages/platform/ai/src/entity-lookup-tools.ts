import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type {
  EntityRuntimeDescriptor,
  MetadataReader,
} from "@athyper/server-contract-metadata";
import type { AtlasRegisteredTool } from "@athyper/server-contract-ai";
import { AtlasServiceError } from "./errors.js";

export const ENTITY_DISCOVER = "entity_discover";
export const ENTITY_LOOKUP = "entity_lookup";
export const ENTITY_FOLLOW_REFERENCE = "entity_follow_reference";
export const entityLookupTool = (code: string) =>
  [ENTITY_DISCOVER, ENTITY_LOOKUP, ENTITY_FOLLOW_REFERENCE].includes(code);
const codePattern = /^[a-z][a-z0-9_]{0,127}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const denied = (): never => {
  throw new AtlasServiceError(
    "TOOL_DENIED",
    "The requested Entity capability is unavailable.",
  );
};
const invalid = (): never => {
  throw new AtlasServiceError(
    "TOOL_INVALID",
    "Invalid Entity lookup arguments.",
  );
};
function declared(d: EntityRuntimeDescriptor, capability: string) {
  return Boolean(
    d.ai?.enabled &&
    d.ai.insightProviders.some((p) => p.id === capability && p.version === 1),
  );
}

/** Published capabilities select tools; the Records owner remains the source of data authority. */
export function createAtlasEntityLookupTools(
  metadata: MetadataReader,
  authorizer: Authorizer,
): readonly AtlasRegisteredTool[] {
  async function descriptor(
    context: VerifiedRequestContext,
    entityCode: string,
    capability: string,
  ) {
    if (context.permissions.localGraphPreview?.[entityCode]) return denied();
    const d = await metadata.getEntityDescriptor(context, entityCode);
    if (
      !d ||
      d.entityCode !== entityCode ||
      d.planeKey !== context.planeKey ||
      !declared(d, capability) ||
      !d.operations.read
    )
      return denied();
    if (
      !(
        await authorizer.authorize({
          context,
          permissionCode: d.operations.read.permissionCode,
          resource: {
            tenantId: context.tenantId,
            ...(d.operations.read.authorizationMode === "permission_only"
              ? {}
              : { entityCode, operationKey: d.operations.read.code }),
          },
        })
      ).allowed
    )
      return denied();
    return d;
  }
  async function fields(
    context: VerifiedRequestContext,
    d: EntityRuntimeDescriptor,
  ) {
    const keys = [];
    for (const key of [
      ...new Set([...d.ai!.summaryFieldKeys, ...d.ai!.relationshipKeys]),
    ]) {
      const f = d.fields.find((f) => f.key === key);
      if (
        !f ||
        f.type === "json" ||
        !["public", "internal"].includes(f.classification ?? "") ||
        d.policyBindings?.some(
          (p) => p.stage === "masking" && (!p.fieldKey || p.fieldKey === key),
        )
      )
        continue;
      if (
        f.readPermissionCode &&
        !(
          await authorizer.authorize({
            context,
            permissionCode: f.readPermissionCode,
            resource: { tenantId: context.tenantId },
          })
        ).allowed
      )
        continue;
      keys.push(key);
    }
    return keys;
  }
  function manifest(
    toolCode: string,
    description: string,
    properties: Record<string, unknown>,
    required: string[],
  ): AtlasRegisteredTool["manifest"] {
    return {
      schema: "atlas-tool-manifest/1",
      version: "1",
      toolCode,
      displayName: description,
      description,
      allowedPlanes: ["neon", "mesh", "studio"],
      access: "read",
      risk: "low",
      confirmation: "none",
      featureKey: "atlas_tools_read_enabled",
      requiredPermissions: [],
      timeoutMs: 10000,
      maxResultBytes: 16384,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties,
        required,
      },
      resultSchema: { type: "object" },
    };
  }
  const string = { type: "string" };
  const requestedFields = {
    type: "array",
    minItems: 1,
    maxItems: 8,
    uniqueItems: true,
    items: string,
  };
  const discover: AtlasRegisteredTool = {
    manifest: manifest(
      ENTITY_DISCOVER,
      "Discover available published Entity fields and relationships. Metadata only.",
      { query: { type: "string", minLength: 1, maxLength: 200 } },
      ["query"],
    ),
    validateArguments(args) {
      if (
        Object.keys(args).some((k) => k !== "query") ||
        typeof args.query !== "string" ||
        !args.query.trim() ||
        args.query.length > 200
      )
        invalid();
    },
    readHandler: {
      async execute({ context, arguments: args }) {
        const candidates =
          (await metadata.listEntityCodes?.(context.context)) ?? [];
        const words = (
          String(args.query)
            .toLowerCase()
            .match(/[\p{L}\p{N}_]+/gu) ?? []
        ).filter((word) => word.length >= 3);
        const items = [];
        for (const code of candidates.slice(0, 256)) {
          let d: EntityRuntimeDescriptor;
          try {
            d = await descriptor(context.context, code, ENTITY_LOOKUP);
          } catch (error) {
            if (!(
              error instanceof AtlasServiceError && error.code === "TOOL_DENIED"
            ))
              throw error;
            try {
              d = await descriptor(
                context.context,
                code,
                ENTITY_FOLLOW_REFERENCE,
              );
            } catch (next) {
              if (
                next instanceof AtlasServiceError &&
                next.code === "TOOL_DENIED"
              )
                continue;
              throw next;
            }
          }
          const readable = await fields(context.context, d);
          const search = d.ai!.searchFieldKeys.filter(
            (key) =>
              readable.includes(key) &&
              d.fields.some(
                (f) => f.key === key && f.searchable && f.filterable,
              ),
          );
          const relationships = [];
          if (declared(d, ENTITY_FOLLOW_REFERENCE))
            for (const key of d.ai!.relationshipKeys.slice(0, 16)) {
              const f = d.fields.find((f) => f.key === key);
              if (!f?.referenceTargetEntity || !readable.includes(key))
                continue;
              try {
                await descriptor(
                  context.context,
                  f.referenceTargetEntity,
                  ENTITY_LOOKUP,
                );
              } catch (error) {
                if (
                  error instanceof AtlasServiceError &&
                  error.code === "TOOL_DENIED"
                )
                  continue;
                throw error;
              }
              relationships.push({
                key,
                label: f.list?.label ?? key,
                targetEntityCode: f.referenceTargetEntity,
              });
            }
          if (!search.length && !relationships.length) continue;
          const projected = readable.map((key) => {
            const f = d.fields.find((f) => f.key === key)!;
            return {
              key,
              label: f.list?.label ?? key,
              searchable: search.includes(key),
            };
          });
          const terms = [
            d.entityCode,
            ...d.ai!.aliases,
            ...projected.flatMap((f) => [f.key, f.label]),
          ]
            .join(" ")
            .toLowerCase();
          const score = words.filter((w) => terms.includes(w)).length;
          if (!score) continue;
          const fieldScores = projected.map(
            (f) =>
              words.filter((w) =>
                (f.key + " " + f.label).toLowerCase().includes(w),
              ).length,
          );
          const bestFieldScore = Math.max(1, ...fieldScores);
          const selected = projected
            .filter(
              (f, index) =>
                f.searchable || fieldScores[index] === bestFieldScore,
            )
            .slice(0, 8);
          items.push({
            entityCode: d.entityCode,
            descriptorHash: d.compiledHash,
            fields: selected,
            relationships,
            capabilities: [
              ...(declared(d, ENTITY_LOOKUP) ? [ENTITY_LOOKUP] : []),
              ...(relationships.length ? [ENTITY_FOLLOW_REFERENCE] : []),
            ],
            score,
          });
        }
        items.sort(
          (a, b) =>
            b.score - a.score || a.entityCode.localeCompare(b.entityCode),
        );
        const selectedItems: Omit<(typeof items)[number], "score">[] = [];
        for (const { score: _score, ...item } of items) {
          if (selectedItems.length === 3) break;
          if (
            Buffer.byteLength(
              JSON.stringify([...selectedItems, item]),
              "utf8",
            ) <= 1000
          )
            selectedItems.push(item);
        }
        return {
          data: {
            kind: "entity_catalogue",
            items: selectedItems,
            coverage:
              candidates.length > 256 || items.length > selectedItems.length
                ? "partial"
                : "matching metadata",
            guidance: "Metadata only; partial coverage may need refinement.",
          },
          sources: [],
        };
      },
    },
  };
  const lookup: AtlasRegisteredTool = {
    manifest: manifest(
      ENTITY_LOOKUP,
      "Read authorized named records and their published summaries.",
      {
        entityCode: string,
        descriptorHash: string,
        searchField: string,
        matchMode: { type: "string", enum: ["exact", "contains"] },
        value: {
          oneOf: [
            { type: "string", minLength: 1, maxLength: 200 },
            {
              type: "array",
              minItems: 1,
              maxItems: 3,
              uniqueItems: true,
              items: { type: "string", minLength: 1, maxLength: 200 },
            },
          ],
        },
        fields: { ...requestedFields, minItems: 0 },
      },
      ["entityCode", "descriptorHash", "searchField", "value", "fields"],
    ),
    validateArguments(args) {
      if (
        Object.keys(args).some(
          (k) =>
            ![
              "entityCode",
              "descriptorHash",
              "searchField",
              "value",
              "fields",
              "matchMode",
            ].includes(k),
        ) ||
        typeof args.entityCode !== "string" ||
        !codePattern.test(args.entityCode) ||
        typeof args.descriptorHash !== "string" ||
        typeof args.searchField !== "string" ||
        !codePattern.test(args.searchField) ||
        (args.matchMode !== undefined &&
          !["exact", "contains"].includes(String(args.matchMode))) ||
        !(typeof args.value === "string" || Array.isArray(args.value)) ||
        (Array.isArray(args.value) &&
          (!args.value.length ||
            args.value.length > 3 ||
            new Set(args.value).size !== args.value.length)) ||
        (Array.isArray(args.value) ? args.value : [args.value]).some(
          (v) => typeof v !== "string" || !v.trim() || v.length > 200,
        ) ||
        !Array.isArray(args.fields) ||
        args.fields.length > 8 ||
        args.fields.some(
          (k) => typeof k !== "string" || !codePattern.test(k),
        ) ||
        new Set(args.fields).size !== args.fields.length
      )
        invalid();
    },
    readHandler: {
      async execute({ context, arguments: args }) {
        const d = await descriptor(
          context.context,
          String(args.entityCode),
          ENTITY_LOOKUP,
        );
        if (d.compiledHash !== args.descriptorHash) return denied();
        const readable = await fields(context.context, d);
        const search = d.fields.find((f) => f.key === args.searchField);
        if (
          !search?.searchable ||
          !search.filterable ||
          !d.ai!.searchFieldKeys.includes(search.key) ||
          !readable.includes(search.key) ||
          (args.fields as string[]).some((k) => !readable.includes(k))
        )
          return denied();
        const projection = (args.fields as string[]).length
          ? (args.fields as string[])
          : d
              .ai!.summaryFieldKeys.filter((key) => readable.includes(key))
              .slice(0, 8);
        const selected = [...new Set([search.key, ...projection])];
        const values = Array.isArray(args.value)
          ? (args.value as string[])
          : [args.value as string];
        const matches = [];
        const sources = [];
        for (const value of values) {
          context.signal.throwIfAborted();
          const result = await context.records.query({
            context: context.context,
            request: {
              entityCode: d.entityCode,
              fields: selected,
              filters: [
                {
                  field: search.key,
                  operator:
                    args.matchMode === "contains" &&
                    ["string", "text"].includes(search.type)
                      ? "contains"
                      : "eq",
                  value,
                },
              ],
              limit: 3,
            },
          });
          if (
            result.authorizationProfileHash !== context.context.profileHash ||
            result.rows.length > 3 ||
            result.sources.length !== result.rows.length ||
            result.sources.some(
              (s) =>
                s.entityCode !== d.entityCode ||
                s.descriptorHash !== d.compiledHash ||
                !s.recordId ||
                !s.revision,
            )
          )
            return denied();
          const items = result.rows.map((row, i) => ({
            recordId: result.sources[i]?.recordId,
            fields: selected
              .filter((key) => Object.hasOwn(row, key))
              .map((key) => ({
                key,
                label: d.fields.find((f) => f.key === key)?.list?.label ?? key,
                value: row[key],
              })),
          }));
          matches.push({
            value,
            match:
              items.length === 1
                ? "one"
                : items.length
                  ? "ambiguous"
                  : "no_authorized_match",
            items,
          });
          sources.push(...result.sources.map((coordinate) => ({ coordinate })));
        }
        return {
          data: {
            kind: "entity_lookup",
            entityCode: d.entityCode,
            ...(Array.isArray(args.value) ? { matches } : matches[0]),
            summary: !(args.fields as string[]).length,
            coverage:
              "Up to three authorized candidates per requested value; not a total count. Summary includes up to eight permitted published fields. Ambiguous matches require a choice.",
          },
          sources,
        };
      },
    },
  };
  const follow: AtlasRegisteredTool = {
    manifest: manifest(
      ENTITY_FOLLOW_REFERENCE,
      "Follow a published current-record reference. Clarify ambiguous relationships.",
      {
        relationshipKey: string,
        fields: requestedFields,
        sourceEntityCode: string,
        sourceRecordId: string,
        sourceDescriptorHash: string,
      },
      [
        "relationshipKey",
        "fields",
        "sourceEntityCode",
        "sourceRecordId",
        "sourceDescriptorHash",
      ],
    ),
    validateArguments(args) {
      if (
        Object.keys(args).some(
          (k) =>
            ![
              "relationshipKey",
              "fields",
              "sourceEntityCode",
              "sourceRecordId",
              "sourceDescriptorHash",
            ].includes(k),
        ) ||
        typeof args.sourceEntityCode !== "string" ||
        !codePattern.test(args.sourceEntityCode) ||
        typeof args.sourceRecordId !== "string" ||
        !uuidPattern.test(args.sourceRecordId) ||
        typeof args.sourceDescriptorHash !== "string" ||
        typeof args.relationshipKey !== "string" ||
        !codePattern.test(args.relationshipKey) ||
        !Array.isArray(args.fields) ||
        !args.fields.length ||
        args.fields.length > 8 ||
        args.fields.some(
          (k) => typeof k !== "string" || !codePattern.test(k),
        ) ||
        new Set(args.fields).size !== args.fields.length
      )
        invalid();
    },
    readHandler: {
      async execute({ context, arguments: args }) {
        const source = await descriptor(
          context.context,
          String(args.sourceEntityCode),
          ENTITY_FOLLOW_REFERENCE,
        );
        if (
          source.compiledHash !== args.sourceDescriptorHash ||
          !source.ai!.relationshipKeys.includes(String(args.relationshipKey))
        )
          return denied();
        const relation = source.fields.find(
          (f) => f.key === args.relationshipKey,
        );
        if (
          !relation?.referenceTargetEntity ||
          !["uuid", "reference"].includes(relation.type) ||
          !(await fields(context.context, source)).includes(relation.key)
        )
          return denied();
        const parent = await context.records.query({
          context: context.context,
          request: {
            entityCode: source.entityCode,
            fields: [relation.key],
            filters: [
              {
                field: source.storage.idField,
                operator: "eq",
                value: args.sourceRecordId,
              },
            ],
            limit: 1,
          },
        });
        if (
          parent.rows.length !== 1 ||
          parent.sources.length !== 1 ||
          parent.sources[0]!.entityCode !== source.entityCode ||
          !parent.sources[0]!.revision ||
          parent.sources[0]!.recordId !== args.sourceRecordId ||
          parent.sources[0]!.descriptorHash !== source.compiledHash ||
          parent.authorizationProfileHash !== context.context.profileHash
        )
          return denied();
        const id = parent.rows[0]![relation.key];
        if (id === null || id === undefined)
          return {
            data: {
              kind: "entity_reference",
              state: "no_visible_reference",
              items: [],
            },
            sources: parent.sources.map((coordinate) => ({ coordinate })),
          };
        if (typeof id !== "string" || !uuidPattern.test(id)) return denied();
        const target = await descriptor(
          context.context,
          relation.referenceTargetEntity,
          ENTITY_LOOKUP,
        );
        const readable = await fields(context.context, target);
        if ((args.fields as string[]).some((k) => !readable.includes(k)))
          return denied();
        const result = await context.records.query({
          context: context.context,
          request: {
            entityCode: target.entityCode,
            fields: args.fields as string[],
            filters: [
              { field: target.storage.idField, operator: "eq", value: id },
            ],
            limit: 1,
          },
        });
        if (
          result.authorizationProfileHash !== context.context.profileHash ||
          result.rows.length !== 1 ||
          result.sources.length !== 1 ||
          result.sources[0]!.entityCode !== target.entityCode ||
          !result.sources[0]!.revision ||
          result.sources[0]!.recordId !== id ||
          result.sources[0]!.descriptorHash !== target.compiledHash
        )
          return denied();
        return {
          data: {
            kind: "entity_reference",
            entityCode: target.entityCode,
            relationshipKey: relation.key,
            items: result.rows.map((row) => ({
              recordId: id,
              fields: (args.fields as string[])
                .filter((k) => Object.hasOwn(row, k))
                .map((key) => ({
                  key,
                  label:
                    target.fields.find((f) => f.key === key)?.list?.label ??
                    key,
                  value: row[key],
                })),
            })),
          },
          sources: [...parent.sources, ...result.sources].map((coordinate) => ({
            coordinate,
          })),
        };
      },
    },
  };
  return [discover, lookup, follow];
}
