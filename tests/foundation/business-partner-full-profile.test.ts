import { test } from "node:test";
import assert from "node:assert/strict";
import { withBusinessPartnerFullProfile } from "../../server/db/scripts/provisioning/business-partner-full-profile.js";
import { compileEntityIntakeSurfaces } from "../../packages/contracts/platform/entity-runtime/src/intake-surface-authoring";
import {
  dataSurfaceDefaults,
  dataSurfaceValues,
} from "../../packages/contracts/platform/entity-runtime/src/intake-data-values";
const fixture = () =>
  ({
    entity: { entityCode: "business_partner" },
    fields: [],
    surfaces: [
      {
        id: "details",
        surfaceKey: "intake_details",
        surfaceKind: "form",
        title: "Request",
        layoutKind: "flow",
        layoutConfig: {
          renderer: "intake",
          columns: 1,
          formLabels: { continue: "Continue", submit: "Submit" },
        },
        status: "active",
      },
    ],
    surfaceSections: [
      {
        id: "scope",
        entitySurfaceId: "details",
        sectionKey: "scope",
        position: 0,
        columnCount: 12,
      },
    ],
    surfaceFieldBindings: [],
  }) as any;
test("full profile authoring is additive, idempotent and standard by default", () => {
  const source = fixture(),
    graph = withBusinessPartnerFullProfile(source);
  assert.equal(source.fields.length, 0);
  assert.deepEqual(withBusinessPartnerFullProfile(graph), graph);
  const surfaces = compileEntityIntakeSurfaces(graph),
    details = surfaces.find((s) => s.key === "intake_details")!,
    defaults = dataSurfaceDefaults(details, surfaces);
  assert.equal(defaults.profileMode, "standard");
  assert.equal(details.formLabels?.saveDraft, "Save draft");
  assert.equal(details.sections.filter((s) => s.collapsible).length, 1);
  assert.deepEqual(dataSurfaceValues(details, surfaces, defaults), {
    profileMode: "standard",
    bankAccounts: [],
  });
  assert.equal(
    graph.fields.some((f: any) => f.storagePath),
    false,
  );
});
test("optional collections validate added records, dates and allowed alias kinds", () => {
  const surfaces = compileEntityIntakeSurfaces(
      withBusinessPartnerFullProfile(fixture()),
    ),
    details = surfaces.find((s) => s.key === "intake_details")!,
    defaults = {
      ...dataSurfaceDefaults(details, surfaces),
      profileMode: "full",
    };
  assert.doesNotThrow(() => dataSurfaceValues(details, surfaces, defaults));
  assert.throws(
    () =>
      dataSurfaceValues(details, surfaces, {
        ...defaults,
        aliases: [{ key: "a", aliasKind: "trading", isPrimary: true }],
      }),
    /Alias name/,
  );
  assert.throws(
    () =>
      dataSurfaceValues(details, surfaces, {
        ...defaults,
        incorporationDate: "2026-02-30",
      }),
    /Incorporation date/,
  );
  assert.throws(
    () =>
      dataSurfaceValues(details, surfaces, {
        ...defaults,
        aliases: [
          {
            key: "a",
            aliasName: "Example",
            aliasKind: "unregistered",
            isPrimary: true,
          },
        ],
      }),
    /Name type/,
  );
});

test("request capture adds documents to six entries and keeps bank data request-only", () => {
  const graph = withBusinessPartnerFullProfile(fixture());
  assert.ok(
    !graph.fields.some(
      (field) => field.fieldKey === "certification_attachment_id",
    ),
    "obsolete attachment field must not remain outside authorization coverage",
  );
  const surfaces = compileEntityIntakeSurfaces(graph);
  for (const key of [
    "identifier",
    "tax",
    "classification",
    "governance",
    "certification",
    "bank",
  ]) {
    const entry = surfaces.find((s) => s.key === `profile_${key}`)!;
    assert.ok(
      entry.sections
        .flatMap((s) => s.fields)
        .some(
          (f) =>
            f.control === "repeatableGroup" &&
            f.valueKey === "supportingDocuments",
        ),
    );
  }
  const bank = surfaces.find((s) => s.key === "profile_bank")!;
  assert.ok(
    bank.sections
      .flatMap((s) => s.fields)
      .some(
        (f) =>
          f.control === "input" &&
          f.valueKey === "accountIdentifier" &&
          f.widget === "password",
      ),
  );
  assert.ok(
    bank.sections
      .flatMap((s) => s.fields)
      .every((f) => f.control !== "input" || !f.payload),
  );
  const root = surfaces.find((s) => s.key === "intake_details")!;
  const defaults = dataSurfaceDefaults(root, surfaces);
  assert.deepEqual(
    dataSurfaceValues(root, surfaces, defaults).bankAccounts,
    [],
  );
});

test("metadata requires a specified document type independently from entry count", () => {
  const surfaces = compileEntityIntakeSurfaces(
    withBusinessPartnerFullProfile(fixture()),
  );
  const bank = structuredClone(surfaces.find((s) => s.key === "profile_bank")!);
  for (const field of bank.sections.flatMap((s) => s.fields))
    if (field.control === "input" && field.valueKey === "bankCountryCode")
      (field as any).lookup.options = [{ value: "MY", label: "Malaysia" }];
  for (const field of bank.sections.flatMap((s) => s.fields))
    if (field.control === "input" && field.valueKey === "accountIdType")
      (field as any).lookup.options = [
        {
          value: "local_account",
          label: "Local account",
          data: { countries: ["MY"] },
        },
      ];
  const docs = bank.sections
    .flatMap((s) => s.fields)
    .find((f) => f.control === "repeatableGroup")!;
  if (docs.control !== "repeatableGroup") throw Error("documents required");
  (docs as any).requiredItemValues = [
    {
      field: "documentType",
      value: "bank_confirmation",
      minItems: 1,
      message: "Add a bank confirmation.",
    },
  ];
  const answers = {
    ...dataSurfaceDefaults(bank, surfaces),
    accountHolderName: "Example",
    bankName: "Example bank",
    bankSource: "unlisted",
    bankCountryCode: "MY",
    accountIdType: "local_account",
    accountIdentifier: "0012345",
    supportingDocuments: [],
  };
  assert.throws(
    () => dataSurfaceValues(bank, surfaces, answers),
    /Add a bank confirmation/,
  );
  assert.doesNotThrow(() =>
    dataSurfaceValues(bank, surfaces, {
      ...answers,
      supportingDocuments: [
        {
          key: "doc-1",
          documentType: "bank_confirmation",
          attachmentId: "11111111-1111-4111-8111-111111111111",
        },
      ],
    }),
  );
});

test("draft capture retains incomplete bank and document entries without relaxing submission", () => {
  const surfaces = compileEntityIntakeSurfaces(
    withBusinessPartnerFullProfile(fixture()),
  );
  const root = surfaces.find((s) => s.key === "intake_details")!,
    bank = surfaces.find((s) => s.key === "profile_bank")!;
  const answers = {
    ...dataSurfaceDefaults(root, surfaces),
    bankAccounts: [
      {
        ...dataSurfaceDefaults(bank, surfaces),
        key: "bank-1",
        accountHolderName: "Example",
        supportingDocuments: [
          { key: "doc-1", documentType: "bank_confirmation" },
        ],
      },
    ],
  };
  const draft = dataSurfaceValues(root, surfaces, answers, "draft");
  assert.equal((draft.bankAccounts as any[])[0].key, "bank-1");
  assert.equal(
    (draft.bankAccounts as any[])[0].supportingDocuments[0].key,
    "doc-1",
  );
  assert.throws(() => dataSurfaceValues(root, surfaces, answers));
});

test("collection authoring publishes reusable bank, certificate and document presentations", () => {
  const graph = withBusinessPartnerFullProfile(fixture());
  const surfaces = compileEntityIntakeSurfaces(graph);
  const fields = surfaces.flatMap((s) =>
    s.sections.flatMap((section) => section.fields),
  );
  const bank = fields.find(
    (f) => f.control === "repeatableGroup" && f.valueKey === "bankAccounts",
  );
  assert.equal(bank?.control, "repeatableGroup");
  if (bank?.control !== "repeatableGroup") return;
  assert.equal(bank.presentation?.renderer, "bank-accounts");
  assert.deepEqual(
    bank.presentation?.summary.find((f) => f.field === "accountIdentifier"),
    { field: "accountIdentifier", format: "masked" },
  );
  assert.equal(
    fields.filter(
      (f) =>
        f.control === "repeatableGroup" &&
        f.presentation?.renderer === "documents",
    ).length,
    6,
  );
  assert.equal(
    fields.filter(
      (f) =>
        f.control === "repeatableGroup" &&
        f.presentation?.renderer === "certifications",
    ).length,
    1,
  );
  const bankSurface = surfaces.find((s) => s.key === bank.itemSurfaceKey)!;
  assert.deepEqual(
    bankSurface.sections.map((s) => s.title),
    ["Bank details", "Account details", "Supporting documents"],
  );
  const validity = surfaces
    .find((s) => s.key === "profile_certification")!
    .sections.find((s) => s.title === "Validity and scope")!;
  assert.deepEqual(
    validity.fields.map(
      (f) => f.control === "input" && [f.valueKey, f.columnSpan],
    ),
    [
      ["effectiveFrom", 6],
      ["effectiveUntil", 6],
      ["certifiedLocation", 6],
    ],
  );
});
