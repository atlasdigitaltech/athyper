"use client";
import type { EntityRuntimeSectionResource } from "@athyper/platform-entity-descriptor-client";
import { FileTextIcon } from "@athyper/platform-icons";
import { PanelEmptyState, Card } from "@athyper/platform-ui";
import { humanizeIdentifier } from "@athyper/contract-platform-entity-runtime";
import { type ReactNode } from "react";
import { ProtectedValue } from "./protected-value";
import { AttachmentReference } from "./attachment-reference";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";

export const commentFields = Object.freeze([
  {
    key: "text",
    label: {
      labelKey: "platform.comments.fields.text.label",
      defaultText: "Comment",
    },
  },
  {
    key: "authorDisplayName",
    label: {
      labelKey: "platform.comments.fields.author.label",
      defaultText: "Author",
    },
  },
  {
    key: "createdAt",
    label: {
      labelKey: "platform.comments.fields.created_at.label",
      defaultText: "Created",
    },
  },
  {
    key: "visibility",
    label: {
      labelKey: "platform.comments.fields.visibility.label",
      defaultText: "Visibility",
    },
  },
]);
export const attachmentFields = Object.freeze([
  {
    key: "fileName",
    label: {
      labelKey: "platform.attachments.fields.file_name.label",
      defaultText: "File",
    },
  },
  {
    key: "contentType",
    label: {
      labelKey: "platform.attachments.fields.content_type.label",
      defaultText: "Type",
    },
  },
  {
    key: "sizeBytes",
    label: {
      labelKey: "platform.attachments.fields.size_bytes.label",
      defaultText: "Size",
    },
  },
  {
    key: "createdAt",
    label: {
      labelKey: "platform.attachments.fields.created_at.label",
      defaultText: "Created",
    },
  },
]);
export function Fields({
  fields,
  values,
}: {
  readonly fields: EntityRuntimeSectionResource["presentation"]["fields"];
  readonly values?: Readonly<Record<string, unknown>>;
}) {
  const intl = useEntityI18n();
  if (!values)
    return (
      <EmptySectionState
        title="No details to display"
        detail="There are no values available for this section."
      />
    );
  const visible: EntityRuntimeSectionResource["presentation"]["fields"] = fields.length ? fields : Object.keys(values).map((key) => ({ key }));
  return (
    <Card className="a-record-detail-content">
      <dl className="a-record-detail-fields">
      {visible.map((field) => (
          <div key={field.key}>
            <dt>{intl.text(field.label ?? humanizeIdentifier(field.key))}</dt>
            <dd><MetadataValue field={field} value={values[field.key]} /></dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
export function Collection({
  fields,
  rowFields,
  items,
  sectionLabel,
  emptyState,
}: {
  readonly fields: EntityRuntimeSectionResource["presentation"]["fields"];
  readonly rowFields?: readonly EntityRuntimeSectionResource["presentation"]["fields"][];
  readonly items: readonly Readonly<Record<string, unknown>>[];
  readonly sectionLabel?: string;
  readonly emptyState?: Readonly<{
    readonly title: string;
    readonly detail: string;
  }>;
}) {
  const intl = useEntityI18n();
  if (!items.length) {
    return (
      <EmptySectionState
        title={emptyState?.title ?? "No entries yet"}
        detail={
          emptyState?.detail ?? "When entries are added, they’ll appear here."
        }
      />
    );
  }
  const visible: EntityRuntimeSectionResource["presentation"]["fields"] = fields.length
    ? fields
    : Object.keys(items[0] ?? {}).map((key) => ({ key }));
  return (
    <div className="a-record-detail-collection">
      {items.map((item, index) => (
        <Card key={String(item.id ?? index)}>
          <dl className="a-record-detail-fields">
            {(rowFields ? rowFields[index] ?? [] : visible).map((field) => (
              <div key={field.key}>
                <dt>{intl.text(field.label ?? humanizeIdentifier(field.key))}</dt>
                <dd>{field.revealOperation && typeof item[field.revealTargetField ?? "id"] === "string" ? <ProtectedValue operation={field.revealOperation} id={item[field.revealTargetField ?? "id"] as string} label={field.label ? intl.text(field.label) : undefined} purposes={field.revealPurposes} allowed={item.revealable === true} verificationRequired={item.revealVerificationRequired === true} masked={<>{item[field.key] != null && field.maskedPrefix}<MetadataValue field={field} value={item[field.key]} /></>} /> : <>{item[field.key] != null && field.maskedPrefix}<MetadataValue field={field} value={item[field.key]} /></>}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ))}
    </div>
  );
}

export function EmptySectionState({
  title,
  detail,
  centered = false,
  icon,
}: {
  readonly title: string;
  readonly detail: string;
  readonly centered?: boolean;
  readonly icon?: ReactNode;
}) {
  if (centered)
    return (
      <PanelEmptyState
        className="a-files-empty-state"
        role="status"
        icon={icon ?? <FileTextIcon size={22} />}
        title={title}
        description={detail}
      />
    );
  return (
    <Card
      className={`a-runtime-section-empty${centered ? " a-files-empty-state" : ""}`}
      role="status"
    >
      <span className="a-runtime-section-empty__icon" aria-hidden="true">
        {icon ?? <FileTextIcon size={22} />}
      </span>
      <div>
        <h3>{title}</h3>
        <p>{detail}</p>
      </div>
    </Card>
  );
}

export function collectionItems(
  value: unknown,
): readonly Readonly<Record<string, unknown>>[] {
  const root = valueRecord(value),
    data = valueRecord(root?.data) ?? root;
  const items = data?.items;
  return Array.isArray(items) ? items.filter(valueRecord) : [];
}
export function valueRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}
export function hasMore(value: unknown): boolean {
  return typeof valueRecord(value)?.nextCursor === "string";
}
export function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(display).join(", ");
  if (typeof value === "object") return "Available";
  return String(value);
}
function MetadataValue({field,value}:{field:EntityRuntimeSectionResource["presentation"]["fields"][number];value:unknown}):ReactNode {
  const intl = useEntityI18n();
  if(value==null) return "—";
  if(field.unavailableReference) return intl.text(field.unavailableReference);
  if(typeof value === "boolean") return intl.message(value ? "entity.value.yes" : "entity.value.no");
  if(field.attachmentDownload) return <AttachmentReference key={String(value)} value={value} />;
  if(field.temporalType && typeof value === "string") {
    const dateOnly = field.temporalType === "date";
    const instant = dateOnly ? `${value}T00:00:00Z` : value;
    if (!Number.isFinite(Date.parse(instant))) return <span role="alert">Date unavailable</span>;
    // Calendar dates must never shift when a user's time zone changes.
    return <time dateTime={value}>{intl ? intl.date(instant, dateOnly
      ? {dateStyle:"medium",timeZone:"UTC"}
      : {dateStyle:"medium",timeStyle:"short"}) : value}</time>;
  }
  if(field.options && Array.isArray(value)) return value.length ? value.map((entry,index)=><span key={index}>{index>0?', ':''}<MetadataValue field={field} value={entry}/></span>) : "—";
  if(field.options) { const label=field.options.find(option=>option.value===value)?.label; return label ? intl.text(label) : <span role="alert">Enumeration label unavailable</span>; }
  if(field.itemFields && Array.isArray(value)) return value.length ? <ul>{value.filter(valueRecord).map((row,index)=><li key={index}>{field.itemFields!.filter(child=>row[child.key]!=null).map(child=><span key={child.key}>{child.label ? intl.text(child.label) : humanizeIdentifier(child.key)}: <MetadataValue field={child} value={row[child.key]} />; </span>)}</li>)}</ul> : "—";
  return typeof value === "number" && Number.isFinite(value) ? intl.number(value, {maximumFractionDigits:20}) : display(value);
}
export function message(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : "This action could not be completed.";
}
