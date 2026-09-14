import { withBusinessPartnerRequestCapture } from "./business-partner-request-capture.js";
import { createHash } from "node:crypto";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import type {
  IntakeDataField,
  IntakeInputField,
  EntityIntakeSurfaceV1,
} from "../../../../packages/contracts/platform/entity-runtime/src/intake-surface";
import { compileEntityIntakeSurfaces } from "../../../../packages/contracts/platform/entity-runtime/src/intake-surface-authoring";

const uid = (key: string) => {
  const h = createHash("sha256")
    .update(`bp.full-profile.v1.${key}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const snake = (s: string) => s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const field = (
  scope: string,
  key: string,
  label: string,
  required = false,
  extra: Partial<IntakeInputField> = {},
): IntakeInputField => ({
  control: "input",
  key: `${scope}_${snake(key)}`,
  valueKey: key,
  label,
  required,
  widget: "text",
  columnSpan: 4,
  ...extra,
});
const options = (values: readonly string[]) => ({
  widget: "select" as const,
  lookup: {
    options: values.map((value) => ({
      value,
      label: value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
    })),
  },
});
const country = {
  widget: "select" as const,
  lookup: {
    sourceKey: "iso.country",
    recent: {
      enabled: true,
      limit: 5,
      persistence: "server" as const,
      scope: "referenceSource" as const,
      retentionDays: 90,
    },
  },
  normalize: "uppercase" as const,
};
const dates = (scope: string) => [
  field(scope, "effectiveFrom", "Valid from", false, {
    widget: "date",
    maxLength: 10,
    placeholder: "YYYY-MM-DD",
  }),
  field(scope, "effectiveUntil", "Valid until", false, {
    widget: "date",
    maxLength: 10,
    placeholder: "YYYY-MM-DD",
  }),
];
const primary = (scope: string) =>
  field(scope, "isPrimary", "Primary", false, {
    widget: "checkbox",
    defaultValue: false,
  });

/** Authoring template only. Runtime renders the published fields/bindings, never this catalog. */
export function fullProfileItemSurfaces(): readonly EntityIntakeSurfaceV1[] {
  const item = (
    key: string,
    title: string,
    fields: readonly IntakeDataField[],
  ): EntityIntakeSurfaceV1 => ({
    schemaVersion: 1,
    key: `profile_${key}`,
    title,
    columns: 1,
    sections: [{ key: "fields", columns: 12, fields }],
  });
  return [
    item("alias", "Alias", [
      field("alias", "aliasName", "Alias name", true, {
        maxLength: 320,
        columnSpan: 8,
      }),
      field("alias", "aliasKind", "Name type", true, {
        ...options(["trading", "former", "legal", "search"]),
        defaultValue: "trading",
      }),
      field("alias", "languageCode", "Language code", false, { maxLength: 12 }),
      field("alias", "countryCode", "Country", false, country),
      ...dates("alias"),
      primary("alias"),
    ]),
    item("identifier", "Registration identifier", [
      field("identifier", "schemeCode", "Registration type", true, {
        maxLength: 63,
        placeholder: "business_registration",
      }),
      field("identifier", "value", "Registration number", true, {
        maxLength: 256,
        columnSpan: 8,
      }),
      field(
        "identifier",
        "issuingCountryCode",
        "Issuing country",
        true,
        country,
      ),
      field("identifier", "issuingAuthority", "Issuing authority", false, {
        maxLength: 256,
      }),
      ...dates("identifier"),
      primary("identifier"),
    ]),
    item("tax", "Tax registration", [
      field("tax", "jurisdictionId", "Tax jurisdiction", true, {
        widget: "select",
        lookup: { sourceKey: "neon.tax_jurisdiction" },
      }),
      field("tax", "taxTypeId", "Tax type", false, {
        widget: "select",
        lookup: { sourceKey: "neon.tax_type" },
      }),
      field("tax", "registrationTypeCode", "Registration type", true, {
        maxLength: 63,
        placeholder: "vat",
      }),
      field("tax", "value", "Tax registration number", true, {
        widget: "password",
        maxLength: 128,
        columnSpan: 8,
        helpText:
          "Stored through protected capture; review displays a masked value.",
      }),
      ...dates("tax"),
      primary("tax"),
    ]),
    item("classification", "Business classification", [
      field(
        "classification",
        "classificationKind",
        "Classification type",
        true,
        { ...options(["commodity", "industry"]), defaultValue: "commodity" },
      ),
      field(
        "classification",
        "commodityReferenceId",
        "Commodity category",
        true,
        {
          widget: "select",
          lookup: { sourceKey: "neon.commodity_category" },
          payload: { target: "canonical", path: "referenceId" },
          visibleWhen: {
            field: "classification_classification_kind",
            operator: "equals",
            value: "commodity",
          },
        },
      ),
      field(
        "classification",
        "industryReferenceId",
        "Industry classification",
        true,
        {
          widget: "select",
          lookup: { sourceKey: "shared.industry_code" },
          payload: { target: "canonical", path: "referenceId" },
          visibleWhen: {
            field: "classification_classification_kind",
            operator: "equals",
            value: "industry",
          },
        },
      ),
      field("classification", "domainCode", "Industry standard", false, {
        ...options(["isic", "naics"]),
        visibleWhen: {
          field: "classification_classification_kind",
          operator: "equals",
          value: "industry",
        },
      }),
      field("classification", "partnerRole", "Partner role", false, {
        ...options(["supplier", "customer"]),
        defaultValue: "supplier",
      }),
      ...dates("classification"),
      primary("classification"),
    ]),
    item("governance", "Governance member", [
      field("governance", "relationTypeCode", "Governance role", true, {
        maxLength: 63,
        placeholder: "director",
      }),
      field("governance", "memberName", "Member name", true, {
        maxLength: 320,
        columnSpan: 8,
      }),
      field("governance", "memberType", "Member type", true, {
        ...options([
          "individual",
          "organization",
          "trust",
          "public_float",
          "other",
        ]),
        defaultValue: "individual",
      }),
      field(
        "governance",
        "memberBusinessPartnerId",
        "Linked organization",
        false,
        {
          widget: "registered",
          handlerKey: "business_partner.reference",
          placeholder: "Search registered name",
          maxLength: 36,
          visibleWhen: {
            field: "governance_member_type",
            operator: "equals",
            value: "organization",
          },
        },
      ),
      field(
        "governance",
        "memberCountryCode",
        "Member country",
        false,
        country,
      ),
      field("governance", "businessTitle", "Business title", false, {
        maxLength: 256,
      }),
      ...["ownershipPct", "votingPct", "beneficialOwnershipPct"].map((k, i) =>
        field(
          "governance",
          k,
          ["Ownership %", "Voting %", "Beneficial ownership %"][i]!,
          false,
          { widget: "decimal" },
        ),
      ),
      field("governance", "appointedDate", "Appointed date", false, {
        widget: "date",
        maxLength: 10,
        placeholder: "YYYY-MM-DD",
      }),
      field("governance", "endOfTerm", "End of term", false, {
        widget: "date",
        maxLength: 10,
        placeholder: "YYYY-MM-DD",
      }),
      field("governance", "notes", "Notes", false, {
        widget: "textarea",
        maxLength: 4000,
        columnSpan: 12,
      }),
    ]),
    item("relationship", "Partner relationship", [
      field(
        "relationship",
        "targetBusinessPartnerId",
        "Related partner",
        true,
        {
          widget: "registered",
          handlerKey: "business_partner.reference",
          placeholder: "Search registered name",
          maxLength: 36,
        },
      ),
      field("relationship", "relationshipTypeCode", "Relationship type", true, {
        maxLength: 63,
        placeholder: "parent",
      }),
      field("relationship", "countryCode", "Country", false, country),
      ...dates("relationship"),
      field("relationship", "notes", "Notes", false, {
        widget: "textarea",
        maxLength: 4000,
        columnSpan: 12,
      }),
    ]),
    item("certification", "Certification", [
      field("certification", "customName", "Certificate name", true, {
        maxLength: 256,
        columnSpan: 8,
      }),
      field("certification", "certificateNumber", "Certificate number", false, {
        widget: "password",
        maxLength: 256,
      }),
      field("certification", "certifiedBy", "Issued by", false, {
        maxLength: 256,
      }),
      field("certification", "certifiedLocation", "Certified location", false, {
        maxLength: 256,
      }),
      field(
        "certification",
        "attachmentId",
        "Supporting attachment reference",
        false,
        { maxLength: 36 },
      ),
      ...dates("certification"),
    ]),
  ];
}

/** Explicit development authoring operation: preserve existing authored surfaces and identities. */
export function withBusinessPartnerFullProfile(
  source: MetaEntityGraph,
): MetaEntityGraph {
  if (source.entity.entityCode !== "business_partner")
    throw Error("Business Partner graph required");
  const graph = structuredClone(source) as any;
  const details = graph.surfaces.find(
    (s: any) => s.surfaceKey === "intake_details",
  );
  if (!details) throw Error("Published intake details required");
  if (details.layoutConfig?.fullProfilePrototypeVersion === 1) return withBusinessPartnerAddressRequiredness(withBusinessPartnerRequestCapture(graph));
  const rootSection = graph.surfaceSections
    .filter((s: any) => s.entitySurfaceId === details.id)
    .sort((a: any, b: any) => a.position - b.position)[0];
  const addField = (
    surfaceId: string,
    sectionId: string,
    f: IntakeDataField,
    position: number,
  ) => {
    if (graph.fields.some((x: any) => x.fieldKey === f.key))
      throw Error(`Duplicate profile field ${f.key}`);
    const type =
      f.control === "repeatableGroup"
        ? "json"
        : f.widget === "checkbox"
          ? "boolean"
          : f.widget === "decimal"
            ? "decimal"
            : f.widget === "integer"
              ? "integer"
              : "string";
    const fieldId = uid(f.key);
    graph.fields.push({
      id: fieldId,
      fieldKey: f.key,
      dataType: type,
      typeConfig: { kind: type },
      valueOrigin: "runtime",
      writeMode: "mutable",
      cardinality: "one",
      status: "active",
    });
    const { key, control, label, columnSpan, visibleWhen, ...displayConfig } =
      f;
    graph.surfaceFieldBindings.push({
      id: uid(`binding.${key}`),
      entitySurfaceId: surfaceId,
      entitySurfaceSectionId: sectionId,
      entityFieldId: fieldId,
      bindingKey: key,
      position,
      labelOverride: label,
      columnSpan,
      widgetKey: control === "input" ? "input" : "repeatable_group",
      ...(control === "input"
        ? { helpText: f.helpText, placeholder: f.placeholder }
        : {}),
      displayConfig,
      visibilityRule: visibleWhen,
      status: "active",
    });
  };
  addField(
    details.id,
    rootSection.id,
    field("details", "profileMode", "Profile view", false, {
      widget: "select",
      lookup: {
        options: [
          { value: "standard", label: "Standard request" },
          { value: "full", label: "Full profile" },
        ],
      },
      defaultValue: "standard",
      columnSpan: 12,
      helpText:
        "Full profile exposes optional sections for development testing. Remove additional profile values before switching to Standard request. Each added record is validated.",
      payload: { target: "request_only", path: "profileMode" },
    }),
    90,
  );
  let position =
    Math.max(
      ...graph.surfaceSections
        .filter((s: any) => s.entitySurfaceId === details.id)
        .map((s: any) => s.position),
    ) + 10;
  const full = {
    field: "details_profile_mode",
    operator: "equals" as const,
    value: "full",
  };
  const extendedIdentity = uid("section.identity");
  graph.surfaceSections.push({
    id: extendedIdentity,
    entitySurfaceId: details.id,
    sectionKey: "profile_identity",
    title: "Additional organization details",
    description: "Recommended timing: contract or profile completion.",
    position: position++,
    columnCount: 12,
    collapsible: true,
  });
  addField(
    details.id,
    extendedIdentity,
    field("profile", "incorporationDate", "Incorporation date", false, {
      widget: "date",
      maxLength: 10,
      placeholder: "YYYY-MM-DD",
      payload: { target: "canonical", path: "incorporationDate" },
      visibleWhen: full,
    }),
    0,
  );
  const groups = [
    [
      "aliases",
      "alias",
      "Alternate names",
      "Alias",
      "Optional profile completion.",
    ],
    [
      "identifiers",
      "identifier",
      "Business registration identifiers",
      "Identifier",
      "Capture when known; verify before the applicable contract or commitment.",
    ],
    [
      "taxRegistrations",
      "tax",
      "Tax registrations",
      "Tax registration",
      "Recommended timing: before applicable tax determination or invoice posting.",
    ],
    [
      "classifications",
      "classification",
      "Commodity and industry classifications",
      "Classification",
      "Recommended timing: quotation or qualification.",
    ],
    [
      "governanceRelations",
      "governance",
      "Governance and ownership",
      "Member",
      "Recommended timing: due diligence before the applicable contract.",
    ],
    [
      "relationships",
      "relationship",
      "Partner relationships",
      "Relationship",
      "Recommended timing: when a verified relationship is needed.",
    ],
    [
      "certifications",
      "certification",
      "Certifications",
      "Certificate",
      "Recommended timing: qualification, contract or before work begins.",
    ],
  ] as const;
  for (const [group, itemKey, title, itemLabel, description] of groups) {
    const sectionId = uid(`section.${group}`);
    graph.surfaceSections.push({
      id: sectionId,
      entitySurfaceId: details.id,
      sectionKey: `profile_${snake(group)}`,
      title,
      description,
      position: position++,
      columnCount: 12,
      collapsible: true,
    });
    addField(
      details.id,
      sectionId,
      {
        control: "repeatableGroup",
        key: `details_${snake(group)}`,
        valueKey: group,
        extensionGroup: group,
        label: title,
        itemLabel,
        addLabel: `Add ${itemLabel.toLowerCase()}`,
        removeLabel: `Remove ${itemLabel.toLowerCase()}`,
        itemSurfaceKey: `profile_${itemKey}`,
        minItems: 0,
        maxItems: 20,
        columnSpan: 12,
        visibleWhen: full,
        ...([
          "aliases",
          "identifiers",
          "classifications",
          "taxRegistrations",
        ].includes(group)
          ? {
              primaryField: "isPrimary",
              primaryLabel: `Primary ${itemLabel.toLowerCase()}`,
            }
          : {}),
      },
      0,
    );
  }
  for (const surface of fullProfileItemSurfaces()) {
    const surfaceId = uid(surface.key);
    graph.surfaces.push({
      id: surfaceId,
      surfaceKey: surface.key,
      surfaceKind: "form",
      title: surface.title,
      layoutKind: "flow",
      layoutConfig: { renderer: "intake", columns: 1 },
      status: "active",
    });
    const sectionId = uid(`${surface.key}.fields`);
    graph.surfaceSections.push({
      id: sectionId,
      entitySurfaceId: surfaceId,
      sectionKey: "fields",
      position: 0,
      columnCount: 12,
    });
    surface.sections[0]!.fields.forEach((f, i) =>
      addField(surfaceId, sectionId, f as IntakeDataField, i * 10),
    );
  }
  for (const b of graph.surfaceFieldBindings) {
    if (
      b.displayConfig?.valueKey === "legalForm" &&
      b.displayConfig?.payload?.target === "canonical"
    )
      b.displayConfig.maxLength = 100;
    if (
      b.displayConfig?.valueKey === "description" &&
      b.displayConfig?.payload?.target === "canonical"
    )
      b.displayConfig.maxLength = 4000;

  }
  details.layoutConfig = {
    ...details.layoutConfig,
    fullProfilePrototypeVersion: 1,
    formLabels: { ...details.layoutConfig.formLabels, saveDraft: "Save draft" },
  };
  compileEntityIntakeSurfaces(graph);
  return withBusinessPartnerAddressRequiredness(withBusinessPartnerRequestCapture(graph));
}

/** Repair old full-profile graphs too; item rules apply only to the full-profile collection. */
export function withBusinessPartnerAddressRequiredness(source: MetaEntityGraph): MetaEntityGraph {
  if (source.entity.entityCode !== "business_partner") throw Error("Business Partner graph required");
  const graph = structuredClone(source) as any;
  const address = graph.surfaces.find((s: any) => s.surfaceKey === "partner_address_intake");
  if (!address) return graph;
  for (const binding of graph.surfaceFieldBindings) {
    if (binding.entitySurfaceId === address.id && ["line1", "city"].includes(binding.displayConfig?.valueKey))
      binding.displayConfig.required = true;
    if (binding.displayConfig?.itemSurfaceKey === "partner_address_intake") {
      const parent = graph.surfaces.find((s: any) => s.id === binding.entitySurfaceId);
      if (parent?.surfaceKey === "intake_details")
        binding.displayConfig.itemFieldRules = [{when: {field: "details_profile_mode", operator: "equals", value: "full"}, fields: ["line1", "city"], required: false}];
    }
  }
  compileEntityIntakeSurfaces(graph);
  return graph;
}
