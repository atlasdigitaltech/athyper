import { presentationUuid, surfaceBindingLookup } from "./presentation-graph-helpers";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { compileEntityIntakeSurfaces } from "../../../../packages/contracts/platform/entity-runtime/src/intake-surface-authoring";
const regionUid = (key: string) => {
  return presentationUuid(`address-region.v1.${key}`);
};
export function withBusinessPartnerAddressRegion(source: MetaEntityGraph): MetaEntityGraph {
  return applyBusinessPartnerAddressRegion(structuredClone(source));
}

/** Internal pipeline step: mutates the caller-owned working graph. */
export function applyBusinessPartnerAddressRegion(source: MetaEntityGraph): MetaEntityGraph {
  if (source.entity.entityCode !== "business_partner")
    throw Error("Business Partner graph required");
  const graph = source as any;
  const surface = graph.surfaces.find(
    (s: any) => s.surfaceKey === "partner_address_intake",
  );
  const countryConfirmation = {
    mode: "dialog",
    title: "Change country to {next}?",
    fields: ["stateRegionCode", "region"],
    message:
      "The current state or region will be cleared. Your street address, city, and postal code will remain; review them for the new country.",
    confirmLabel: "Change country",
    cancelLabel: "Keep {previous}",
  };
  if (!surface) return graph;
  if (surface.layoutConfig?.addressRegionVersion === 1) {
    const country = graph.surfaceFieldBindings.find(
      (b: any) =>
        b.entitySurfaceId === surface.id &&
        b.displayConfig?.valueKey === "countryCode",
    );
    if (country) country.displayConfig.clearOnChange = countryConfirmation;
    return graph;
  }
  const bindings = graph.surfaceFieldBindings.filter(
    (b: any) => b.entitySurfaceId === surface.id,
  );
  const find = surfaceBindingLookup<any>(bindings, surface.id);
  const country = find("countryCode"),
    region = find("region"),
    postal = find("postalCode");
  if (!country || !region || !postal) return graph;
  const sectionId = region.entitySurfaceSectionId;
  const manual = {
    field: "address_region_mode",
    operator: "equals",
    value: "manual",
  };
  const add = (
    key: string,
    valueKey: string,
    label: string,
    widget: string,
    position: number,
    extra: any = {},
  ) => {
    const id = regionUid(key);
    graph.fields.push({
      id,
      fieldKey: key,
      dataType: "string",
      dataClassification: "internal",
      typeConfig: { kind: "string" },
      valueOrigin: "runtime",
      writeMode: "mutable",
      cardinality: "one",
      status: "active",
    });
    graph.surfaceFieldBindings.push({
      id: regionUid(`binding.${key}`),
      entitySurfaceId: surface.id,
      entitySurfaceSectionId: sectionId,
      entityFieldId: id,
      bindingKey: key,
      position,
      labelOverride: label,
      columnSpan: 6,
      showRequiredIndicator: true,
      widgetKey: "input",
      displayConfig: {
        valueKey,
        widget,
        required: false,
        maxLength: 128,
        ...extra,
      },
      status: "active",
    });
  };
  country.position = 0;
  find("purpose").position = 10;
  country.displayConfig.clearOnChange = countryConfirmation;
  find("line1").columnSpan = 12;
  find("line1").position = 0;
  find("line2").columnSpan = 12;
  find("line2").position = 10;
  find("city").position = 20;
  add(
    "address_state_region",
    "stateRegionCode",
    "State / Province / Region",
    "select",
    30,
    {
      lookup: {
        sourceKey: "shared.state_region",
        filterBy: [{ field: "countryCode", property: "countryCode" }],
        copyFields: [{ from: "name", to: "region" }],
        emptyText:
          "No listed subdivisions are available for this country. Use manual entry if a state or region is needed.",
      },
      variants: [{ when: manual, widget: "hidden" }],
      referenceRules: { field: "countryCode", label: "regionLabel" },
    },
  );
  region.position = 31;
  region.labelOverride = "State / Province / Region";
  region.displayConfig = {
    ...region.displayConfig,
    widget: "hidden",
    variants: [{ when: manual, widget: "text" }],
    referenceRules: { field: "countryCode", label: "regionLabel" },
    helpText:
      "Enter the state or region when it is not listed. Leave blank if not applicable.",
  };
  add(
    "address_region_mode",
    "regionEntryMode",
    "State / Region entry",
    "select",
    40,
    {
      defaultValue: "directory",
      lookup: {
        options: [
          { value: "directory", label: "Select from reference list" },
          { value: "manual", label: "Enter manually / not listed" },
        ],
      },
      clearOnChange: {
        fields: ["stateRegionCode", "region"],
        message:
          "Changing entry mode clears the current state or region. Other address details are preserved.",
        confirmLabel: "Change entry mode",
        cancelLabel: "Keep current",
      },
    },
  );
  postal.position = 50;
  postal.displayConfig = {
    ...postal.displayConfig,
    normalize: "uppercase",
    referenceRules: {
      field: "countryCode",
      label: "postalLabel",
      pattern: "postalPattern",
      placeholder: "postalExample",
      helpText: "postalHelp",
    },
  };
  for (const b of graph.surfaceFieldBindings) {
    if (b.displayConfig?.presentation?.renderer === "addresses") {
      b.displayConfig.presentation.summary = [
        { field: "line1" },
        { field: "city" },
        { field: "region" },
        { field: "postalCode" },
        { field: "countryCode" },
        { field: "purpose" },
      ];
      b.displayConfig.presentation.duplicateCheck = {
        fields: [
          "line1",
          "line2",
          "city",
          "region",
          "postalCode",
          "countryCode",
          "buildingName",
          "floor",
          "unit",
          "houseNumber",
          "streetName",
          "poBox",
        ],
        requireAny: ["line1", "poBox", "streetName"],
        label: "Possible duplicate",
        message:
          "This address matches another entry in this request. Review both entries before continuing.",
      };
    }
  }
  surface.layoutConfig = { ...surface.layoutConfig, addressRegionVersion: 1 };
  compileEntityIntakeSurfaces(graph);
  return graph;
}

const advancedUid = (key: string) => {
  return presentationUuid(`advanced-address.v1.${key}`);
};
export function withBusinessPartnerAdvancedAddress(source: MetaEntityGraph): MetaEntityGraph {
  return applyBusinessPartnerAdvancedAddress(structuredClone(source));
}

/** Internal pipeline step: mutates the caller-owned working graph. */
export function applyBusinessPartnerAdvancedAddress(source: MetaEntityGraph): MetaEntityGraph {
  if (source.entity.entityCode !== "business_partner")
    throw Error("Business Partner graph required");
  const graph = source as any;
  const surface = graph.surfaces.find(
    (s: any) => s.surfaceKey === "partner_address_intake",
  );
  if (!surface || surface.layoutConfig?.advancedAddressVersion === 1)
    return graph;
  const sectionId = advancedUid("section");
  graph.surfaceSections.push({
    id: sectionId,
    entitySurfaceId: surface.id,
    sectionKey: "additional_address_details",
    title: "Additional address details",
    description:
      "Choose an address type and add building, floor, unit or PO box details. Address lines are used for display when provided; structured street details are used when address lines are empty.",
    position: 90,
    columnCount: 12,
    collapsible: true,
    collapsedByDefault: true,
    layoutConfig: {
      header: { style: "accent", icon: "building" },
      populatedSummaryFields: [
        "addressKind",
        "buildingName",
        "floor",
        "unit",
        "houseNumber",
        "streetName",
        "poBox",
      ],
    },
  });
  const condition = (value: string) => ({
    field: "advanced_address_kind",
    operator: "equals",
    value,
  });
  const add = (
    key: string,
    label: string,
    widget: string,
    position: number,
    extra: any = {},
  ) => {
    const id = advancedUid(key);
    graph.fields.push({
      id,
      fieldKey:
        key === "addressKind"
          ? "advanced_address_kind"
          : `advanced_address_${key.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())}`,
      dataType: "string",
      typeConfig: { kind: "string" },
      valueOrigin: "runtime",
      writeMode: "mutable",
      cardinality: "one",
      status: "active",
    });
    graph.surfaceFieldBindings.push({
      id: advancedUid(`binding.${key}`),
      entitySurfaceId: surface.id,
      entitySurfaceSectionId: sectionId,
      entityFieldId: id,
      bindingKey:
        key === "addressKind"
          ? "advanced_address_kind"
          : `advanced_address_${key.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())}`,
      position,
      labelOverride: label,
      columnSpan: 6,
      widgetKey: "input",
      displayConfig: {
        valueKey: key,
        widget,
        required: false,
        maxLength: 160,
        ...extra,
      },
      status: "active",
    });
  };
  add("addressKind", "Address kind", "select", 0, {
    defaultValue: "street",
    lookup: {
      options: [
        { value: "street", label: "Street address" },
        { value: "po_box", label: "PO box" },
        { value: "rural", label: "Rural address" },
        { value: "military", label: "Military address" },
        { value: "other", label: "Other address" },
      ],
    },
    clearOnChange: {
      fields: [
        "buildingName",
        "floor",
        "unit",
        "houseNumber",
        "streetName",
        "poBox",
      ],
      message:
        "Changing address kind clears the building, floor, unit, structured street and PO box details. Address lines, city, region, postal code and country remain unchanged.",
      confirmLabel: "Change address kind",
      cancelLabel: "Keep current",
    },
  });
  for (const [key, label, index] of [
    ["buildingName", "Building name", 10],
    ["unit", "Unit / Suite", 20],
    ["floor", "Floor", 30],
    ["houseNumber", "House number", 40],
    ["streetName", "Street name", 50],
  ] as const)
    add(key, label, "text", index, {
      variants: ["po_box", "rural", "military", "other"].map((v) => ({
        when: condition(v),
        widget: "hidden",
      })),
    });
  add("poBox", "PO box number", "hidden", 60, {
    variants: [{ when: condition("po_box"), widget: "text", required: true }],
    helpText:
      "Enter the box number. Use City and Postal code above for the PO box destination.",
  });
  surface.layoutConfig = { ...surface.layoutConfig, advancedAddressVersion: 1 };
  compileEntityIntakeSurfaces(graph);
  return graph;
}
