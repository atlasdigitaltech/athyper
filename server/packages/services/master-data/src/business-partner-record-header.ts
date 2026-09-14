import {
  parseRecord360Panel,
  parseEntityRecordPresentation,
  resolveRecordHeader,
  type EntityRecordPresentationV1,
  type EntityRecordHeaderV1,
} from "@athyper/contract-platform-entity-runtime";
import type {
  BusinessPartner360Summary,
  BusinessPartner360GovernedAction,
} from "@athyper/server-contract-master-data";

/** Used by the BP adapter until an older presentation is republished. */
export const BUSINESS_PARTNER_360_PANEL = parseRecord360Panel({
  schemaVersion: 1,
  kind: "360",
  sections: [
    "overview",
    "identity",
    "contacts",
    "addresses",
    "identifiers-tax",
    "governance",
    "banking",
    "qualifications-certificates",
    "credit",
    "network",
  ],
  tabs: [
    { key: "360", label: "360 View", provider: "360" },
    { key: "roles", label: "Roles & scope", provider: "section", sectionKey: "roles-scope" },
    {
      key: "requests",
      label: "Requests",
      provider: "section",
      sectionKey: "requests",
    },
    {
      key: "transactions",
      label: "Business Transactions",
      provider: "section",
      sectionKey: "business-activity",
    },
    {
      key: "activity",
      label: "Activity",
      provider: "section",
      sectionKey: "activity",
    },
    {
      key: "comments",
      label: "Comments",
      provider: "section",
      sectionKey: "comments",
    },
    {
      key: "attachments",
      label: "Attachments",
      provider: "section",
      sectionKey: "attachments",
    },
  ],
  sidebar: [
    { key: "contact", label: "Primary Contact", provider: "primary-contact" },
    { key: "address", label: "Primary Address", provider: "primary-address" },
  ],
});

/** Compatibility presentation for releases predating recordPresentation. Published metadata takes precedence. */
export const businessPartnerRecordPresentation = parseEntityRecordPresentation({
  schemaVersion: 1,
  panel: BUSINESS_PARTNER_360_PANEL,
  iconKey: "contact",
  titleField: "name",
  codeField: "code",
  badges: [
    {
      field: "status",
      tones: { active: "success", blocked: "danger", inactive: "neutral" },
    },
  ],
  sections: [
    ["overview", "Overview"],
    ["identity", "Identity"],
    ["contacts", "Contacts"],
    ["addresses", "Addresses"],
    ["identifiers-tax", "Identifiers & tax"],
    ["governance", "Governance & ownership"],
    ["roles-scope", "Roles & scope"],
    ["supplier-company", "Buying & Payables"],
    ["customer-company", "Selling & Receivables"],
    ["banking", "Banking"],
    ["qualifications-certificates", "Qualifications & certificates"],
    ["credit", "Credit review"],
    ["requests", "Requests"],
    ["activity", "Activity"],
    ["business-activity", "Business activity"],
    ["network", "MESH Network"],
    ["comments", "Comments"],
    ["attachments", "Attachments"],
  ].map(([key, label], index) => ({
    key,
    label,
    fields: [],
    placement: index < 5 ? "direct" : "overflow",
  })),
  actions: [
    {
      key: "amend_partner",
      label: "Propose change",
      operationKey: "amend_partner",
      placement: "primary",
    },
    {
      key: "add_role",
      label: "Add supplier/customer role",
      operationKey: "add_role",
      placement: "overflow",
    },
    {
      key: "assign_organization",
      label: "Assign organization",
      operationKey: "assign_organization",
      placement: "overflow",
    },
    {
      key: "configure_company",
      label: "Configure company",
      operationKey: "configure_company",
      placement: "overflow",
    },
  ],
});
export function businessPartnerRecordHeader(
  summary: BusinessPartner360Summary,
  authorizedActions: Readonly<
    Record<string, BusinessPartner360GovernedAction | undefined>
  >,
  presentation: EntityRecordPresentationV1 = businessPartnerRecordPresentation,
  authorityRevision: string = "legacy:unversioned",
): EntityRecordHeaderV1 {
  // Only canonical, already authorized summary values can participate in header bindings.
  const values = {
    name: summary.identity.name,
    code: summary.identity.code,
    status: summary.identity.lifecycleStatus,
    lifecycleStatus: summary.identity.lifecycleStatus,
    category: summary.identity.category,
  };
  const bindings = new Map(Object.entries(authorizedActions).flatMap(([operationKey, action]) => action ? [[operationKey, {
    operationKey,
    href: scopedActionHref(action.href, summary),
    decision: {
      schemaVersion: 1 as const,
      state: "allowed" as const,
      reasonCode: "AUTHORIZED" as const,
      operationKey,
      authorityRevision,
      decisionRef: `bp:${summary.identity.id}:${operationKey}`,
    },
  }] as const] : []));
  const header = resolveRecordHeader(presentation, values, {
    entityLabel: "Business Partner",
    fallbackTitle: summary.identity.name,
    readOnly: summary.completeness.readOnly,
    actions: presentation.actions.flatMap((placement) => {
      const action = bindings.get(placement.operationKey);
      return action
        ? [
            {
              key: placement.key,
              label: placement.label,
              placement: placement.placement,
              ...action,
            },
          ]
        : [];
    }),
  });
  const order = new Map(
    presentation.sections.map((section, index) => [section.key, index]),
  );
  return {
    ...header,
    relatedActions: summary.completeness.readOnly ? [] : [...bindings.values()],
    related: presentation.related?.filter(profile => summary.sections.some(section => section.code === profile.sectionKey && section.authorization === "granted")).map(profile => ({
      ...profile,
      actions: summary.completeness.readOnly ? [] : profile.actions.filter(action => Boolean(authorizedActions[action.operationKey])),
    })),
    panel: presentation.panel ?? BUSINESS_PARTNER_360_PANEL,
    badges: [
      ...summary.roles.map((role) => ({
        label: role.code === "supplier" ? "Supplier" : "Customer",
        tone: "neutral" as const,
      })),
      ...header.badges,
    ],
    context: [
      ...header.context,
      { key: "as-of", label: "As of", value: summary.asOf },
    ],
    sections: [...summary.sections]
      .sort(
        (left, right) =>
          (order.get(left.code) ?? 999) - (order.get(right.code) ?? 999),
      )
      .map((section) => {
        const published = presentation.sections.find(
            (item) => item.key === section.code,
          ),
          fallback = businessPartnerRecordPresentation.sections.find(
            (item) => item.key === section.code,
          );
        return {
          key: section.code,
          label: published?.label ?? fallback?.label ?? section.code,
          placement: published?.placement ?? "overflow",
          ...(published?.scopePrompt ? { scopePrompt: published.scopePrompt } : {}),
          ...(section.authorization === "granted" && section.reasonCode !== "BP_360_SCOPE_REQUIRED" && section.count !== undefined
            ? { count: section.count }
            : {}),
        };
      }),
  };
}

/** Context is bound by the server; presentation components must not rewrite action targets. */
function scopedActionHref(href: string, summary: BusinessPartner360Summary): string {
  const url = new URL(href, "https://local.test");
  if (summary.scope.operatingOrganizationId) url.searchParams.set("operatingOrganizationId", summary.scope.operatingOrganizationId);
  if (summary.scope.companyCodeId) url.searchParams.set("companyCodeId", summary.scope.companyCodeId);
  return url.pathname + url.search + url.hash;
}
