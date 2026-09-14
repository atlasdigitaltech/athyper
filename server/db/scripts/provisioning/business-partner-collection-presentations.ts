import { withCompactBankCopy } from "./business-partner-bank-editor";
import { withBusinessPartnerAddressRegion } from "./business-partner-address-editor";
import { withBusinessPartnerAdvancedAddress } from "./business-partner-address-editor";
import { createHash } from "node:crypto";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import type { CollectionPresentation } from "../../../../packages/contracts/platform/entity-runtime/src/intake-data";
import { compileEntityIntakeSurfaces } from "../../../../packages/contracts/platform/entity-runtime/src/intake-surface-authoring";

/** Author presentation on Meta Entity bindings; the runtime contains no partner field mappings. */
export function withBusinessPartnerCollectionPresentations(
  source: MetaEntityGraph,
): MetaEntityGraph {
  if (source.entity.entityCode !== "business_partner") throw Error("Business Partner graph required");
  const graph = withCompactBankCopy(source) as any;
  const details = graph.surfaces.find(
    (s: any) => s.surfaceKey === "intake_details",
  );
  if (!details || details.layoutConfig?.collectionPresentationVersion === 6)
    return finishBusinessPartnerCollections(graph);
  const alignCollections = () => {
    const headers: Record<string, Record<string, [string, string]>> = {
      partner_address_intake: {
        "Purpose and country": ["Purpose and country", "map-pin"],
        Address: ["Address details", "building"],
      },
      partner_contact_intake: {
        "Contact details": ["Contact details", "contact"],
        "Communication channels": ["Communication channels", "message"],
      },
      profile_certification: {
        "Certificate details": ["Certificate details", "clipboard-check"],
        Validity: ["Validity and scope", "gantt"],
      },
    };
    for (const surface of graph.surfaces) {
      const ownSections = graph.surfaceSections.filter(
        (s: any) => s.entitySurfaceId === surface.id,
      );
      for (const section of ownSections) {
        const spec = headers[surface.surfaceKey]?.[section.title];
        if (spec) {
          section.title = spec[0];
          section.layoutConfig = {
            ...section.layoutConfig,
            header: { style: "accent", icon: spec[1] },
          };
        }
      }
      if (surface.surfaceKey === "profile_certification") {
        const scope = ownSections.find(
          (s: any) => s.title === "Validity and scope",
        );
        const location = graph.surfaceFieldBindings.find(
          (b: any) =>
            b.entitySurfaceId === surface.id &&
            b.displayConfig?.valueKey === "certifiedLocation",
        );
        if (scope && location) {
          location.entitySurfaceSectionId = scope.id;
          location.position = 20;
        }
      }
    }
    for (const b of graph.surfaceFieldBindings) {
      const p = b.displayConfig?.presentation;
      if (!p) continue;
      if (p.renderer === "addresses") {
        p.titleFields = ["line1"];
        p.summary = [
          { field: "line1" },
          { field: "city" },
          { field: "countryCode" },
          { field: "purpose" },
        ];
      }
      if (p.renderer === "contacts") {
        p.titleFields = ["contactName"];
        p.summary = [
          { field: "contactName" },
          { field: "businessTitle" },
          { field: "departmentName" },
          { field: "channels", format: "primary" },
        ];
        Object.assign(p.removalConfirmation, {
          message: "This contact will be removed from this request.",
          impactField: "channels",
          impactMessage:
            "This contact and its communication channels ({count}) will be removed from this request.",
        });
      }
      if (p.renderer === "certifications") p.titleFields = ["customName"];
      if (p.renderer === "channels")
        Object.assign(p, {
          titleFields: ["channelType", "value"],
          headingCount: true,
          validateOnDone: true,
          removalConfirmation: {
            mode: "dialog",
            title: "Remove {item}?",
            message:
              "This communication channel will be removed from this contact.",
            confirmLabel: b.displayConfig.removeLabel ?? "Remove channel",
            cancelLabel: "Cancel",
          },
        });
    }
    details.layoutConfig = {
      ...details.layoutConfig,
      collectionPresentationVersion: 6,
    };
  };
  if (details.layoutConfig?.collectionPresentationVersion === 5) {
    alignCollections();
    compileEntityIntakeSurfaces(graph);
    return finishBusinessPartnerCollections(graph);
  }
  const dialogActions = () => {
    for (const binding of graph.surfaceFieldBindings) {
      const p = binding.displayConfig?.presentation;
      if (!p?.removalConfirmation) continue;
      p.removalConfirmation = {
        ...p.removalConfirmation,
        mode: "dialog",
        title: "Remove {item}?",
        cancelLabel: "Cancel",
        message: "This entry will be removed from this request.",
      };
      if (p.renderer === "documents")
        p.removalConfirmation.message =
          "This document will be removed from this request.";
      if (p.renderer === "bank-accounts")
        Object.assign(p.removalConfirmation, {
          titleFields: ["bankName", "accountIdentifier"],
          message: "This bank account will be removed from this request.",
          impactField: "supportingDocuments",
          impactMessage:
            "This bank account and its supporting document entries ({count}) will be removed from this request.",
        });
      if (p.renderer === "certifications")
        Object.assign(p.removalConfirmation, {
          impactField: "supportingDocuments",
          impactMessage:
            "This certificate and its supporting document entries ({count}) will be removed from this request.",
        });
    }
    details.layoutConfig = {
      ...details.layoutConfig,
      collectionPresentationVersion: 5,
    };
    alignCollections();
  };
  if (details.layoutConfig?.collectionPresentationVersion === 4) {
    dialogActions();
    compileEntityIntakeSurfaces(graph);
    return finishBusinessPartnerCollections(graph);
  }
  const compactCopy = () => {
    const binding = graph.surfaceFieldBindings.find(
      (b: any) =>
        b.entitySurfaceId === details.id &&
        b.displayConfig?.presentation?.renderer === "bank-accounts",
    );
    const section = graph.surfaceSections.find(
      (s: any) => s.id === binding?.entitySurfaceSectionId,
    );
    if (section)
      section.description = "Add bank accounts and supporting documents.";
    details.layoutConfig = {
      ...details.layoutConfig,
      collectionPresentationVersion: 4,
    };
    dialogActions();
  };
  if (details.layoutConfig?.collectionPresentationVersion === 3) {
    compactCopy();
    compileEntityIntakeSurfaces(graph);
    return finishBusinessPartnerCollections(graph);
  }
  const applyActions = () => {
    for (const binding of graph.surfaceFieldBindings) {
      const p = binding.displayConfig?.presentation;
      if (
        !p ||
        ![
          "addresses",
          "contacts",
          "bank-accounts",
          "certifications",
          "documents",
        ].includes(p.renderer)
      )
        continue;
      Object.assign(p, {
        headingCount: true,
        validateOnDone: true,
        removalConfirmation: {
          message: "Remove this entry and its details from this request?",
          confirmLabel: binding.displayConfig.removeLabel ?? "Remove entry",
          cancelLabel: "Keep entry",
        },
      });
    }
    const bank = graph.surfaces.find(
      (s: any) => s.surfaceKey === "profile_bank",
    );
    for (const section of graph.surfaceSections) {
      const documentBinding = graph.surfaceFieldBindings.find(
        (b: any) =>
          b.entitySurfaceSectionId === section.id &&
          b.displayConfig?.presentation?.renderer === "documents",
      );
      const icon = documentBinding
        ? "file-signature"
        : section.entitySurfaceId === bank?.id
          ? (
              {
                "Bank details": "landmark",
                "Account details": "banknote",
              } as Record<string, string>
            )[section.title]
          : undefined;
      if (icon)
        section.layoutConfig = {
          ...section.layoutConfig,
          header: { style: "accent", icon },
        };
    }
    details.layoutConfig = {
      ...details.layoutConfig,
      collectionPresentationVersion: 3,
    };
    compactCopy();
  };
  if ([1, 2].includes(details.layoutConfig?.collectionPresentationVersion)) {
    applyActions();
    compileEntityIntakeSurfaces(graph);
    return finishBusinessPartnerCollections(graph);
  }
  const specs: Record<
    string,
    {
      renderer: CollectionPresentation["renderer"];
      summary: CollectionPresentation["summary"];
      emptyText: string;
    }
  > = {
    partner_address_intake: {
      renderer: "addresses",
      summary: [
        { field: "purpose" },
        { field: "line1" },
        { field: "city" },
        { field: "postalCode" },
        { field: "countryCode" },
      ],
      emptyText: "Add an address and select its purpose.",
    },
    partner_contact_intake: {
      renderer: "contacts",
      summary: [
        { field: "contactName" },
        { field: "businessTitle" },
        { field: "departmentName" },
        { field: "channels", format: "count" },
      ],
      emptyText: "Add a contact and their communication channels.",
    },
    partner_channel_intake: {
      renderer: "channels",
      summary: [
        { field: "channelType" },
        { field: "value" },
        { field: "purpose" },
      ],
      emptyText: "Add a way to reach this contact.",
    },
    profile_bank: {
      renderer: "bank-accounts",
      summary: [
        { field: "bankName" },
        { field: "currencyCode" },
        { field: "accountIdentifier", format: "masked" },
        { field: "intendedUse" },
        { field: "supportingDocuments", format: "count" },
      ],
      emptyText: "Add an account and supporting documents when available.",
    },
    profile_certification: {
      renderer: "certifications",
      summary: [
        { field: "customName" },
        { field: "certifiedBy" },
        { field: "effectiveFrom" },
        { field: "effectiveUntil" },
        { field: "supportingDocuments", format: "count" },
      ],
      emptyText: "Add a certificate and its supporting documents.",
    },
  };
  for (const binding of graph.surfaceFieldBindings) {
    if (binding.displayConfig?.attachmentLabels)
      binding.displayConfig.attachmentLabels = {
        ...binding.displayConfig.attachmentLabels,
        uploadNotAllowed:
          "You do not have permission to upload documents. Select an available document already added to this request, or ask your administrator for upload access.",
      };
    if (binding.widgetKey !== "repeatable_group") continue;
    const key = binding.displayConfig?.itemSurfaceKey;
    const spec =
      specs[key] ??
      (key?.startsWith("capture_document_")
        ? {
            renderer: "documents",
            summary: [
              { field: "documentType" },
              { field: "issuedOn" },
              { field: "expiresOn" },
            ],
            emptyText: "Add a supporting document.",
          }
        : undefined);
    if (!spec) continue;
    binding.displayConfig = {
      ...binding.displayConfig,
      presentation: {
        ...spec,
        editLabel: "Edit",
        doneLabel: "Done",
        issuesLabel: "Issues: {count}",
      },
    };
    const section = graph.surfaceSections.find(
      (s: any) => s.id === binding.entitySurfaceSectionId,
    );
    if (section) section.collapsible = false;
  }
  // Metadata owns editor groups and field order. Existing item surface identities stay stable.
  const groups: Record<string, [string, string[]][]> = {
    partner_address_intake: [
      ["Purpose and country", ["purpose", "countryCode", "isPrimary"]],
      ["Address", ["line1", "line2", "city", "region", "postalCode"]],
    ],
    partner_contact_intake: [
      [
        "Contact details",
        ["contactName", "businessTitle", "departmentName", "isPrimary"],
      ],
      ["Communication channels", ["channels"]],
    ],
    profile_bank: [
      ["Bank details", ["bankCountryCode", "bankName", "bic", "branch"]],
      [
        "Account details",
        [
          "accountHolderName",
          "accountIdType",
          "accountIdentifier",
          "clearingCode",
          "currencyCode",
          "intendedUse",
          "notes",
        ],
      ],
    ],
    profile_certification: [
      [
        "Certificate details",
        ["customName", "certificateNumber", "certifiedBy", "certifiedLocation"],
      ],
      ["Validity", ["effectiveFrom", "effectiveUntil"]],
    ],
  };
  for (const [key, sections] of Object.entries(groups)) {
    const surface = graph.surfaces.find((s: any) => s.surfaceKey === key);
    if (!surface) continue;
    sections.forEach(([title, fields], index) => {
      const hash = createHash("sha256")
        .update(`collection-presentation.v1.${key}.${index}`)
        .digest("hex");
      const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      graph.surfaceSections.push({
        id,
        entitySurfaceId: surface.id,
        sectionKey: `editor_${index}`,
        sectionKind: "section",
        collapsible: false,
        collapsedByDefault: false,
        layoutConfig: {},
        title,
        position: index * 10,
        columnCount: 12,
      });
      for (const binding of graph.surfaceFieldBindings.filter(
        (b: any) => b.entitySurfaceId === surface.id,
      )) {
        const position = fields.indexOf(binding.displayConfig?.valueKey);
        if (position < 0) continue;
        binding.entitySurfaceSectionId = id;
        binding.position = position * 10;
        binding.columnSpan =
          binding.widgetKey === "repeatable_group" ||
          binding.displayConfig.valueKey === "notes"
            ? 12
            : 6;
      }
    });
    graph.surfaceSections = graph.surfaceSections.filter(
      (s: any) =>
        s.entitySurfaceId !== surface.id ||
        graph.surfaceFieldBindings.some(
          (b: any) => b.entitySurfaceSectionId === s.id,
        ),
    );
  }
  details.layoutConfig = {
    ...details.layoutConfig,
    collectionPresentationVersion: 1,
  };
  compileEntityIntakeSurfaces(graph);
  applyActions();
  compileEntityIntakeSurfaces(graph);
  return finishBusinessPartnerCollections(graph);
}


/** Presentation-only enhancement: preserve capture fields, rules and persistence bindings. */
export function withBusinessPartnerProfilePresentations(
  source: MetaEntityGraph,
): MetaEntityGraph {
  if (source.entity.entityCode !== "business_partner") throw Error("Business Partner graph required");
  const graph = structuredClone(source) as any;
  const specs: Record<
    string,
    {
      titleFields: string[];
      summary: CollectionPresentation["summary"];
      emptyText: string;
    }
  > = {
    profile_alias: {
      titleFields: ["aliasName"],
      summary: [
        { field: "aliasName" },
        { field: "aliasKind" },
        { field: "languageCode" },
        { field: "countryCode" },
      ],
      emptyText: "Add a trading, former or alternate name.",
    },
    profile_identifier: {
      titleFields: ["schemeCode"],
      summary: [
        { field: "schemeCode" },
        { field: "issuingCountryCode" },
        { field: "value", format: "masked" },
      ],
      emptyText: "Add a business registration identifier.",
    },
    profile_tax: {
      titleFields: ["registrationTypeCode"],
      summary: [
        { field: "registrationTypeCode" },
        { field: "jurisdictionId" },
        { field: "value", format: "masked" },
      ],
      emptyText: "Add a tax registration.",
    },
    profile_classification: {
      titleFields: ["commodityReferenceId", "industryReferenceId"],
      summary: [
        { field: "commodityReferenceId" },
        { field: "industryReferenceId" },
        { field: "classificationKind" },
        { field: "domainCode" },
        { field: "partnerRole" },
      ],
      emptyText: "Add a commodity or industry classification.",
    },
    profile_governance: {
      titleFields: ["memberName"],
      summary: [
        { field: "memberName" },
        { field: "relationTypeCode" },
        { field: "memberType" },
        { field: "businessTitle" },
      ],
      emptyText: "Add a governance or ownership member.",
    },
    profile_relationship: {
      titleFields: ["relationshipTypeCode"],
      summary: [{ field: "relationshipTypeCode" }, { field: "countryCode" }],
      emptyText: "Add a relationship with another partner.",
    },
  };
  for (const binding of graph.surfaceFieldBindings) {
    if (binding.widgetKey !== "repeatable_group") continue;
    const spec = specs[binding.displayConfig?.itemSurfaceKey];
    if (spec) {
      binding.displayConfig.presentation = {
        renderer: "generic",
        ...spec,
        headingCount: true,
        validateOnDone: true,
        editLabel: "Edit",
        doneLabel: "Done",
        issuesLabel: "Issues: {count}",
        removalConfirmation: {
          mode: "dialog",
          title: "Remove {item}?",
          message: "This entry will be removed from this request.",
          confirmLabel: binding.displayConfig.removeLabel ?? "Remove entry",
          cancelLabel: "Cancel",
        },
      } satisfies CollectionPresentation;
      const section = graph.surfaceSections.find(
        (s: any) => s.id === binding.entitySurfaceSectionId,
      );
      if (section) {
        section.collapsible = false;
        section.collapsedByDefault = false;
        delete section.description;
      }
    }
    if (
      ["bank-accounts", "certifications"].includes(
        binding.displayConfig?.presentation?.renderer,
      )
    ) {
      const section = graph.surfaceSections.find(
        (s: any) => s.id === binding.entitySurfaceSectionId,
      );
      if (section) delete section.description;
    }
  }
  return graph;
}

function finishBusinessPartnerCollections(source: MetaEntityGraph): MetaEntityGraph {
  return [
    withBusinessPartnerProfilePresentations,
    withBusinessPartnerAdvancedAddress,
    withBusinessPartnerAddressRegion,
  ].reduce((graph, transform) => transform(graph), source);
}
