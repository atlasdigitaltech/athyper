import { validateNativeSnapshotReferences } from "./native-snapshot-validation.js";
import { expect, it, vi } from "vitest";
import {
  type MetaEntityGraph,
  type ExpandedNativeMetaEntityGraph,
  type AuthoringPlane,
  type NormalizedCoreContext,
  type NormalizedCoreRow,
  type NormalizedLayoutRow,
  type OwnedLabelGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  coreFixtureContext,
  coreFixtureRow,
} from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import { layoutFixtureRow } from "../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js";
import { resourceConversionFixture } from "./legacy-native-resources.fixtures.js";
import { createLegacyNativeCoreAdapters } from "./legacy-native-core-adapters.js";
import {
  createLegacyNativeWholeSourceApplicationPolicy,
  resolveLegacyNativeWholeSource,
  type LegacyNativeWholeSourceInput,
} from "./legacy-native-whole-source.js";
import {
  compileNativeRelease,
  type NativeReleaseCompilationContext,
} from "./native-release-compilation.js";
import { compileNativeRuntimeProjection } from "@athyper/server-platform-metadata";
import { sha256, canonicalJson } from "./deterministic.js";
import type { NativeLocalizationOwners } from "./native-presentation-localization.js";
import type { NativeRelationDerivation } from "./native-reference-relations.js";
import type { NativeDetailSectionsContext } from "./native-detail-sections.js";
import type { NativeNavigationContext } from "./native-detail-navigation.js";
import type { EntityRuntimeLocalizedTextV1 } from "@athyper/contract-platform-entity-runtime";
import type { EntityDetailNavigationV1 } from "@athyper/contract-platform-entity-runtime";

const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
/** Complete current product source with explicitly synthetic catalogue, label,
 * stable-ID and provider projections. Does not attest saved DEV sources/roles. */
function fixture(
  name: string,
  plane: AuthoringPlane = "studio",
): LegacyNativeWholeSourceInput & {
  compilerContext(
    graph: ExpandedNativeMetaEntityGraph,
  ): NativeReleaseCompilationContext;
} {
  const f = resourceConversionFixture(name, plane, 2);
  let next = 10000;
  const alloc = () => id(next++);
  const resource = (key: string) => ({
    owner: "synthetic-whole-source",
    key,
    version: 1,
    hash: sha256({ key }),
  });
  const pins = new Map<string, ReturnType<typeof resource>>();
  const pin = (key: string) => {
    const r = resource(key);
    pins.set(canonicalJson(r), r);
    return r;
  };
  const adapterBase = (key: string) => ({
    resource: pin(key),
    dependencies: [],
  });
  const source: MetaEntityGraph = {
    ...structuredClone(f.source),
    surfaceSections: [],
    surfaceFieldBindings: f.source.surfaceFieldBindings!.map((b) => ({
      ...b,
      id: alloc(),
    })),
  };
  // The repository assigns member IDs when saving a product declaration; retain
  // those explicit synthetic saved-row IDs across every family in this fixture.
  for (const rows of Object.values(source))
    if (Array.isArray(rows))
      for (const row of rows)
        if (row && typeof row === "object" && !Object.hasOwn(row, "id"))
          Object.assign(row, { id: alloc() });
  const labels: OwnedLabelGraph = {
    ...structuredClone(source.ownedLabels!),
    labels: [...source.ownedLabels!.labels],
  };
  const add = (text: EntityRuntimeLocalizedTextV1) => {
    const existing = labels.labels.find((l) => l.labelKey === text.labelKey);
    if (existing) {
      expect(existing.defaultText).toBe(text.defaultText);
      return existing.id;
    }
    const row = {
      id: alloc(),
      labelKey: text.labelKey,
      defaultText: text.defaultText,
      sourceKind: "owned" as const,
      sharedLabelKey: null,
      sharedResourceKey: null,
      sharedResourceVersion: null,
      sharedResourceHash: null,
    };
    (labels.labels as (typeof row)[]).push(row);
    return row.id;
  };
  const plain = (key: string, text: string) =>
    add({ labelKey: key, defaultText: text });
  const labelText = (labelId: string) =>
    labels.labels.find((l) => l.id === labelId)!.defaultText;
  const localized = (labelId: string) => {
    const l = labels.labels.find((l) => l.id === labelId)!;
    return {
      label: l.defaultText,
      localizedLabel: { labelKey: l.labelKey, defaultText: l.defaultText },
    };
  };
  const owners: NativeLocalizationOwners[] = [];
  const fieldLabels = new Map<string, string>();
  const choices = new Map<
    string,
    { id: string; labelId: string; valueText: string }[]
  >();
  for (const s of source.surfaces!) {
    const record = s.layoutConfig!.recordPresentation as
      Record<string, unknown> | undefined;
    const bundle = (record?.localizedLabels ??
      s.layoutConfig!.localizedLabels) as {
      title: EntityRuntimeLocalizedTextV1;
      entity: EntityRuntimeLocalizedTextV1;
      fields: Record<string, EntityRuntimeLocalizedTextV1>;
      options: Record<string, Record<string, EntityRuntimeLocalizedTextV1>>;
    };
    const fields = Object.fromEntries(
      Object.entries(bundle.fields).map(([key, text]) => {
        const field = source.fields.find((f) => f.fieldKey === key)!;
        const labelId = add(text);
        fieldLabels.set(field.id!, labelId);
        return [key, { fieldId: field.id!, labelId }];
      }),
    );
    const options = Object.fromEntries(
      Object.entries(bundle.options).map(([key, values]) => {
        const field = source.fields.find((f) => f.fieldKey === key)!;
        const rows =
          choices.get(field.id!) ??
          Object.entries(values).map(([valueText, text]) => ({
            id: alloc(),
            labelId: add(text),
            valueText,
          }));
        choices.set(field.id!, rows);
        return [
          key,
          Object.fromEntries(
            rows.map((r) => [
              r.valueText,
              { fieldId: field.id!, choiceId: r.id, labelId: r.labelId },
            ]),
          ),
        ];
      }),
    );
    owners.push({
      surfaceId: s.id!,
      titleLabelId: add(bundle.title),
      entityLabelId: add(bundle.entity),
      fields,
      options,
    });
    for (const section of (record?.sections ?? []) as {
      label: string;
      localizedLabel: EntityRuntimeLocalizedTextV1;
    }[])
      add(section.localizedLabel);
    for (const tab of (
      record?.navigation as EntityDetailNavigationV1 | undefined
    )?.tabs ?? [])
      if (tab.localizedLabel) add(tab.localizedLabel);
  }
  Reflect.set(source, "ownedLabels", labels);
  const identities = source.fields.map((field) => ({
    id: alloc(),
    entityId: labels.entityId,
    tenantId: null,
    fieldKey: field.fieldKey,
    parentIdentityId: null,
    identityStatus: "reserved" as const,
    introducedChangeSetId: labels.changeSetId,
    firstReleaseId: null,
    retiredAt: null,
    retiredBy: null,
    retirementReleaseId: null,
    replacementIdentityId: null,
    createdAt: "2026-10-07T00:00:00.000Z",
    createdBy: id(3),
  }));
  Reflect.set(source, "fieldIdentities", identities);
  const derivations: NativeRelationDerivation[] =
    f.input.ai.context.relationships.map((r, i) => {
      const field = source.fields.find((f) => f.id === r.sourceFieldId)!;
      const ref = field.typeConfig.keyReference as {
        targetEntity: string;
        labelField: string;
        fields: { source: string; target: string }[];
      };
      const targetId = alloc(),
        entityId = alloc();
      return {
        sourceFieldId: field.id!,
        sourceHash: sha256(ref),
        labelFieldKey: ref.labelField,
        resource: pin("target-key-" + i),
        targetKey: {
          entityId,
          entityCode: ref.targetEntity,
          keyKey: "business_code",
          fieldKeys: ref.fields.map((m) => m.target),
        },
        relation: {
          id: r.relationId,
          relationKey: r.key,
          relationKind: "many_to_one",
          resolutionKind: "logical",
          ownershipMode: "reference",
          mutationMode: "read_only",
          onDelete: "restrict",
          onUpdate: "restrict",
          status: "active",
        },
        target: {
          id: targetId,
          entityRelationId: r.relationId,
          relationTargetKey: "default",
          targetEntityId: entityId,
          targetEntityCode: ref.targetEntity,
          targetKeyKey: "business_code",
          isDefault: true,
        },
        fields: ref.fields.map((m, j) => ({
          id: alloc(),
          entityRelationTargetId: targetId,
          sourceFieldId: source.fields.find((f) => f.fieldKey === m.source)!
            .id!,
          targetFieldKey: m.target,
          position: j + 1,
        })),
      };
    });
  const storageTypes: Record<string, string> = {
    string: "text",
    uuid: "uuid",
    boolean: "boolean",
    datetime: "timestamptz",
    integer: "integer",
    enum: "text",
  };
  const fieldMappings = Object.fromEntries(
    source.fields.map((field, i) => [
      field.id!,
      {
        sourceHash: sha256(field),
        fieldIdentityId: identities[i]!.id,
        labelId: fieldLabels.get(field.id!) ?? null,
        storageType: storageTypes[field.dataType]!,
        requiredInput: false,
        keyGeneration:
          field.dataType === "uuid" ? ("provided" as const) : ("none" as const),
        ...(source.surfaceFieldBindings!.some(
          (b) => b.entityFieldId === field.id && b.displayConfig?.semanticRole,
        )
          ? {
              semanticRole: source.surfaceFieldBindings!.find(
                (b) =>
                  b.entityFieldId === field.id && b.displayConfig?.semanticRole,
              )!.displayConfig!.semanticRole as string,
            }
          : {}),
        ...(field.typeConfig.keyReference
          ? {
              relation: {
                id: derivations.find((d) => d.sourceFieldId === field.id)!
                  .relation.id,
                sourceConfigHash: sha256(field.typeConfig.keyReference),
              },
            }
          : {}),
      },
    ]),
  );
  const capabilityKey = source.surfaces!.find(
    (s) => s.layoutConfig?.referenceCapability,
  )!.layoutConfig!.referenceCapability as string;
  const capability = pin(capabilityKey),
    provider = pin("provider"),
    surfaceComponent = alloc(),
    displayComponent = alloc();
  const coreContext: NormalizedCoreContext = {
    ...coreFixtureContext(),
    entityId: labels.entityId,
    tenantId: null,
    identities,
    labels: labels.labels.map((l) => l.id),
    searchProfiles: source.searchProfiles!.map((p) => p.id!),
    relationIds: derivations.map((d) => d.relation.id),
    keyIds: source.keys!.map((k) => k.id!),
    domains: ["shared.ref_status_d"],
    contracts: [
      {
        kind: "reference",
        key: capabilityKey,
        version: 1,
        hash: capability.hash,
        parameterCount: 0,
      },
    ],
    components: [
      {
        id: surfaceComponent,
        level: "surface",
        surfaceKinds: ["list", "detail"],
        modes: ["table", "compact"],
      },
    ],
    catalogues: source.runtimeProfiles!.map((r) => ({
      hash: "a".repeat(64),
      plane: r.storagePlane!,
      schema: r.storageSchema!,
      object: r.storageObject!,
      columns: source.fields.map((field) => ({
        path: field.storagePath!,
        storageType: storageTypes[field.dataType]!,
        nullable: field.cardinality !== "one",
        supportedDataTypes: [field.dataType],
        cardinalities: ["one" as const],
      })),
    })),
  };
  const coreInput = {
    fieldMappings,
    runtimeMappings: Object.fromEntries(
      source.runtimeProfiles!.map((r) => [
        r.id!,
        {
          sourceHash: sha256(r),
          idFieldKey: "id",
          storageCatalogueHash: "a".repeat(64),
          readHandlerVersion: null,
          writeHandlerVersion: null,
          referenceCapability: { key: capabilityKey, version: 1 },
        },
      ]),
    ),
    context: coreContext,
    resources: { fields: pin("fields"), runtimeProfiles: pin("runtime") },
    relationReference: (relationId: string) => {
      const d = derivations.find((d) => d.relation.id === relationId)!;
      return {
        targetEntity: d.targetKey.entityCode,
        labelField: d.labelFieldKey,
        fields: d.fields.map((field) => ({
          source: source.fields.find((f) => f.id === field.sourceFieldId)!
            .fieldKey,
          target: field.targetFieldKey,
        })),
      };
    },
  };
  const scalar = createLegacyNativeCoreAdapters({
    ...coreInput,
    fields: source.fields,
    runtimeProfiles: source.runtimeProfiles!,
  });
  const fields = scalar.fields.forward(source.fields);
  const surfaces = source.surfaces!.map((s) =>
    coreFixtureRow("surface", s.id!, {
      surfaceKey: s.surfaceKey,
      surfaceKind: s.surfaceKind,
      labelId: owners.find((o) => o.surfaceId === s.id)!.titleLabelId,
      layoutKind: s.layoutKind ?? "stack",
      isDefault: true,
      componentContractId: surfaceComponent,
      columnCount: s.surfaceKind === "detail" ? 2 : null,
      showGroupBand: s.surfaceKind === "detail" ? false : null,
      maxFilters: s.surfaceKind === "list" ? 100 : null,
      maxFilterDepth: s.surfaceKind === "list" ? 10 : null,
      maxPageSize: s.surfaceKind === "list" ? 1000 : null,
      searchProfileId:
        s.surfaceKind === "list" ? source.searchProfiles![0]!.id! : null,
    }),
  );
  const presentation = fields.map((field) => ({
    fieldId: field.id,
    display: "plain" as const,
    queryUses: ["filter", "sort", "search", "group"],
    filterOperators: ["eq", "contains"],
    inputSurfaceIds: [],
    referenceSurfaceKeys: [],
    referenceLoadModes: [],
  }));
  const fieldPresentation = fields.map((field) => ({
    id: field.id,
    key: identities.find((i) => i.id === field.fieldIdentityId)!.fieldKey,
    uuid: field.dataType === "uuid",
    representation: "plain" as const,
  }));
  const sections: NormalizedLayoutRow<"section">[] = [];
  const bindings: NormalizedLayoutRow<"binding">[] = source
    .surfaceFieldBindings!.filter(
      (b) =>
        source.fields.find((f) => f.id === b.entityFieldId)!.dataType !==
        "uuid",
    )
    .map((b) =>
      layoutFixtureRow("binding", b.id!, {
        entitySurfaceId: b.entitySurfaceId,
        entitySurfaceSectionId: b.entitySurfaceSectionId ?? null,
        entityFieldId: b.entityFieldId,
        bindingKey: b.bindingKey,
        bindingKind: "field",
        labelOverrideId: null,
        position: b.position + 1,
        columnSpan: 1,
        componentDisplayId: displayComponent,
        meaningfulForForm: false,
      }),
    );
  const sectionMappings: Parameters<
    typeof import("./native-detail-sections.js").createLegacyNativeDetailSectionsAdapter
  >[0]["mappings"] = {};
  const navigationMappings: Parameters<
    typeof import("./legacy-native-navigation-adapter.js").createLegacyNativeNavigationAdapter
  >[0]["mappings"] = {};
  for (const s of source.surfaces!.filter((s) => s.surfaceKind === "detail")) {
    const record = s.layoutConfig!.recordPresentation as {
      sections: {
        key: string;
        label: string;
        localizedLabel: EntityRuntimeLocalizedTextV1;
        fields: string[];
      }[];
      navigation: EntityDetailNavigationV1;
    };
    const surface = surfaces.find((n) => n.id === s.id)!;
    const rows = record.sections.map((section, i) =>
      layoutFixtureRow("section", alloc(), {
        entitySurfaceId: s.id!,
        sectionKey: section.key,
        labelId: add(section.localizedLabel),
        sectionKind: "section",
        contentKind: "fields",
        position: i + 1,
        columnCount: 2,
        collapsible: false,
        collapsedByDefault: false,
        placement: "direct",
      }),
    );
    sections.push(...rows);
    const members = Object.fromEntries(
      record.sections.map((section, i) => [
        section.key,
        Object.fromEntries(
          section.fields.map((key, j) => {
            const field = fields.find(
              (f) =>
                identities.find(
                  (identity) => identity.id === f.fieldIdentityId,
                )!.fieldKey === key,
            )!;
            const b = bindings.find(
              (b) => b.entitySurfaceId === s.id && b.entityFieldId === field.id,
            )!;
            Object.assign(b, {
              entitySurfaceSectionId: rows[i]!.id,
              position: j + 1,
            });
            return [key, b];
          }),
        ),
      ]),
    );
    const context: NativeDetailSectionsContext = {
      surface,
      maximumMembers: 1000,
      fields: fieldPresentation,
      label: localized,
    };
    Object.assign(sectionMappings, {
      [s.id!]: {
        context,
        sections: Object.fromEntries(rows.map((row) => [row.sectionKey, row])),
        bindings: members,
      },
    });
    const navContext: NativeNavigationContext = {
      surface,
      maximumSections: 1000,
      label: localized,
    };
    const groups = Object.fromEntries(
      record.navigation.tabs!.map((tab) => [
        tab.key,
        {
          id: alloc(),
          labelId: tab.localizedLabel
            ? add(tab.localizedLabel)
            : plain("fixture.navigation." + tab.key, tab.label),
        },
      ]),
    );
    for (const tab of record.navigation.tabs!)
      tab.sectionKeys.forEach((key, i) =>
        Object.assign(
          rows.find((row) => row.sectionKey === key)!,
          { navigationGroupId: groups[tab.key]!.id, position: i + 1 },
        ),
      );
    Object.assign(navigationMappings, {
      [s.id!]: { context: navContext, sections: rows, groups },
    });
  }
  // Explicit dispositions, retaining the UUID fields and complete historical graph.
  const retirements = source
    .surfaceFieldBindings!.filter(
      (b) =>
        source.fields.find((f) => f.id === b.entityFieldId)!.dataType ===
        "uuid",
    )
    .map((b) => ({
      id: b.id!,
      surfaceId: b.entitySurfaceId,
      fieldId: b.entityFieldId,
      sourceHash: sha256(b),
      reason: "unplaced_uuid" as const,
    }));
  const choiceMappings = Object.fromEntries(
    [...choices].map(([fieldId, rows]) => [
      fieldId,
      {
        context: {
          field: fields.find((f) => f.id === fieldId)!,
          maximumChoices: 20,
          domainValues: ["active", "deprecated"],
          labelText,
        },
        choices: Object.fromEntries(
          rows.map((r) => [r.valueText, { id: r.id, labelId: r.labelId }]),
        ),
      },
    ]),
  );
  const listMappings = Object.fromEntries(
    surfaces
      .filter((s) => s.surfaceKind === "list")
      .map((s) => [
        s.id,
        {
          context: {
            entityId: labels.entityId,
            tenantId: null,
            surface: s,
            fields,
            bindings: bindings.filter((b) => b.entitySurfaceId === s.id),
            identities,
            presentation,
            maximumFields: 1000,
          },
          viewId: alloc(),
          viewKey: "default",
          fieldMemberIds: Object.fromEntries(
            bindings
              .filter(
                (b) =>
                  b.entitySurfaceId === s.id &&
                  (source.surfaceFieldBindings!.find((old) => old.id === b.id)!
                    .displayConfig!.defaultVisible ||
                    (
                      source.surfaces!.find((old) => old.id === s.id)!
                        .layoutConfig!.defaultState as {
                        sort: { field: string }[];
                      }
                    ).sort.some(
                      (sort) =>
                        sort.field ===
                        source.fields.find((f) => f.id === b.entityFieldId)!
                          .fieldKey,
                    )),
              )
              .map((b) => [
                identities.find(
                  (i) =>
                    i.id ===
                    fields.find((f) => f.id === b.entityFieldId)!
                      .fieldIdentityId,
                )!.fieldKey,
                alloc(),
              ]),
          ),
        },
      ]),
  );
  const badgeBindings: NormalizedLayoutRow<"binding">[] = [];
  const badgeMappings: Parameters<
    typeof import("./native-detail-badges.js").createLegacyNativeDetailBadgesAdapter
  >[0]["mappings"][number][] = [];
  for (const surface of source.surfaces!.filter(
    (s) => s.surfaceKind === "detail",
  )) {
    const badges = (
      surface.layoutConfig!.recordPresentation as {
        badges: { field: string }[];
      }
    ).badges;
    badges.forEach((badge, i) => {
      const field = source.fields.find((f) => f.fieldKey === badge.field)!;
      const b = layoutFixtureRow("binding", alloc(), {
        entitySurfaceId: surface.id!,
        entityFieldId: field.id!,
        bindingKey: "badge_" + badge.field,
        bindingKind: "badge",
        position: i + 1,
        columnSpan: 1,
        meaningfulForForm: false,
        componentDisplayId: displayComponent,
      });
      badgeBindings.push(b);
      badgeMappings.push({
        id: b.id,
        surfaceId: surface.id!,
        fieldId: field.id!,
        bindingKey: b.bindingKey,
        sourceIndex: i,
        sourceHash: sha256(badge),
      });
    });
  }
  const stages: LegacyNativeWholeSourceInput["stages"] = [
    ...(derivations.length
      ? [
          {
            kind: "relations" as const,
            resolve: () => ({ resource: pin("relations"), derivations }),
          },
        ]
      : []),
    {
      kind: "capability",
      resolve: () => ({
        resource: pin("capability"),
        binding: {
          runtimeId: source.runtimeProfiles![0]!.id!,
          key: capabilityKey,
          version: 1,
          resource: capability,
        },
      }),
    },
    {
      kind: "localization",
      resolve: () => ({ ...adapterBase("localization"), labels, owners }),
    },
    {
      kind: "choices",
      resolve: () => ({ ...adapterBase("choices"), mappings: choiceMappings }),
    },

    {
      kind: "semantics",
      resolve: () => ({ ...adapterBase("semantics"), fields }),
    },
    {
      kind: "sections",
      resolve: () => ({
        ...adapterBase("sections"),
        positionConvention: "zero-based",
        bindingRetirements: retirements,
        mappings: sectionMappings,
      }),
    },
    {
      kind: "navigation",
      resolve: () => ({
        resource: pin("navigation"),
        labelResource: pin("labels"),
        mappings: navigationMappings,
      }),
    },
    {
      kind: "view",
      resolve: () => ({ ...adapterBase("view"), mappings: listMappings }),
    },
    {
      kind: "badges",
      resolve: (g) => ({
        ...adapterBase("badges"),
        contexts: surfaces
          .filter((s) => s.surfaceKind === "detail")
          .map((surface) => ({
            surface,
            maximumBadges: 10,
            fields: [...choices].map(([fieldId]) => ({
              key: source.fields.find((f) => f.id === fieldId)!.fieldKey,
              representation: "plain" as const,
              choices: choiceMappings[fieldId]!.context,
            })),
          })),
        mappings: badgeMappings,
        bindings: badgeBindings,
        choices: g.referenceMembers!.members.fieldChoice,
      }),
    },
  ];
  // Resolve immutable fixture pin inventory before the converter starts; resolvers
  // may project these exact records but cannot fabricate installation evidence.
  for (const k of [
    "relations",
    "capability",
    "localization",
    "choices",
    "badges",
    "semantics",
    "sections",
    "navigation",
    "labels",
    "view",
    "retained",
    "whole",
    "surfaces",
    "surfaceSections",
    "surfaceFieldBindings",
  ])
    pin(k);
  const supplemental = { ...f.input };
  const { source: _, sourceHash: __, ...supplementalInput } = supplemental;
  for (const r of [
    supplementalInput.resource,
    ...supplementalInput.dependencies,
  ])
    pins.set(canonicalJson(r), r);
  const listSettings = Object.fromEntries(
    surfaces
      .filter((s) => s.surfaceKind === "list")
      .map((surface) => [
        surface.id,
        {
          surfaceId: surface.id,
          provider,
          modes: ["table" as const, "compact" as const],
          countModes: ["exact" as const],
          maximumPageSize: 1000,
          maximumPageSizeChoices: 20,
          maximumSortLevels: 20,
          maximumFilters: 100,
          maximumFilterDepth: 10,
        },
      ]),
  );
  const surfaceIdentities = Object.fromEntries(
    surfaces.map((surface) => [
      surface.id,
      {
        entityId: labels.entityId,
        tenantId: null,
        resource: pin("labels"),
        fields,
        identities,
        presentation,
        maximumFields: 1000,
      },
    ]),
  );
  const context: LegacyNativeWholeSourceInput["context"] = {
    source: {
      entityId: labels.entityId,
      changeSetId: labels.changeSetId,
      tenantId: null,
      revision: 1,
      graphHash: sha256(source),
    },
    sourceKind: "product",
    authoringSchemaHash: "a".repeat(64),
    maximumBytes: 10000000,
    maximumSupplementalMembers: 10000,
    installedAdapters: [...pins.values()],
    retainedValidation: {
      resource: pin("retained"),
      evidenceHash: sha256(source),
    },
    validateRetained: () => {},
    resolveLayout: (core, prepared) => ({
      core,
      coreContext: {
        ...coreContext,
        labels: prepared!.ownedLabels!.labels.map((l) => l.id),
      },
      maxMembers: 10000,
      navigationGroups: prepared!.referenceMembers!.members.navigationGroup.map(
        ({ id, entitySurfaceId, position }) => ({
          id,
          entitySurfaceId,
          position,
        }),
      ),
      overlays: [],
      capabilityLayouts: [],
      relatedTargets: [],
      components: [
        {
          id: displayComponent,
          level: "field_display",
          surfaceKinds: ["list", "detail"],
          dataTypes: [
            "uuid",
            "string",
            "boolean",
            "datetime",
            "integer",
            "enum",
          ],
          cardinalities: ["one", "zero_or_one"],
          options: [],
          filterOperators: [],
          compatibleDisplayIds: [],
          maskedRepresentationSafe: false,
        },
      ],
      fieldPresentation: presentation,
    }),
  };
  return {
    maximumSnapshotMembers: 10000,
    compilerContext(graph) {
      const {
        core: _,
        coreContext: __,
        ...layout
      } = context.resolveLayout(
        {
          field: graph.fields,
          runtime: graph.runtimeProfiles,
          surface: graph.surfaces,
        },
        graph as unknown as MetaEntityGraph,
      );
      return {
        graphHash: sha256(graph),
        authoringSchemaHash: context.authoringSchemaHash,
        core: {
          ...coreContext,
          labels: graph.ownedLabels!.labels.map((l) => l.id),
        },
        layout,
        structural: {
          fieldIds: graph.fields.map((f) => f.id),
          targets: derivations.map((d) => d.targetKey),
        },
        authorization: f.input.authorization.context,
        ai: f.input.ai.context,
        identityResource: pin("labels"),
        listProviders: Object.values(listSettings),
        domains: [
          { code: "shared.ref_status_d", values: ["active", "deprecated"] },
        ],
        relationLabels: derivations.map((d) => ({
          relationId: d.relation.id,
          labelFieldKey: d.labelFieldKey,
          resource: d.resource,
        })),
        components: [{ id: displayComponent, runtimeKey: "text" }],
      };
    },
    source,
    context,
    resource: pin("whole"),
    supplemental: supplementalInput,
    stages,
    core: (prepared) => ({
      ...coreInput,
      context: {
        ...coreContext,
        labels: prepared.ownedLabels!.labels.map((l) => l.id),
      },
    }),
    layout: (prepared) => ({
      positionConvention: "zero-based",
      positionMapping: "dense-siblings",
      fieldLabels: { resource: pin("labels"), fields },
      labelText,
      resources: {
        surfaces: pin("surfaces"),
        surfaceSections: pin("surfaceSections"),
        surfaceFieldBindings: pin("surfaceFieldBindings"),
      },
      listSettings,
      surfaceIdentities,
      mappings: {
        surfaces: Object.fromEntries(
          prepared.surfaces!.map((s) => [
            s.id!,
            {
              sourceHash: sha256(s),
              initialization: surfaces.find((n) => n.id === s.id)!,
            },
          ]),
        ),
        surfaceSections: Object.fromEntries(
          prepared.surfaceSections!.map((s) => [
            s.id!,
            {
              sourceHash: sha256(s),
              initialization: sections.find((n) => n.id === s.id)!,
            },
          ]),
        ),
        surfaceFieldBindings: Object.fromEntries(
          prepared.surfaceFieldBindings!.map((b) => [
            b.id!,
            {
              sourceHash: sha256(b),
              initialization: [...bindings, ...badgeBindings].find(
                (n) => n.id === b.id,
              )!,
            },
          ]),
        ),
      },
    }),
  };
}

it.each(
  ["country", "state_region"].flatMap((name) =>
    (["studio", "neon", "mesh"] as const).map(
      (plane) => [name, plane] as const,
    ),
  ),
)(
  "converts and compiles the entire %s/%s source through the production families and shared reader",
  (name, plane) => {
    const input = fixture(name, plane),
      original = structuredClone(input.source);
    const result = resolveLegacyNativeWholeSource(input),
      graph = result.proof.candidate;
    expect(graph.contractSchema).toBe("athyper.meta-entity-contract/2.5");
    expect(graph.fields.map((f) => f.id)).toEqual(
      original.fields.map((f) => f.id),
    );
    expect(input.source).toEqual(original);
    expect(graph.surfaceSections.length).toBeGreaterThan(0);
    expect(graph.ai.profile).toHaveLength(1);
    validateNativeSnapshotReferences(graph, graph.ownedLabels!, 10000);
    const compiler = input.compilerContext(graph);
    const artifact = compileNativeRelease(
      graph,
      compiler,
      graph.operations.map((operation) => ({
        ...operation,
        requiresMfa: false,
      })),
    );
    const runtime = graph.runtimeProfiles[0]!;
    const descriptor = compileNativeRuntimeProjection({
      native: artifact.descriptor,
      registration: {
        entityCode: graph.entity.entityCode,
        plane,
        storage: {
          schema: runtime.storageSchema!,
          object: runtime.storageObject!,
          idField: "id",
        },
        columns: original.fields.map((f) => f.storagePath!),
      },
      permissions: [
        ...new Set(original.operationPermissions!.map((p) => p.permissionCode)),
      ].map((code) => ({ code, scopeKinds: ["tenant"] })),
    });
    expect(Reflect.get(descriptor, "entityCode")).toBe(
      original.entity.entityCode,
    );
    expect(artifact.contractHash).toBe(sha256(graph));
    const originalRecord = original.surfaces!.find(
      (s) => s.surfaceKind === "detail",
    )!.layoutConfig!.recordPresentation as {
      navigation: EntityDetailNavigationV1;
    };
    expect(Reflect.get(descriptor, "recordPresentation")).toMatchObject({
      navigation: {
        mode: originalRecord.navigation.mode,
        tabs: originalRecord.navigation.tabs!.map(({ key, sectionKeys }) => ({
          key,
          sectionKeys,
        })),
      },
    });
  },
);

it("rejects stale source, duplicate stages, missing pins and unrepresented action declarations", () => {
  const budget = fixture("country");
  Reflect.set(budget.context, "maximumBytes", 1);
  expect(() => resolveLegacyNativeWholeSource(budget)).toThrow(
    "NATIVE_CONVERSION_LIMIT",
  );
  const rejected = fixture("country");
  Reflect.set(rejected.context, "validateRetained", () => {
    throw Error("retained owner evidence unavailable");
  });
  expect(() => resolveLegacyNativeWholeSource(rejected)).toThrow(
    "retained owner evidence unavailable",
  );
  const stale = fixture("country");
  Reflect.set(stale.source.entity, "title", "altered");
  expect(() => resolveLegacyNativeWholeSource(stale)).toThrow(
    "NATIVE_CONVERSION_SOURCE_HASH_MISMATCH",
  );
  const duplicated = fixture("country");
  Reflect.set(duplicated, "stages", [
    ...duplicated.stages,
    duplicated.stages[0]!,
  ]);
  expect(() => resolveLegacyNativeWholeSource(duplicated)).toThrow(
    "NATIVE_WHOLE_SOURCE_STAGE_INVALID",
  );
  const absent = fixture("country");
  Reflect.set(
    absent.context,
    "installedAdapters",
    absent.context.installedAdapters.filter((r) => r.key !== "choices"),
  );
  expect(() => resolveLegacyNativeWholeSource(absent)).toThrow(
    "NATIVE_CONVERSION_ADAPTER_NOT_INSTALLED",
  );
  const actions = fixture("country");
  Reflect.set(
    actions.source.surfaces!.find((s) => s.surfaceKind === "detail")!
      .layoutConfig!.recordPresentation as object,
    "actions",
    [{ key: "unrepresented" }],
  );
  Reflect.set(actions.context.source, "graphHash", sha256(actions.source));
  // Unknown nonempty actions also invalidate the explicit UUID retirement proof:
  // retirement is admitted only for the selected read-only presentation shape.
  expect(() => resolveLegacyNativeWholeSource(actions)).toThrow(
    "NATIVE_CONVERSION_RETIREMENT_INVALID",
  );
});

it("connects the whole-source resolver to the existing application/compiler/reader policy without supplying authority", async () => {
  const f = fixture("state_region"),
    tx = {} as import("kysely").Transaction<Record<string, never>>;
  const qualify = vi.fn(async () => {
    throw Error("independent authority unavailable");
  });
  const policy = createLegacyNativeWholeSourceApplicationPolicy({
    host: {
      commands: {
        authoringSchemaHash: f.context.authoringSchemaHash,
        maxMembers: 10000,
        maxCommands: 100,
        maxBatchBytes: 10000000,
      },
      snapshotVersions: [2],
      admit: vi.fn(),
      resolveContext: vi.fn(),
      resolveInitializer: vi.fn(),
    },
    maximumBytes: f.context.maximumBytes,
    qualify,
    conversion: async () => {
      const { source: _, compilerContext: __, ...resolved } = f;
      return resolved;
    },
    compiler: async (_tx, graph) => f.compilerContext(graph),
    reader: async (_tx, graph) => ({
      registration: {
        entityCode: graph.entity.entityCode,
        plane: "studio",
        storage: {
          schema: graph.runtimeProfiles[0]!.storageSchema!,
          object: graph.runtimeProfiles[0]!.storageObject!,
          idField: "id",
        },
        columns: f.source.fields.map((field) => field.storagePath!),
      },
      storagePlane: "studio",
      permissions: [
        ...new Set(f.source.operationPermissions!.map((p) => p.permissionCode)),
      ].map((code) => ({ code, scopeKinds: ["tenant"] })),
    }),
  });
  const input = {
    entityId: f.context.source.entityId,
    changeSetId: f.context.source.changeSetId,
    tenantId: null,
    actorId: id(3),
    expectedRevision: f.context.source.revision,
    expectedSourceHash: f.context.source.graphHash,
    idempotencyKey: "whole-source-proof",
  };
  await expect(policy.qualify(tx, input)).rejects.toThrow(
    "independent authority unavailable",
  );
  const proof = await policy.prepare(tx, input, f.source);
  const artifact = await policy.compile(
    tx,
    proof.candidate,
    proof.candidate.operations.map((operation) => ({
      ...operation,
      requiresMfa: false,
    })),
  );
  await expect(
    policy.verifyReader(tx, artifact, proof.candidate),
  ).resolves.toBeUndefined();
  expect(qualify).toHaveBeenCalledWith(tx, input);
});

it.each(["country", "state_region"])(
  "rejects historical %s read-field enrollment instead of treating it as native write enrollment",
  (name) => {
    const input = fixture(name);
    expect(
      input.source.operations.every(
        (operation) => operation.fieldKeys!.length === 0,
      ),
    ).toBe(true);
    const graph = structuredClone(
      resolveLegacyNativeWholeSource(input).proof.candidate,
    );
    Reflect.set(graph.referenceMembers!.members, "operationField", [
      {
        id: id(999999),
        entityOperationId: graph.operations[0]!.id,
        entityFieldId: graph.fields[0]!.id,
        position: 1,
        operationChangeSetId: graph.ownedLabels!.changeSetId,
      },
    ]);
    expect(() =>
      validateNativeSnapshotReferences(graph, graph.ownedLabels!, 10000),
    ).toThrow("REFERENCE_WRITE_OPERATION_INVALID");
    expect(() =>
      compileNativeRelease(
        graph,
        input.compilerContext(graph),
        graph.operations.map((operation) => ({
          ...operation,
          requiresMfa: false,
        })),
      ),
    ).toThrow("REFERENCE_WRITE_OPERATION_INVALID");
  },
);

it("rejects aggregate target, reference and budget corruption in a complete snapshot", () => {
  const input = fixture("country");
  const graph = resolveLegacyNativeWholeSource(input).proof.candidate;
  const validate = (value: typeof graph, budget = 10000) =>
    validateNativeSnapshotReferences(value, graph.ownedLabels!, budget);
  expect(() => validate(graph)).not.toThrow();
  const missingTarget = structuredClone(graph);
  Reflect.set(missingTarget.referenceMembers!.members, "target", []);
  expect(() => validate(missingTarget)).toThrow("REFERENCE_TARGET_UNDECLARED");
  const missingField = { ...graph, fields: [] };
  expect(() => validate(missingField)).toThrow("REFERENCE_FOREIGN_MEMBER");
  const branchMaximum = Math.max(
    ...Object.values(graph)
      .filter(Array.isArray)
      .map((rows) => rows.length),
  );
  expect(() => validate(graph, branchMaximum)).toThrow("NATIVE_SNAPSHOT_LIMIT");
});
