import { applyBusinessPartnerBankEditor } from "./business-partner-bank-editor.js";
import { applyBusinessPartnerCollectionPresentations } from "./business-partner-collection-presentations.js";
import { presentationUuid } from "./presentation-graph-helpers";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import type {
  IntakeDataField,
  IntakeInputField,
} from "../../../../packages/contracts/platform/entity-runtime/src/intake-surface";
import { compileEntityIntakeSurfaces } from "../../../../packages/contracts/platform/entity-runtime/src/intake-surface-authoring";
const uid = (key: string) => {
  return presentationUuid(`bp.request-capture.v1.${key}`);
};
const input = (
  key: string,
  label: string,
  required = false,
  extra: Partial<IntakeInputField> = {},
): IntakeInputField => ({
  control: "input",
  key: `capture_${key.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())}`,
  valueKey: key,
  label,
  required,
  columnSpan: 6,
  widget: "text",
  maxLength: 256,
  ...extra,
});
const choice = (values: readonly string[]) => ({
  widget: "select" as const,
  lookup: {
    options: values.map((value) => ({
      value,
      label: value.replaceAll("_", " "),
    })),
  },
});
/** Request capture only: this authors no verification, acceptance or materialization operation. */
export const BUSINESS_PARTNER_REQUEST_HEADER_LABELS = {
      chooseRoleHint: "Choose a role to begin.",
      savedAt: "Saved at",
      copyReference: "Copy request number",
      referenceCopied: "Copied",
      copyFailed: "Unable to copy request number",
      changesNotSaved: "Changes not saved",
      requestTitle: "Business partner request",
      editTitle: "Edit business partner request",
      editDescription: "Update the draft, then review and submit.",
      close: "Close",
      draftStatus: "Draft",
      notSaved: "Not saved yet",
      unsavedChanges: "Unsaved changes",
      supplierRole: "Supplier",
      customerRole: "Customer",
} as const;

export function withBusinessPartnerRequestCapture(source: MetaEntityGraph): MetaEntityGraph {
  return applyBusinessPartnerRequestCapture(structuredClone(source));
}

/** Internal pipeline step: mutates the caller-owned working graph. */
export function applyBusinessPartnerRequestCapture(source: MetaEntityGraph): MetaEntityGraph {
  if (source.entity.entityCode !== "business_partner") throw Error("Business Partner graph required");
  const graph = source as any;
  const details = graph.surfaces.find(
    (s: any) => s.surfaceKey === "intake_details",
  );
  if (!details) throw Error("Intake details surface required");
  details.layoutConfig = {
    ...details.layoutConfig,
    formLabels: {
      ...details.layoutConfig?.formLabels,
      ...BUSINESS_PARTNER_REQUEST_HEADER_LABELS,
      saveDraft: "Save draft",
      draftSaved: "Draft saved",
      savingDraft: "Saving…",
      draftRetry:
        "The save outcome is unknown. Retry saving before making further changes.",
      incompatibleDraft:
        "This draft uses a different form definition. Its saved data has been preserved; reopen it with the matching published definition.",
    },
  };
  if (details.layoutConfig?.requestCaptureVersion === 1)
    return applyBusinessPartnerBankEditor(
      applyBusinessPartnerCollectionPresentations(graph),
    );
  const add = (
    surface: any,
    sectionId: string,
    f: IntakeDataField,
    position: number,
  ) => {
    const id = uid(f.key),
      { key, control, label, columnSpan, visibleWhen, ...displayConfig } = f;
    graph.fields.push({
      id,
      fieldKey: key,
      dataType: control === "repeatableGroup" ? "json" : "string",
      typeConfig: { kind: control === "repeatableGroup" ? "json" : "string" },
      valueOrigin: "runtime",
      writeMode: "mutable",
      cardinality: "one",
      status: "active",
    });
    graph.surfaceFieldBindings.push({
      id: uid(`binding.${key}`),
      entitySurfaceId: surface.id,
      entitySurfaceSectionId: sectionId,
      entityFieldId: id,
      bindingKey: key,
      position,
      labelOverride: label,
      columnSpan,
      widgetKey: control === "input" ? "input" : "repeatable_group",
      displayConfig,
      ...(visibleWhen ? { visibilityRule: visibleWhen } : {}),
      status: "active",
    });
  };
  const surface = (key: string, title: string, fields: IntakeDataField[]) => {
    const s = {
      id: uid(key),
      surfaceKey: key,
      surfaceKind: "form",
      title,
      layoutKind: "flow",
      layoutConfig: { renderer: "intake", columns: 1 },
      status: "active",
    };
    graph.surfaces.push(s);
    const sectionId = uid(`${key}.fields`);
    graph.surfaceSections.push({
      id: sectionId,
      entitySurfaceId: s.id,
      sectionKey: "fields",
      position: 0,
      columnCount: 12,
    });
    fields.forEach((f, i) => add(s, sectionId, f, i * 10));
    return s;
  };
  const documentTypes: Record<string, string[]> = {
    identifier: [
      "commercial_registration",
      "registry_extract",
      "registration_certificate",
    ],
    tax: ["tax_card", "vat_certificate", "exemption_certificate"],
    classification: ["brochure", "product_specification", "company_profile"],
    governance: ["ownership_chart", "shareholder_register", "authorization"],
    certification: ["certificate", "annex", "renewal"],
    bank: [
      "bank_confirmation",
      "account_certificate",
      "beneficiary_authorization",
    ],
  };
  const bank = surface("profile_bank", "Bank account", [
    input("accountHolderName", "Account holder name", true, {
      widget: "registered",
      handlerKey: "business_partner.account_holder",
      placeholder: "Use registered name",
    }),
    input("bankCountryCode", "Bank country", true, {
      widget: "select",
      lookup: { sourceKey: "iso.country" },
      normalize: "uppercase",
      maxLength: 2,
    }),
    input("bankName", "Bank name", true),
    input("accountIdType", "Account identifier type", true, {
      ...choice(["iban", "local_account"]),
      defaultValue: "local_account",
      helpText: "Clear the local routing code before switching to IBAN.",
    }),
    input("accountIdentifier", "IBAN / Account number", true, {
      widget: "password",
      maxLength: 64,
      helpText:
        "Stored through protected capture. Review shows a masked account identifier.",
    }),
    input("bic", "SWIFT / BIC", false, {
      normalize: "uppercase",
      maxLength: 11,
    }),
    input("clearingCode", "Local routing code", false, {
      maxLength: 64,
      visibleWhen: {
        field: "capture_account_id_type",
        operator: "equals",
        value: "local_account",
      },
    }),
    input("branch", "Branch", false, { maxLength: 160 }),
    input("currencyCode", "Account currency", false, {
      widget: "select",
      lookup: { sourceKey: "iso.currency" },
      maxLength: 3,
      normalize: "uppercase",
    }),
    input(
      "intendedUse",
      "Intended use",
      false,
      choice(["supplier_payment", "customer_refund"]),
    ),
    input("notes", "Notes", false, {
      widget: "textarea",
      columnSpan: 12,
      maxLength: 4000,
    }),
  ]);
  const sectionId = uid("bank.section");
  graph.surfaceSections.push({
    id: sectionId,
    entitySurfaceId: details.id,
    sectionKey: "request_bank_accounts",
    title: "Bank accounts",
    description:
      "Capture account details and supporting documents for this request.",
    position:
      Math.max(
        ...graph.surfaceSections
          .filter((s: any) => s.entitySurfaceId === details.id)
          .map((s: any) => s.position),
      ) + 10,
    columnCount: 12,
    collapsible: true,
  });
  add(
    details,
    sectionId,
    {
      control: "repeatableGroup",
      key: "capture_bank_accounts",
      valueKey: "bankAccounts",
      extensionGroup: "bankAccounts",
      label: "Bank accounts",
      itemLabel: "Bank account",
      addLabel: "Add bank account",
      removeLabel: "Remove bank account",
      itemSurfaceKey: bank.surfaceKey,
      minItems: 0,
      maxItems: 20,
      columnSpan: 12,
    },
    0,
  );
  for (const [key, types] of Object.entries(documentTypes)) {
    const parent = graph.surfaces.find(
      (s: any) => s.surfaceKey === `profile_${key}`,
    );
    if (!parent) throw Error(`Missing ${key} capture surface`);
    const doc = surface(`capture_document_${key}`, "Supporting document", [
      input(`${key}_documentType`, "Document type", true, {
        valueKey: "documentType",
        ...choice(types),
      }),
      input(`${key}_attachmentId`, "File", true, {
        valueKey: "attachmentId",
        widget: "registered",
        handlerKey: "business_partner.attachment",
        attachmentLabels: {
          uploading: "Uploading…",
          attached: "Attached document",
          unavailable: "Document is unavailable.",
          uploadFailed: "Upload failed. Select the file to retry.",
          processing:
            "The document is still processing or is not available for attachment.",
          selectExisting: "Select a document already added to this request",
        },
        maxLength: 36,
        helpText:
          "Upload a supporting document. Files remain subject to upload processing checks.",
      }),
      input(`${key}_issuedOn`, "Issue date", false, {
        valueKey: "issuedOn",
        widget: "date",
        maxLength: 10,
      }),
      input(`${key}_expiresOn`, "Expiry date", false, {
        valueKey: "expiresOn",
        widget: "date",
        maxLength: 10,
      }),
    ]);
    const sid = uid(`${key}.documents`);
    graph.surfaceSections.push({
      id: sid,
      entitySurfaceId: parent.id,
      sectionKey: "supporting_documents",
      title: "Supporting documents",
      position: 1000,
      columnCount: 12,
    });
    add(
      parent,
      sid,
      {
        control: "repeatableGroup",
        key: `capture_${key}_documents`,
        valueKey: "supportingDocuments",
        label: "Supporting documents",
        itemLabel: "Document",
        addLabel: "Add document",
        removeLabel: "Remove document",
        itemSurfaceKey: doc.surfaceKey,
        minItems: 0,
        maxItems: 10,
        columnSpan: 12,
      },
      0,
    );
  }
  // Replace the prototype's free-text attachment UUID with actual upload capture.
  graph.surfaceFieldBindings = graph.surfaceFieldBindings.filter(
    (b: any) => !(b.bindingKey === "certification_attachment_id"),
  );
  graph.fields = graph.fields.filter(
    (field: any) =>
      field.fieldKey !== "certification_attachment_id" ||
      graph.surfaceFieldBindings.some(
        (binding: any) => binding.entityFieldId === field.id,
      ),
  );
  details.layoutConfig = { ...details.layoutConfig, requestCaptureVersion: 1 };
  compileEntityIntakeSurfaces(graph);
  return applyBusinessPartnerBankEditor(
    applyBusinessPartnerCollectionPresentations(graph),
  );
}
