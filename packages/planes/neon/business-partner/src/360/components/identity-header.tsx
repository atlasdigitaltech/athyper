import type { EntityRecordHeaderV1 } from "@athyper/contract-platform-entity-runtime";
import { EntityRecordHeader } from "@athyper/platform-entity-form-detail";
import { useBusinessPartner360 } from "../business-partner-360-context";
import { sectionLabel } from "../section-registry";

export function IdentityHeader() {
  const { summary, section, selectSection } =
    useBusinessPartner360();
  // Older summary versions remain readable; actions require the new server-resolved header.
  const base: EntityRecordHeaderV1 = summary.recordHeader ?? {
    title: summary.identity.displayName,
    code: summary.identity.code,
    entityLabel: "Business Partner",
    iconKey: "contact",
    badges: [{ label: summary.identity.lifecycleStatus, tone: "neutral" }],
    context: [],
    actions: [],
    readOnly: summary.completeness.readOnly,
    sections: summary.sections.map((item, index) => ({
      key: item.code,
      label: sectionLabel(item.code),
      placement: index < 5 ? "direct" : "overflow",
      ...(item.authorization === "granted" && item.count !== undefined
        ? { count: item.count }
        : {}),
    })),
  };
  const header = {
    ...base,
    context: [],
    sections: [],
  };
  return (
    <EntityRecordHeader
      header={header}
      breadcrumbLabel={header.code && header.code !== header.title
        ? `${header.title} (${header.code})`
        : header.title}
      activeSection={section}
      onSelectSection={selectSection}

    />
  );
}
