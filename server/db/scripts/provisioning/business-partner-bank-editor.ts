import { presentationUuid, surfaceBindingLookup } from "./presentation-graph-helpers";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { compileEntityIntakeSurfaces } from "../../../../packages/contracts/platform/entity-runtime/src/intake-surface-authoring";
const uid = (key: string) => {
  return presentationUuid(`bank-editor.v1.${key}`);
};
/** Bank semantics are authored here on Meta Entity, never inferred by the section component. */
export function withBusinessPartnerBankEditor(source: MetaEntityGraph): MetaEntityGraph {
  return applyBusinessPartnerBankEditor(structuredClone(source));
}

/** Internal pipeline step: mutates the caller-owned working graph. */
export function applyBusinessPartnerBankEditor(source: MetaEntityGraph): MetaEntityGraph {
  if (source.entity.entityCode !== "business_partner") throw Error("Business Partner graph required");
  const graph = source as any;
  const root = graph.surfaces.find(
      (s: any) => s.surfaceKey === "intake_details",
    ),
    surface = graph.surfaces.find((s: any) => s.surfaceKey === "profile_bank");
  if (!root || !surface || root.layoutConfig?.bankEditorVersion === 2)
    return applyCompactBankCopy(graph);
  if (root.layoutConfig?.bankEditorVersion === 1) {
    const fields = graph.surfaceFieldBindings.filter(
      (b: any) => b.entitySurfaceId === surface.id,
    );
    fields.find(
      (b: any) => b.displayConfig?.valueKey === "bic",
    ).displayConfig.format = "bic";
    const identifier = fields.find(
      (b: any) => b.displayConfig?.valueKey === "accountIdentifier",
    );
    identifier.displayConfig.variants = identifier.displayConfig.variants.map(
      (v: any) => ({ ...v, format: v.when.value === "iban" ? "iban" : "none" }),
    );
    root.layoutConfig = { ...root.layoutConfig, bankEditorVersion: 2 };
    compileEntityIntakeSurfaces(graph);
    return applyCompactBankCopy(graph);
  }
  const bankSection = graph.surfaceSections.find(
    (s: any) => s.entitySurfaceId === surface.id && s.title === "Bank details",
  );
  const accountSection = graph.surfaceSections.find(
    (s: any) =>
      s.entitySurfaceId === surface.id && s.title === "Account details",
  );
  if (!bankSection || !accountSection)
    throw Error("Bank editor sections required");
  const find = surfaceBindingLookup<any>(graph.surfaceFieldBindings, surface.id);
  const directory = {
      field: "bank_source",
      operator: "equals",
      value: "directory",
    },
    unlisted = { ...directory, value: "unlisted" };
  const warning = (fields: string[]) => ({
    fields,
    message:
      "Changing this selection clears the selected bank, branch and copied directory details. Your account number and account holder remain unchanged.",
    confirmLabel: "Confirm change",
    cancelLabel: "Keep current",
  });
  const add = (
    key: string,
    label: string,
    widget: string,
    position: number,
    extra: any = {},
  ) => {
    const id = uid(key);
    graph.fields.push({
      id,
      fieldKey: key,
      dataType: "string",
      typeConfig: { kind: "string" },
      valueOrigin: "runtime",
      writeMode: "mutable",
      cardinality: "one",
      status: "active",
    });
    graph.surfaceFieldBindings.push({
      id: uid(`binding.${key}`),
      entitySurfaceId: surface.id,
      entitySurfaceSectionId: bankSection.id,
      entityFieldId: id,
      bindingKey: key,
      position,
      labelOverride: label,
      columnSpan: 6,
      widgetKey: "input",
      displayConfig: {
        valueKey: key,
        widget,
        required: false,
        maxLength: 256,
        ...extra,
      },
      status: "active",
    });
  };
  add("bank_source", "Bank selection", "select", 10, {
    valueKey: "bankSource",
    required: true,
    defaultValue: "directory",
    lookup: {
      options: [
        { value: "directory", label: "Select from bank directory" },
        { value: "unlisted", label: "Bank not listed — enter for review" },
      ],
    },
    clearOnChange: warning([
      "bankInstitutionId",
      "bankBranchId",
      "bankDirectoryReleaseId",
      "bankName",
      "branch",
      "bic",
    ]),
  });
  add("bank_institution", "Bank", "select", 20, {
    valueKey: "bankInstitutionId",
    lookup: {
      sourceKey: "shared.bank_institution",
      filterBy: [{ field: "bankCountryCode", property: "countryCode" }],
      copyFields: [
        { from: "name", to: "bankName" },
        { from: "bic", to: "bic" },
        { from: "releaseId", to: "bankDirectoryReleaseId" },
      ],
      emptyText:
        "No published banks are available for this country. Choose “Bank not listed” to enter details for review.",
    },
    clearOnChange: warning(["bankBranchId", "branch", "bic"]),
    variants: [
      { when: directory, required: true },
      { when: unlisted, widget: "hidden" },
    ],
  });
  add("bank_branch", "Branch", "select", 30, {
    valueKey: "bankBranchId",
    lookup: {
      sourceKey: "shared.bank_branch",
      filterBy: [
        { field: "bankInstitutionId", property: "institutionId" },
        { field: "bankCountryCode", property: "countryCode" },
      ],
      copyFields: [{ from: "branch", to: "branch" }],
      emptyText:
        "No published branches are available for this bank. Leave the branch unselected; do not guess.",
    },
    variants: [{ when: unlisted, widget: "hidden" }],
  });
  add("bank_directory_release", "Bank directory release", "hidden", 99, {
    valueKey: "bankDirectoryReleaseId",
    maxLength: 36,
  });
  const country = find("bankCountryCode");
  country.position = 0;
  country.displayConfig.clearOnChange = warning([
    "bankInstitutionId",
    "bankBranchId",
    "bankDirectoryReleaseId",
    "bankName",
    "branch",
    "bic",
    "accountIdType",
  ]);
  const name = find("bankName");
  name.position = 40;
  name.displayConfig.variants = [
    { when: directory, widget: "hidden", required: false },
  ];
  name.helpText =
    "Unlisted bank details are captured for review; they are not a verified directory match.";
  const branch = find("branch");
  branch.position = 50;
  branch.displayConfig.variants = [{ when: directory, widget: "hidden" }];
  const bic = find("bic");
  bic.position = 60;
  bic.displayConfig.format = "bic";
  bic.helpText =
    "Directory selection fills an unambiguous BIC when available. Check the identifier required for this account.";
  const holder = find("accountHolderName");
  holder.placeholder = "Use registered name";
  holder.helpText =
    "Enter the name held by the bank, or copy the partner’s registered name.";
  const type = find("accountIdType");
  type.displayConfig.lookup = {
    sourceKey: "control.bank_account_type",
    filterBy: [{ field: "bankCountryCode", property: "countries" }],
    fallbackToAll: true,
  };
  delete type.displayConfig.defaultValue;
  type.helpText =
    "Formats follow the published country rules where available. Payment-rail requirements are checked separately.";
  const identifier = find("accountIdentifier");
  identifier.displayConfig.revealLabels = { show: "Show", hide: "Hide" };
  identifier.displayConfig.variants = [
    {
      when: { field: type.bindingKey, operator: "equals", value: "iban" },
      label: "IBAN",
      format: "iban",
      helpText: "Enter the full IBAN shown by your bank.",
    },
    {
      when: {
        field: type.bindingKey,
        operator: "equals",
        value: "local_account",
      },
      label: "Account number",
      format: "none",
      helpText: "Enter the account number exactly as shown by your bank.",
    },
  ];
  const intended = find("intendedUse");
  intended.displayConfig.lookup = {
    options: [
      { value: "supplier_payment", label: "Supplier payment" },
      { value: "customer_refund", label: "Customer refund" },
    ],
  };
  for (const [position, key] of [
    "accountHolderName",
    "accountIdType",
    "accountIdentifier",
    "clearingCode",
    "currencyCode",
    "intendedUse",
    "notes",
  ].entries()) {
    const b = find(key);
    b.position = position * 10;
    b.entitySurfaceSectionId = accountSection.id;
  }
  root.layoutConfig = { ...root.layoutConfig, bankEditorVersion: 2 };
  compileEntityIntakeSurfaces(graph);
  return applyCompactBankCopy(graph);
}

/** Keep account capture compact; validation and directory provenance remain unchanged. */
export function withCompactBankCopy(source: MetaEntityGraph): MetaEntityGraph {
  return applyCompactBankCopy(structuredClone(source));
}

/** Internal pipeline step: mutates the caller-owned working graph. */
export function applyCompactBankCopy(source: MetaEntityGraph): MetaEntityGraph {
  if (source.entity.entityCode !== "business_partner") throw Error("Business Partner graph required");
  const graph = source as any;
  const surface = graph.surfaces.find(
    (s: any) => s.surfaceKey === "profile_bank",
  );
  if (!surface) return graph;
  const keys = new Set([
    "bankName",
    "bic",
    "accountHolderName",
    "accountIdType",
    "accountIdentifier",
  ]);
  for (const binding of graph.surfaceFieldBindings) {
    const config = binding.displayConfig as Record<string, any> | undefined;
    if (
      binding.entitySurfaceId !== surface.id ||
      !config ||
      !keys.has(config.valueKey)
    )
      continue;
    delete binding.helpText;
    delete config.helpText;
    if (Array.isArray(config.variants))
      config.variants = config.variants.map(
        ({ helpText, ...variant }: Record<string, unknown>) => variant,
      );
  }
  const find = surfaceBindingLookup<any>(graph.surfaceFieldBindings, surface.id);
  const country = find("bankCountryCode"),
    type = find("accountIdType"),
    identifier = find("accountIdentifier"),
    routing = find("clearingCode");
  if (country?.displayConfig.clearOnChange && type && identifier && routing) {
    country.displayConfig.lookup = {
      ...country.displayConfig.lookup,
      sourceKey: "control.bank_country",
    };
    country.displayConfig.clearOnChange = {
      ...country.displayConfig.clearOnChange,
      mode: "dialog",
      title: "Change bank country to {next}?",
      message:
        "Bank, branch, SWIFT/BIC, and routing details will be cleared. Account holder and account number will remain. The account format follows the new country; review the retained number.",
      confirmLabel: "Change country",
      cancelLabel: "Keep {previous}",
      fields: [
        ...new Set([
          ...(country.displayConfig.clearOnChange?.fields ?? []),
          "clearingCode",
        ]),
      ],
    };
    type.labelOverride = "Account number format";
    type.displayConfig.referenceRules = {
      field: "bankCountryCode",
      value: "accountType",
      widget: "typeWidget",
    };
    identifier.displayConfig.referenceRules = {
      field: "bankCountryCode",
      pattern: "accountPattern",
    };
    routing.displayConfig.referenceRules = {
      field: "bankCountryCode",
      label: "routingLabel",
      widget: "routingWidget",
      pattern: "routingPattern",
      required: "routingRequired",
    };
    routing.displayConfig.normalize = "uppercase";
    for (const [key, title, message, confirmLabel] of [
      [
        "bankSource",
        "Change bank selection?",
        "The selected bank, branch, routing code, and copied directory details will be cleared. Account holder and account number will remain.",
        "Change bank selection",
      ],
      [
        "bankInstitutionId",
        "Change bank to {next}?",
        "The branch and routing code will be cleared. SWIFT/BIC will be refreshed for the selected bank. Account holder and account number will remain.",
        "Change bank",
      ],
    ]) {
      const field = find(key);
      if (field?.displayConfig.clearOnChange)
        field.displayConfig.clearOnChange = {
          ...field.displayConfig.clearOnChange,
          fields: [...new Set([...field.displayConfig.clearOnChange.fields, "clearingCode"])],
          mode: "dialog",
          title,
          message,
          confirmLabel,
          cancelLabel: "Keep current",
        };
    }
  }
  return graph;
}
