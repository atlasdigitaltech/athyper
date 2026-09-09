"use client";
import { useOptionalI18n } from "@athyper/platform-i18n/react";
import { Badge, Button, Tooltip } from "@athyper/platform-ui";
import { CopyIcon } from "@athyper/platform-icons";
import React, { useState, type ReactNode } from "react";
import type {
  DetailFieldV1,
  RelatedPresentationV1,
} from "@athyper/contract-platform-entity-runtime";

type Values = Readonly<Record<string, unknown>>;
const present = (v: unknown) =>
  v !== null &&
  v !== undefined &&
  v !== "" &&
  (!Array.isArray(v) || v.length > 0);
const valueAt = (v: Values, key: string) =>
  Object.hasOwn(v, key) ? v[key] : undefined;
const scalar = (v: unknown): string =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean"
    ? String(v)
    : "";
export function detailValue(
  value: unknown,
  field: DetailFieldV1,
  locale = "en",
  timeZone?: string,
  recordValues: Values = {},
): string {
  if (!present(value)) return "Not provided";
  const raw = scalar(value);
  if (field.lookup) {
    const scope = scalar(valueAt(recordValues, field.lookup.scopeField));
    const entries = Object.hasOwn(field.lookup.values, scope)
      ? field.lookup.values[scope]
      : undefined;
    if (entries && Object.hasOwn(entries, raw)) return entries[raw]!;
  }
  const mapped =
    field.values && Object.hasOwn(field.values, raw)
      ? field.values[raw]
      : undefined;
  if (mapped) return mapped.label;
  if (field.renderer === "boolean")
    return value === true ? "Yes" : value === false ? "No" : "Not provided";
  if (field.renderer === "country" && /^[a-z]{2}$/i.test(raw))
    return (
      new Intl.DisplayNames([locale], { type: "region" }).of(
        raw.toUpperCase(),
      ) ?? raw
    );
  if (field.renderer === "date" || field.renderer === "datetime") {
    const d = new Date(
      field.renderer === "date" ? `${raw.slice(0, 10)}T00:00:00Z` : raw,
    );
    if (!Number.isNaN(d.valueOf()))
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        ...(field.renderer === "date"
          ? { timeZone: "UTC" }
          : { timeStyle: "short", ...(timeZone ? { timeZone } : {}) }),
      }).format(d);
    return "Invalid date";
  }
  return raw;
}
function FieldValue({
  field,
  value,
  locale,
  timeZone,
  recordValues,
}: {
  recordValues?: Values;
  field: DetailFieldV1;
  value: unknown;
  locale: string;
  timeZone?: string;
}) {
  const state = scalar(value),
    mapping =
      field.values && Object.hasOwn(field.values, state)
        ? field.values[state]
        : undefined;
  return field.renderer === "badge" && present(value) ? (
    <Badge tone={mapping?.tone ?? "neutral"}>
      {detailValue(value, field, locale, timeZone, recordValues)}
    </Badge>
  ) : (
    <>{detailValue(value, field, locale, timeZone, recordValues)}</>
  );
}
export function safeChannelHref(
  type: unknown,
  value: unknown,
): string | undefined {
  if (typeof value !== "string" || /[\r\n\x00-\x1f]/.test(value)) return;
  if (type === "email" && /^[^\s@?&#]+@[^\s@?&#]+$/.test(value))
    return `mailto:${value}`;
  if (
    ["phone", "fax", "sms", "whatsapp"].includes(String(type)) &&
    /^\+?[\d ()-]+$/.test(value)
  )
    return `${type === "sms" ? "sms" : "tel"}:${value.replace(/[ ()-]/g, "")}`;
  if (type === "website") {
    try {
      const url = new URL(value);
      if (["https:", "http:"].includes(url.protocol)) return url.href;
    } catch {
      /* Plain text remains available. */
    }
  }
}
function CopyValue({
  value,
  label,
  iconOnly = false,
  text,
}: {
  value: string;
  label: string;
  iconOnly?: boolean;
  text?: string;
}) {
  const [status, setStatus] = useState("");
  const button = (
    <Button
      className="a-related-copy"
      variant="ghost"
      size={iconOnly ? "icon" : "small"}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setStatus("Copied");
        } catch {
          setStatus("Copy unavailable");
        }
      }}
    >
      <CopyIcon aria-hidden="true" />
      {iconOnly ? null : (text ?? label)}
    </Button>
  );
  return (
    <span className="a-related-copy-control">
      {iconOnly ? <Tooltip label={status || label}>{button}</Tooltip> : button}
      <span
        role="status"
        className={
          iconOnly ? "a-related-visually-hidden" : "a-related-copy-status"
        }
      >
        {status}
      </span>
    </span>
  );
}
function ChannelValue({
  row,
  label,
  compact = false,
  copyLabel,
}: {
  row: Values;
  label: string;
  compact?: boolean;
  copyLabel?: string;
}) {
  const value = scalar(row.value),
    href = safeChannelHref(row.type, value);
  return (
    <span
      className={`a-related-record__channel-value${compact ? " a-related-record__channel-value--summary" : ""}`}
    >
      {href ? <a href={href}>{value}</a> : <span>{value}</span>}
      {value ? (
        <CopyValue
          value={value}
          label={copyLabel ?? `Copy ${label}`}
          iconOnly={compact}
          text="Copy"
        />
      ) : null}
    </span>
  );
}
/** Preserve supplied postal lines; never split a one-line address on commas. */
export function postalAddressLines(
  values: Values,
  locale = "en",
): readonly string[] {
  const formatted = scalar(values.formattedAddress);
  const structured = [
    ...(Array.isArray(values.lines)
      ? values.lines.filter((v) => typeof v === "string")
      : []),
    values.locality,
    values.region,
    values.postalCode,
    present(values.countryCode)
      ? detailValue(
          values.countryCode,
          {
            key: "country",
            field: "countryCode",
            label: "Country",
            renderer: "country",
          },
          locale,
        )
      : undefined,
  ]
    .filter(present)
    .map(scalar);
  return formatted && /[\r\n]/.test(formatted)
    ? formatted.split(/\r?\n/).filter(Boolean)
    : Array.isArray(values.lines) && values.lines.some(present)
      ? structured
      : formatted
        ? [formatted]
        : structured;
}
export function PostalAddress({
  values,
  locale = "en",
}: {
  values: Values;
  locale?: string;
}) {
  return (
    <address>
      {postalAddressLines(values, locale).map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </address>
  );
}
type SummaryProps = {
  profile: RelatedPresentationV1;
  values: Values;
  title: string;
  locale: string;
  timeZone?: string;
  restrictedFields: ReadonlySet<string>;
  footer?: ReactNode;
};
function summaryFields(profile: RelatedPresentationV1) {
  return (profile.summary?.fields ?? []).flatMap((reference) =>
    profile.groups.flatMap((group) =>
      group.fields.filter((field) => `${group.key}.${field.key}` === reference),
    ),
  );
}
/** Compact registered layout; all displayed field labels and mappings are published. */
export function AddressSummary({
  profile,
  values,
  title,
  locale,
  timeZone,
  restrictedFields,
  footer,
}: SummaryProps) {
  const lines = postalAddressLines(values, locale);
  return (
    <article className="a-related-summary a-related-summary--address">
      <div className="a-related-summary__heading">
        {title ? <h3>{title}</h3> : null}
        <div className="a-related-summary__badges">
          {summaryFields(profile)
            .filter(
              (field) =>
                !restrictedFields.has(field.field) &&
                present(valueAt(values, field.field)),
            )
            .map((field) => (
              <span key={field.key} aria-label={field.label}>
                <FieldValue
                  field={field}
                  value={valueAt(values, field.field)}
                  locale={locale}
                  timeZone={timeZone}
                />
              </span>
            ))}
        </div>
      </div>
      <PostalAddress values={values} locale={locale} />
      <div className="a-related-summary__actions">
        {lines.length ? (
          <CopyValue
            value={lines.join("\n")}
            label={profile.summary!.copyLabel}
          />
        ) : null}
        {footer}
      </div>
    </article>
  );
}
export function ContactSummary({
  profile,
  values,
  title,
  locale,
  timeZone,
  restrictedFields,
  footer,
}: SummaryProps) {
  const fields = summaryFields(profile).filter(
    (field) => !restrictedFields.has(`channels.${field.field}`),
  );
  const rows = Array.isArray(values.channels)
    ? values.channels.filter(
        (row): row is Values =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      )
    : [];
  const valueField = fields.find((field) => field.field === "value");
  return (
    <article className="a-related-summary a-related-summary--contact">
      {title ? <h3>{title}</h3> : null}
      <ul className="a-related-summary__channels">
        {rows.map((row, index) => (
          <li key={scalar(row.id) || index}>
            <div className="a-related-summary__channel-heading">
              {fields
                .filter(
                  (field) =>
                    field.field !== "value" &&
                    present(valueAt(row, field.field)),
                )
                .map((field) => (
                  <span key={field.key} aria-label={field.label}>
                    <FieldValue
                      field={field}
                      value={valueAt(row, field.field)}
                      locale={locale}
                      timeZone={timeZone}
                    />
                  </span>
                ))}
            </div>
            {valueField && present(row.value) ? (
              <ChannelValue
                row={row}
                label={valueField.label}
                compact
                copyLabel={`${profile.summary!.copyLabel}: ${
                  fields.find((field) => field.field === "type")
                    ? detailValue(
                        row.type,
                        fields.find((field) => field.field === "type")!,
                        locale,
                      )
                    : valueField.label
                }`}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {footer ? (
        <div className="a-related-summary__actions">{footer}</div>
      ) : null}
    </article>
  );
}
export function RelatedRecord({
  profile,
  values,
  compact = false,
  locale: requestedLocale,
  restrictedFields = [],
  actions = [],
  summaryFooter,
  hideScope = false,
}: {
  profile: RelatedPresentationV1;
  values: Values;
  compact?: boolean;
  locale?: string;
  restrictedFields?: readonly string[];
  actions?: readonly { operationKey: string; href: string }[];
  summaryFooter?: ReactNode;
  hideScope?: boolean;
}) {
  const intl = useOptionalI18n();
  const locale = requestedLocale ?? intl?.localization.formatLocale ?? "en";
  const timeZone = intl?.localization.timeZone;
  const [showEmpty, setShowEmpty] = useState(false);
  const restricted = new Set(restrictedFields);
  const safeValues = Object.fromEntries(
    Object.entries(values).filter(([key]) => !restricted.has(key)),
  );
  // A preformatted address can contain any postal component; suppress it when
  // a component is restricted, even if a provider accidentally retained it.
  if (
    ["lines", "locality", "region", "postalCode", "countryCode"].some((field) =>
      restricted.has(field),
    )
  )
    delete safeValues.formattedAddress;
  const detail = !compact ? profile.detail : undefined;
  const groups = profile.groups.filter((g) => !compact || g.compact);
  const missing = groups
    .filter((g) => g.renderer === "fields")
    .flatMap((g) =>
      g.fields.filter(
        (f) =>
          !detail ||
          (!detail.headerFields.includes(`${g.key}.${f.key}`) &&
            !g.detail?.omitFields.includes(f.key)),
      ),
    )
    .filter(
      (f) => !restricted.has(f.field) && !present(valueAt(safeValues, f.field)),
    ).length;
  const titleDefinition = profile.groups
    .flatMap((g) => g.fields)
    .find((f) => f.field === profile.titleField);
  const titleValue = valueAt(safeValues, profile.titleField);
  const title =
    profile.titleLabel ??
    (present(titleValue)
      ? titleDefinition
        ? detailValue(titleValue, titleDefinition, locale)
        : scalar(titleValue)
      : "");
  if (compact && profile.summary) {
    const props = {
      profile,
      values: safeValues,
      title,
      locale,
      timeZone,
      restrictedFields: restricted,
      footer: summaryFooter,
    };
    return profile.summary.layout === "postal-summary" ? (
      <AddressSummary {...props} />
    ) : (
      <ContactSummary {...props} />
    );
  }
  const renderGroup = (group: RelatedPresentationV1["groups"][number]) => {
    let content: ReactNode;
    const fields = group.fields.filter(
      (f) =>
        !restricted.has(f.field) &&
        (!detail ||
          (!detail.headerFields.includes(`${group.key}.${f.key}`) &&
            !group.detail?.omitFields.includes(f.key))),
    );
    if (group.renderer === "postal-address")
      content = (
        <>
          <PostalAddress values={safeValues} locale={locale} />
          {detail && postalAddressLines(safeValues, locale).length ? (
            <CopyValue
              value={postalAddressLines(safeValues, locale).join("\n")}
              label={detail.copyLabel}
            />
          ) : null}
        </>
      );
    else if (group.renderer === "fields") {
      if (
        !fields.some(
          (f) =>
            present(valueAt(safeValues, f.field)) ||
            (showEmpty && profile.emptyFields === "disclose"),
        )
      )
        return null;
      content = (
        <dl>
          {fields
            .filter(
              (f) =>
                present(valueAt(safeValues, f.field)) ||
                (showEmpty && profile.emptyFields === "disclose"),
            )
            .map((field) => (
              <div key={field.key}>
                <dt>{field.label}</dt>
                <dd>
                  <FieldValue
                    field={field}
                    value={valueAt(safeValues, field.field)}
                    recordValues={safeValues}
                    locale={locale}
                    timeZone={timeZone}
                  />
                </dd>
              </div>
            ))}
        </dl>
      );
    } else {
      const collection = group.renderer === "channels" ? "channels" : "events";
      const rows = Array.isArray(safeValues[collection])
        ? (safeValues[collection] as unknown[])
        : [];
      if (!rows.length) return null;
      const visibleRows = rows.filter(
        (v): v is Values =>
          Boolean(v) && typeof v === "object" && !Array.isArray(v),
      );
      const columns = fields.filter(
        (f) =>
          !restricted.has(`${collection}.${f.field}`) &&
          visibleRows.some((row) => present(valueAt(row, f.field))),
      );
      content =
        detail && group.renderer === "channels" ? (
          <div
            className="a-related-detail__channels"
            role="table"
            aria-label={group.label}
            style={
              {
                "--related-columns": columns
                  .map(
                    (f) =>
                      `minmax(0,${group.detail?.columnWeights[group.fields.indexOf(f)] ?? 1}fr)`,
                  )
                  .join(" "),
              } as React.CSSProperties
            }
          >
            <div role="row" className="a-related-detail__channel-header">
              {columns.map((f) => (
                <div role="columnheader" key={f.key}>
                  {f.label}
                </div>
              ))}
            </div>
            {visibleRows.map((row, index) => (
              <div
                role="row"
                className="a-related-detail__channel-row"
                key={scalar(row.id) || index}
              >
                {columns.map((field) => (
                  <div role="cell" key={field.key}>
                    <span
                      className="a-related-detail__mobile-label"
                      aria-hidden="true"
                    >
                      {field.label}
                    </span>
                    {field.field === "value" && present(row.value) ? (
                      <ChannelValue
                        row={row}
                        label={field.label}
                        compact
                        copyLabel={`${detail.copyLabel}: ${scalar(row.type)}`}
                      />
                    ) : (
                      <FieldValue
                        field={field}
                        value={valueAt(row, field.field)}
                        locale={locale}
                        timeZone={timeZone}
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <ul className="a-related-record__rows">
            {rows
              .filter(
                (v): v is Values =>
                  Boolean(v) && typeof v === "object" && !Array.isArray(v),
              )
              .map((row, index) => (
                <li key={scalar(row.id) || index}>
                  <dl>
                    {fields
                      .filter(
                        (f) =>
                          !restricted.has(`${collection}.${f.field}`) &&
                          present(valueAt(row, f.field)),
                      )
                      .map((field) => (
                        <div key={field.key}>
                          <dt>{field.label}</dt>
                          <dd>
                            {group.renderer === "channels" &&
                            field.field === "value" ? (
                              <ChannelValue row={row} label={field.label} />
                            ) : (
                              <FieldValue
                                field={field}
                                value={valueAt(row, field.field)}
                                locale={locale}
                                timeZone={timeZone}
                              />
                            )}
                          </dd>
                        </div>
                      ))}
                  </dl>
                </li>
              ))}
          </ul>
        );
    }
    return group.collapsed && !compact ? (
      <details key={group.key}>
        <summary>{group.label}</summary>
        {content}
      </details>
    ) : (
      <section key={group.key} aria-label={group.label}>
        {!detail || group.detail?.showLabel !== false ? (
          <h4>{group.label}</h4>
        ) : null}
        {content}
      </section>
    );
  };
  return (
    <article
      className={`a-related-record${compact ? " a-related-record--compact" : ""}${detail ? ` a-related-detail a-related-detail--${detail.layout}` : ""}`}
    >
      <div className="a-related-detail__heading">
        {title ? <h3>{title}</h3> : null}
        {detail ? (
          <div className="a-related-summary__badges">
            {groups.flatMap((group) =>
              group.fields
                .filter(
                  (f) =>
                    detail.headerFields.includes(`${group.key}.${f.key}`) &&
                    !restricted.has(f.field) &&
                    present(valueAt(safeValues, f.field)),
                )
                .map((field) => (
                  <span
                    key={`${group.key}.${field.key}`}
                    aria-label={field.label}
                  >
                    <FieldValue
                      field={field}
                      value={valueAt(safeValues, field.field)}
                      recordValues={safeValues}
                      locale={locale}
                      timeZone={timeZone}
                    />
                  </span>
                )),
            )}
          </div>
        ) : null}
      </div>
      {!compact && !hideScope ? (
        <p className="a-related-record__scope">{profile.scopeLabel}</p>
      ) : null}
      {detail ? (
        <div className="a-related-detail__body">
          <div className="a-related-detail__main">
            {groups
              .filter((g) => (g.detail?.placement ?? "main") === "main")
              .map(renderGroup)}
          </div>
          {groups.some((g) => g.detail?.placement === "aside") ? (
            <div className="a-related-detail__aside">
              {groups
                .filter((g) => g.detail?.placement === "aside")
                .map(renderGroup)}
            </div>
          ) : null}
          <div className="a-related-detail__footer">
            {groups
              .filter((g) => g.detail?.placement === "footer")
              .map(renderGroup)}
          </div>
        </div>
      ) : (
        groups.map(renderGroup)
      )}
      {!compact && profile.emptyFields === "disclose" && missing > 0 ? (
        <button
          type="button"
          aria-expanded={showEmpty}
          onClick={() => setShowEmpty((v) => !v)}
        >
          {detail ? (
            `${detail.additionalFieldsLabel} (${missing})`
          ) : (
            <>
              {showEmpty ? "Hide" : "Show"} {missing} missing{" "}
              {missing === 1 ? "field" : "fields"}
            </>
          )}
        </button>
      ) : null}
      {compact ? summaryFooter : null}
      {!compact
        ? profile.actions.map((action) => {
            const resolved = actions.find(
              (a) => a.operationKey === action.operationKey,
            );
            return resolved && /^\/(?!\/)/.test(resolved.href) ? (
              <a
                className="a-related-record__action"
                key={action.key}
                href={resolved.href}
              >
                {action.label}
              </a>
            ) : null;
          })
        : null}
    </article>
  );
}
export function RelatedSectionError({
  label,
  retry,
  restricted = false,
  supportReference,
}: {
  label: string;
  retry(): void;
  restricted?: boolean;
  supportReference?: string;
}) {
  return (
    <div role="alert">
      <h3>
        {restricted
          ? `${label} restricted`
          : `Couldn’t load ${label.toLocaleLowerCase()}`}
      </h3>
      <p>
        {restricted
          ? "Your current access does not allow this section."
          : "Try loading this section again."}
      </p>
      {!restricted ? (
        <button type="button" onClick={retry}>
          Retry
        </button>
      ) : null}
      {supportReference ? (
        <small>Support reference: {supportReference}</small>
      ) : null}
    </div>
  );
}
