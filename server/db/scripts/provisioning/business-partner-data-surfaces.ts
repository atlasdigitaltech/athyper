import { withBusinessPartnerOrganizationIdentity } from "./business-partner-organization-identity.js";
import { createHash } from "node:crypto";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import {
  parseEntityIntakeSurfaces,
  type EntityIntakeSurfaceV1,
  type IntakeDataField,
  type IntakeInputField,
} from "../../../../packages/contracts/platform/entity-runtime/src/intake-surface";
import type { RequestFormDescriptor } from "../../../../packages/planes/neon/business-partner/src/request-form-descriptor";
const id = (key: string) => {
  const h = createHash("sha256").update(key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const snake = (key: string) =>
  key.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
/** One-time import of the currently published form, not an independent runtime definition. */
export function businessPartnerDataSurfaces(
  form: RequestFormDescriptor,
): readonly EntityIntakeSurfaceV1[] {
  const input = (
    scope: string,
    valueKey: string,
    label: string,
    widget: IntakeInputField["widget"] = "text",
    extra: Partial<IntakeInputField> = {},
  ): IntakeInputField => ({
    control: "input",
    key: `${scope}_${snake(valueKey)}`,
    valueKey,
    label,
    widget,
    required: false,
    columnSpan: 3,
    ...extra,
  });
  const group = (
    key: string,
    label: string,
    itemLabel: string,
    itemSurfaceKey: string,
    minItems: number,
    maxItems: number,
    addLabel: string,
  ): IntakeDataField => ({
    control: "repeatableGroup",
    key: `details_${key}`,
    valueKey: key,
    label,
    itemLabel,
    itemSurfaceKey,
    minItems,
    maxItems,
    addLabel,
    removeLabel: `Remove ${itemLabel.toLowerCase()}`,
    primaryField: "isPrimary",
    primaryLabel: `Primary ${itemLabel.toLowerCase()}`,
    columnSpan: 12,
  });
  const components = form.sections.flatMap((s) => s.components ?? []),
    addresses = components.find((c) => c.kind === "addresses"),
    contacts = components.find((c) => c.kind === "contacts");
  if (!addresses || !contacts)
    throw Error("Published relationship components required");
  const country = {
    lookup: { sourceKey: "iso.country", recent: { enabled: true, limit: 5, persistence: "server" as const, scope: "referenceSource" as const, retentionDays: 90 } },
    placeholder: "Select country",
    required: true,
    normalize: "uppercase" as const,
  };
  const purpose = (options: readonly { value: string; label: string }[]) => ({
    lookup: { options },
    defaultValue: options[0]!.value,
    required: true,
  });
  const surface = (
    key: string,
    title: string,
    fields: readonly IntakeDataField[],
  ): EntityIntakeSurfaceV1 => ({
    schemaVersion: 1,
    key,
    title,
    columns: 1,
    sections: [{ key: "fields", columns: 12, fields }],
  });
  const result: EntityIntakeSurfaceV1[] = [
    {
      schemaVersion: 1,
      key: "intake_details",
      title: form.title,
      formLabels: { continue: "Continue to review", submit: form.submitLabel },
      columns: 1,
      sections: form.sections.map((s) => ({
        key: s.key,
        title: s.title,
        description: s.description,
        columns: 12,
        fields: [
          ...s.fields.map((f) =>
            input(
              "details",
              f.key,
              f.label,
              f.widget === "lookup"
                ? "select"
                : f.widget === "operating_organization"
                  ? "registered"
                  : f.widget,
              {
                required: f.required,
                columnSpan:
                  f.columnSpan ??
                  (f.widget === "operating_organization" ? 12 : f.key === "name" ? 6 : 3),
                helpText: f.helpText,
                placeholder:
                  f.placeholder ??
                  (f.widget === "lookup"
                    ? `Select ${f.label.toLowerCase()}`
                    : undefined),
                defaultValue: f.defaultValue,
                maxLength: f.key === "name" ? 320 : f.maxLength,
                normalize: f.normalize,
                ...(f.widget === "operating_organization"
                  ? {
                      handlerKey: "business_partner.organization",
                      placeholder:
                        "Select an authorized procurement or sales organization",
                    }
                  : {}),
                ...(f.lookup
                  ? {
                      lookup:
                        f.lookup.code === "iso.country"
                          ? { sourceKey: "iso.country", recent: { enabled: true, limit: 5, persistence: "server" as const, scope: "referenceSource" as const, retentionDays: 90 } }
                          : { options: f.lookup.options },
                    }
                  : {}),
                ...(f.visibility
                  ? {
                      visibleWhen: (() => {
                        if (f.visibility!.operator !== "equals")
                          throw Error("Unsupported imported visibility");
                        return {
                          field: `details_${snake(f.visibility!.field)}`,
                          operator: "equals" as const,
                          value: f.visibility!.value as string,
                        };
                      })(),
                    }
                  : {}),
                payload: { target: f.target, path: f.path },
              },
            ),
          ),
          ...(s.components ?? []).map((c) =>
            group(
              c.key,
              c.title,
              c.kind === "addresses" ? "Address" : "Contact",
              c.kind === "addresses"
                ? "partner_address_intake"
                : "partner_contact_intake",
              c.minItems,
              c.maxItems,
              c.addLabel,
            ),
          ),
        ],
      })),
    },
    surface("partner_address_intake", "Address", [
      input(
        "address",
        "purpose",
        "Purpose",
        "select",
        purpose(addresses.lookups.purposes),
      ),
      input("address", "countryCode", "Country", "select", country),
      input("address", "line1", "Address line 1", "text", {
        required: true,
        maxLength: 255,
      }),
      input("address", "line2", "Address line 2", "text", { maxLength: 255 }),
      input("address", "city", "City", "text", {
        required: true,
        maxLength: 128,
      }),
      input("address", "region", "Region", "text", { maxLength: 128 }),
      input("address", "postalCode", "Postal code", "text", { maxLength: 32 }),
      input("address", "isPrimary", "Primary address", "checkbox"),
    ]),
    surface("partner_contact_intake", "Contact", [
      input("contact", "contactName", "Contact name", "text", {
        required: true,
        maxLength: 255,
      }),
      input("contact", "businessTitle", "Business title", "text", {
        maxLength: 255,
      }),
      input("contact", "departmentName", "Department", "text", {
        maxLength: 255,
      }),
      input("contact", "isPrimary", "Primary contact", "checkbox"),
      group(
        "channels",
        "Communication channels",
        "Channel",
        "partner_channel_intake",
        1,
        10,
        "Add channel",
      ),
    ]),
    surface("partner_channel_intake", "Communication channel", [
      input(
        "channel",
        "channelType",
        "Channel type",
        "select",
        purpose(contacts.lookups.channels!),
      ),
      input(
        "channel",
        "purpose",
        "Purpose",
        "select",
        purpose(contacts.lookups.purposes),
      ),
      input("channel", "value", "Contact detail", "text", {
        required: true,
        maxLength: 320,
      }),
      input("channel", "isPrimary", "Primary channel", "checkbox"),
    ]),
  ];
  return parseEntityIntakeSurfaces(result)!;
}
export function withBusinessPartnerDataSurfaces(
  source: MetaEntityGraph,
  form: RequestFormDescriptor,
): MetaEntityGraph {
  if (source.entity.entityCode !== "business_partner")
    throw Error("Business Partner graph required");
  const graph = {...structuredClone(source), fields:[...source.fields], surfaces:[...(source.surfaces??[])],surfaceSections:[...(source.surfaceSections??[])],surfaceFieldBindings:[...(source.surfaceFieldBindings??[])]};
  if (
    graph.surfaces?.find((s) => s.surfaceKey === "intake_details")?.layoutConfig
      ?.renderer === "intake"
  )
    return withBusinessPartnerOrganizationIdentity(withBusinessPartnerReferenceHistory(graph));
  for (const definition of businessPartnerDataSurfaces(form)) {
    const existing = graph.surfaces?.find(
        (s) => s.surfaceKey === definition.key,
      ),
      prefix = `business_partner.data.${definition.key}`,
      surfaceId = existing?.id ?? id(prefix);
    if (
      existing &&
      (graph.surfaceFieldBindings ?? []).some(
        (b) => b.entitySurfaceId === existing.id,
      )
    )
      throw Error("Refuse to replace an authored details surface");
    graph.surfaces = (graph.surfaces ?? []).filter((s) => s.id !== surfaceId);
    graph.surfaceSections = (graph.surfaceSections ?? []).filter(
      (s) => s.entitySurfaceId !== surfaceId,
    );
    graph.surfaces.push({
      ...existing,
      id: surfaceId,
      surfaceKey: definition.key,
      surfaceKind: "form",
      title: definition.title,
      layoutKind: "flow",
      layoutConfig: {
        ...existing?.layoutConfig,
        renderer: "intake",
        columns: 1,
        ...(definition.formLabels ? { formLabels: definition.formLabels } : {}),
      },
      status: "active",
    });
    for (const [position, section] of definition.sections.entries()) {
      const sectionId = id(`${prefix}.${section.key}`);
      graph.surfaceSections.push({
        id: sectionId,
        entitySurfaceId: surfaceId,
        sectionKey: section.key,
        title: section.title,
        description: section.description,
        position: position * 10,
        columnCount: 12,
      });
      for (const [index, candidate] of section.fields.entries()) {
        const f = candidate as IntakeDataField,
          fieldId = id(`${prefix}.${f.key}`);
        if (graph.fields.some((x) => x.fieldKey === f.key))
          throw Error(`Field collision: ${f.key}`);
        const type =
          f.control === "repeatableGroup"
            ? "json"
            : f.widget === "checkbox"
              ? "boolean"
              : f.widget === "integer"
                ? "integer"
                : f.widget === "decimal"
                  ? "decimal"
                  : "string";
        graph.fields.push({
          id: fieldId,
          fieldKey: f.key,
          dataType: type,
          typeConfig: { kind: type },
          valueOrigin: "runtime",
          writeMode: "mutable",
          cardinality: "one",
          status: "active",
        } as MetaEntityGraph["fields"][number]);
        graph.surfaceFieldBindings ??= [];
        const { key, control, label, columnSpan, visibleWhen, ...config } = f;
        graph.surfaceFieldBindings.push({
          id: id(`${prefix}.binding.${key}`),
          entitySurfaceId: surfaceId,
          entitySurfaceSectionId: sectionId,
          entityFieldId: fieldId,
          bindingKey: key,
          position: index * 10,
          labelOverride: label,
          columnSpan,
          widgetKey: control === "input" ? "input" : "repeatable_group",
          ...(control === "input"
            ? {
                helpText: (f as IntakeInputField).helpText,
                placeholder: (f as IntakeInputField).placeholder,
              }
            : {}),
          displayConfig: config,
          visibilityRule: visibleWhen,
          status: "active",
        });
      }
    }
  }
  return withBusinessPartnerOrganizationIdentity(graph);
}

/** Add the new default only where an author has not chosen a history policy. */
export function withBusinessPartnerReferenceHistory(source: MetaEntityGraph): MetaEntityGraph {
  if(source.entity.entityCode!=="business_partner")throw Error("Business Partner graph required");
  const surfaces=new Set(source.surfaces?.filter(s=>s.layoutConfig?.renderer==="intake").map(s=>s.id));
  return {...source,surfaceFieldBindings:source.surfaceFieldBindings?.map(binding=>{
    const lookup=binding.displayConfig?.lookup as Record<string,unknown>|undefined;
    if(!surfaces.has(binding.entitySurfaceId)||binding.widgetKey!=="input"||lookup?.sourceKey!=="iso.country"||lookup.recent!==undefined)return binding;
    return {...binding,displayConfig:{...binding.displayConfig,lookup:{...lookup,recent:{enabled:true,limit:5,persistence:"server",scope:"referenceSource",retentionDays:90}}}};
  })};
}

/** Entity-wide defaults live once on the intake root; field bindings can override them. */
export function withBusinessPartnerValidationMessages(source: MetaEntityGraph): MetaEntityGraph {
  if(source.entity.entityCode!=="business_partner")throw Error("Business Partner graph required");
  const root=source.surfaces?.find(s=>s.surfaceKey==="intake_details");
  if(!root)throw Error("Business Partner intake surface required");
  return {...source,
    surfaces:source.surfaces?.map(s=>s.id===root.id?{...s,layoutConfig:{...s.layoutConfig,entityValidationMessages:{required:"validation.required",maxLength:"validation.maxLength",...(s.layoutConfig?.entityValidationMessages as Record<string,string>|undefined)}}}:s),
    surfaceFieldBindings:source.surfaceFieldBindings?.map(b=>b.entitySurfaceId===root.id&&b.displayConfig?.valueKey==="name"?{...b,displayConfig:{...b.displayConfig,maxLength:320}}:b),
  };
}
