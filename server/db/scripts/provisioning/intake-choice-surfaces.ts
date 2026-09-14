import { createHash } from "node:crypto";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import type { EntityIntakeSurfaceV1 } from "../../../../packages/contracts/platform/entity-runtime/src/intake-surface";
function id(key: string) {
  const s = createHash("sha256").update(key).digest("hex");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-5${s.slice(13, 16)}-8${s.slice(17, 20)}-${s.slice(20, 32)}`;
}
/** Seed authoring rows, not runtime UI constants. Existing published definitions remain authoritative. */
export function withIntakeChoiceSurface(
  source: MetaEntityGraph,
  definition: EntityIntakeSurfaceV1,
): MetaEntityGraph {
  const graph = structuredClone(source),
    prefix = `${graph.entity.entityCode}.intake.${definition.key}`;
  const existing = graph.surfaces?.find((s) => s.surfaceKey === definition.key);
  // Idempotent provisioning must not overwrite an author's subsequent edits.
  if (existing?.layoutConfig?.renderer === "intake") return graph;
  const surfaceId = existing?.id ?? id(prefix),
    fields = [...graph.fields],
    sections = [...(graph.surfaceSections ?? [])],
    bindings = [...(graph.surfaceFieldBindings ?? [])];
  for (const [sectionPosition, section] of definition.sections.entries()) {
    const sectionId = id(`${prefix}.section.${section.key}`);
    sections.push({
      id: sectionId,
      entitySurfaceId: surfaceId,
      sectionKey: section.key,
      title: section.title,
      description: section.description,
      position: sectionPosition * 10,
      columnCount: 1,
    });
    for (const [position, field] of section.fields.entries()) {
      if (fields.some((f) => f.fieldKey === field.key))
        throw Error(`Intake field already exists: ${field.key}`);
      if (field.control !== "choiceCards")
        throw Error("Use the lookup authoring adapter for lookup fields");
      const fieldId = id(`${prefix}.field.${field.key}`);
      fields.push({
        id: fieldId,
        fieldKey: field.key,
        dataType: "string",
        typeConfig: { kind: "string", max_length: 127 },
        valueOrigin: "runtime",
        writeMode: "mutable",
        cardinality: "one",
        validationSpec: {
          schema_version: 1,
          rules: [
            {
              code: "allowed_choices",
              kind: "allowed_values",
              parameters: { values: field.options.map((o) => o.value) },
            },
          ],
        },
        status: "active",
      });
      bindings.push({
        id: id(`${prefix}.binding.${field.key}`),
        entitySurfaceId: surfaceId,
        entitySurfaceSectionId: sectionId,
        entityFieldId: fieldId,
        bindingKey: field.key,
        position: position * 10,
        labelOverride: field.label,
        helpText: field.helpText,
        widgetKey: "choice_cards",
        displayConfig: {
          required: field.required,
          options: field.options,
          ...field.presentation,
        },
        visibilityRule: field.visibleWhen,
        status: "active",
      });
    }
  }
  return {
    ...graph,
    fields,
    surfaceSections: sections,
    surfaceFieldBindings: bindings,
    surfaces: [
      ...(graph.surfaces ?? []).filter((s) => s.surfaceKey !== definition.key),
      {
        ...existing,
        id: surfaceId,
        surfaceKey: definition.key,
        surfaceKind: "form",
        title: definition.title,
        layoutKind: "flow",
        layoutConfig: {
          ...existing?.layoutConfig,
          renderer: "intake",
          columns: definition.columns,
        },
        status: "active",
      },
    ],
  };
}
export const businessPartnerRoleSurface: EntityIntakeSurfaceV1 = {
  schemaVersion: 1,
  key: "intake_partner",
  title: "Partner",
  columns: 1,
  sections: [
    {
      key: "role",
      fields: [
        {
          key: "requested_role",
          presentation: {
            layout: "grid",
            optionColumns: 2,
            density: "compact",
          },
          control: "choiceCards",
          label: "Role",
          required: true,
          options: [
            {
              value: "supplier",
              label: "Supplier",
              description: "We buy from them.",
            },
            {
              value: "customer",
              label: "Customer",
              description: "We sell to them.",
            },
          ],
        },
      ],
    },
  ],
};
/** Pilot vocabulary only. Domain eligibility is deliberately not invented from the layout sample. */
export const invoiceClassificationSurface: EntityIntakeSurfaceV1 = {
  schemaVersion: 1,
  key: "intake_classification",
  title: "Invoice classification",
  columns: 2,
  sections: [
    {
      key: "type",
      title: "Commercial purpose",
      fields: [
        {
          key: "invoice_type",
          control: "choiceCards",
          label: "Invoice type",
          required: true,
          options: [
            {
              value: "standard",
              label: "Standard",
              description: "Regular supplier invoice.",
            },
            {
              value: "credit_note",
              label: "Credit note",
              description: "Credit against an earlier invoice.",
            },
            { value: "debit_note", label: "Debit note" },
            { value: "advance", label: "Advance" },
            { value: "retention_release", label: "Retention release" },
            { value: "final", label: "Final" },
            { value: "self_billed", label: "Self-billed" },
          ],
        },
      ],
    },
    {
      key: "basis",
      title: "Commitment and supplier",
      fields: [
        {
          key: "invoice_basis",
          control: "choiceCards",
          label: "Invoice basis",
          required: true,
          options: [
            {
              value: "purchase_order",
              label: "PO-Based",
              description: "Reference an existing purchase order.",
            },
            {
              value: "contract",
              label: "Contract-Based",
              description: "Reference an existing contract.",
            },
            {
              value: "non_po",
              label: "Non-PO",
              description: "No purchase order or contract reference.",
            },
          ],
        },
        {
          key: "supplier_relationship",
          control: "choiceCards",
          label: "Supplier relationship",
          required: true,
          options: [
            { value: "existing", label: "Existing supplier" },
            { value: "one_time", label: "One-time supplier" },
          ],
        },
      ],
    },
  ],
};
export function withInvoiceClassification(graph: MetaEntityGraph) {
  if (
    !["supplier_invoice", "company_invoice"].includes(graph.entity.entityCode)
  )
    throw Error("Invoice graph required");
  return withIntakeChoiceSurface(graph, invoiceClassificationSurface);
}

/** Add lookup authoring rows without replacing existing role or surface author edits. */
export function withBusinessPartnerLookup(
  source: MetaEntityGraph,
): MetaEntityGraph {
  if (source.entity.entityCode !== "business_partner")
    throw Error("Business Partner graph required");
  const graph = structuredClone(source);
  const surface = graph.surfaces?.find(
    (s) => s.surfaceKey === "intake_partner",
  );
  if (!surface?.id || surface.layoutConfig?.renderer !== "intake")
    throw Error("Intake partner surface required");
  if (
    graph.surfaceFieldBindings?.some(
      (b) =>
        b.entitySurfaceId === surface.id && b.widgetKey === "entity_lookup",
    )
  )
    return graph;
  if (graph.fields.some((f) => f.fieldKey === "partner_lookup"))
    throw Error("Lookup field already exists without a compatible binding");
  const prefix = "business_partner.intake.partner_lookup",
    fieldId = id(prefix + ".field"),
    sectionId = id(prefix + ".section");
  return {
    ...graph,
    fields: [
      ...graph.fields,
      {
        id: fieldId,
        fieldKey: "partner_lookup",
        dataType: "string",
        typeConfig: { kind: "string", max_length: 127 },
        valueOrigin: "runtime",
        writeMode: "mutable",
        cardinality: "one",
        status: "active",
      },
    ],
    surfaceSections: [
      ...(graph.surfaceSections ?? []),
      {
        id: sectionId,
        entitySurfaceId: surface.id,
        sectionKey: "partner_search",
        title: "Find an existing partner",
        description:
          "Check existing suppliers and customers before requesting a new partner.",
        position: 20,
        columnCount: 1,
      },
    ],
    surfaceFieldBindings: [
      ...(graph.surfaceFieldBindings ?? []),
      {
        id: id(prefix + ".binding"),
        entitySurfaceId: surface.id,
        entitySurfaceSectionId: sectionId,
        entityFieldId: fieldId,
        bindingKey: "partner_lookup",
        position: 0,
        labelOverride: "Partner name or code",
        widgetKey: "entity_lookup",
        visibilityRule: { field: "requested_role", operator: "present" },
        status: "active",
        displayConfig: {
          required: false,
          lookup: {
            targetEntity: "business_partner",
            adapterKey: "business_partner.intake",
            mode: "choose",
            selectionMode: "single",
            recordAccess: "readOnly",
            presentation: { viewType: "full", fullViewHost: "inline" },
            creation: {
              showIn: ["full"],
              actionKey: "request_partner",
              label: "New partner request",
            },
            display: {
              settingsShowIn: ["full"],
              defaults: {
                layout: "table",
                density: "compact",
                searchBehavior: "instant",
              },
              userOverrides: ["layout", "density", "searchBehavior"],
              preferenceScope: "surface",
            },
            views: {
              defaultViewKey: "system",
              allowSwitching: true,
              usePersonalDefault: false,
            },
            recent: { enabled: false, limit: 5 },
            messages: {
              emptyTitle: "No business partners to display",
              emptyDescription: "You can request a new partner below.",
              noMatchesTitle: "No matching business partners found",
              noMatchesDescription: "Try another search term or adjust your filters.",
              selectMultiple: "Use selected partners",
            },
            searchLabel: "Search partners",
            emptyMessage:
              "No matching business partners found.",
            resultsMessage: "Select an existing partner to continue.",
            moreMessage:
              "More matches are available. Refine your search or open full view.",
            result: {
              titleFields: [
                "display_name",
                "registered_name",
                "legal_name",
                "name",
                "code",
              ],
              detailFields: ["code"],
            },
            actions: [
              { key: "select", kind: "select", label: "Use selected partner" },
              {
                key: "create_supplier",
                kind: "create",
                label: "New supplier request",
                visibleWhen: {
                  field: "requested_role",
                  operator: "equals",
                  value: "supplier",
                },
              },
              {
                key: "create_customer",
                kind: "create",
                label: "New customer request",
                visibleWhen: {
                  field: "requested_role",
                  operator: "equals",
                  value: "customer",
                },
              },
            ],
          },
        },
      },
    ],
  };
}
