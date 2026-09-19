"use client";
import React, {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { SubsectionHeading, type SubsectionHeader } from "./subsection-heading";
import { createPortal } from "react-dom";
import { Button, Dialog, DialogContent } from "@athyper/platform-ui";
import {
  dataFieldVisible,
  resolveDataInput,
  dataItemSurface,
  dataSurfaceDefaults,
  validateDataInput,
  type DataAnswers,
  type EntityIntakeSurfaceV1,
  type IntakeRepeatableField,
} from "@athyper/contract-platform-entity-runtime";
import { DataValidationProvider, useDataValidation } from "./data-validation";

type Props = {
  field: IntakeRepeatableField;
  item: EntityIntakeSurfaceV1;
  surfaces: readonly EntityIntakeSurfaceV1[];
  rows: readonly DataAnswers[];
  disabled: boolean;
  style?: CSSProperties;
  hideLabel?: boolean;
  heading?: string;
  header?: SubsectionHeader;
  description?: string;
  onChange: (rows: readonly DataAnswers[]) => void;
  renderItem: (row: DataAnswers, index: number) => ReactNode;
};

/** Only declared, visible fields enter summaries. Password values are always masked. */
export function collectionSummary(
  field: IntakeRepeatableField,
  item: EntityIntakeSurfaceV1,
  row: DataAnswers,
  surfaces: readonly EntityIntakeSurfaceV1[] = [],
): string[] {
  return (field.presentation?.summary ?? []).flatMap((binding) => {
    const input = item.sections
      .flatMap((s) => s.fields)
      .find(
        (f) =>
          (f.control === "input" || f.control === "repeatableGroup") &&
          f.valueKey === binding.field,
      );
    if (
      !input ||
      (input.control !== "input" && input.control !== "repeatableGroup") ||
      !dataFieldVisible(input, item, row)
    )
      return [];
    const value = row[binding.field];
    if (
      binding.format === "primary" &&
      input.control === "repeatableGroup" &&
      Array.isArray(value)
    ) {
      const child = value.find(
        (r) => input.primaryField && r[input.primaryField] === true,
      );
      const childSurface = surfaces.find((s) => s.key === input.itemSurfaceKey);
      if (!child || !childSurface) return [];
      const preferred = {
        ...input,
        presentation: input.presentation
          ? {
              ...input.presentation,
              summary: input.presentation.summary.filter((s) =>
                input.presentation!.titleFields?.includes(s.field),
              ),
            }
          : undefined,
      };
      return collectionSummary(preferred, childSurface, child, surfaces).join(
        " · ",
      )
        ? [
            collectionSummary(preferred, childSurface, child, surfaces).join(
              " · ",
            ),
          ]
        : [];
    }
    if (binding.format === "count")
      return Array.isArray(value) && value.length
        ? [`${input.label}: ${value.length}`]
        : [];
    if (
      input.control !== "input" ||
      value === undefined ||
      value === null ||
      value === "" ||
      typeof value === "object"
    )
      return [];
    const raw = String(value);
    if (binding.format === "masked" || input.widget === "password")
      return [raw.length > 4 ? `•••• ${raw.slice(-4)}` : "••••"];
    if (input.widget === "checkbox") return value === true ? [input.label] : [];
    if (input.widget === "date") return [`${input.label}: ${raw}`];
    return [input.lookup?.options?.find((o) => o.value === raw)?.label ?? raw];
  });
}
function issueCount(
  item: EntityIntakeSurfaceV1,
  surfaces: readonly EntityIntakeSurfaceV1[],
  row: DataAnswers,
  mode: "draft" | "submit",
): number {
  return item.sections
    .flatMap((s) => s.fields)
    .reduce((count, raw) => {
      const f =
        raw.control === "input" ? resolveDataInput(raw, item, row) : raw;
      if (
        (f.control !== "input" && f.control !== "repeatableGroup") ||
        !dataFieldVisible(f, item, row)
      )
        return count;
      if (f.control === "input")
        return (
          count +
          Number(
            Boolean(
              validateDataInput(
                mode === "draft" ? { ...f, required: false } : f,
                row[f.valueKey],
                item.validationMessages,
              ),
            ),
          )
        );
      return (
        count +
        ((row[f.valueKey] ?? []) as DataAnswers[]).reduce(
          (n, child) =>
            n +
            issueCount(
              dataItemSurface(f.itemSurfaceKey, surfaces),
              surfaces,
              child,
              mode,
            ),
          0,
        )
      );
    }, 0);
}

function DoneAction({
  label,
  validate,
  onAttempt,
}: {
  label: string;
  validate: boolean;
  onAttempt: () => void;
}) {
  const validation = useDataValidation();
  return (
    <Button
      type="button"
      variant="secondary"
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        onAttempt();
        if (validate && validation && !validation.validate()) return;
        const details = event.currentTarget.closest("details");
        if (details) {
          details.open = false;
          details.querySelector("summary")?.focus();
        }
      }}
    >
      {label}
    </Button>
  );
}
function populated(value: unknown, baseline?: unknown): boolean {
  if (value === baseline) return false;
  if (Array.isArray(value))
    return value.some((v, i) =>
      populated(v, Array.isArray(baseline) ? baseline[i] : undefined),
    );
  if (value && typeof value === "object")
    return Object.entries(value).some(
      ([k, v]) =>
        k !== "key" &&
        populated(
          v,
          baseline && typeof baseline === "object"
            ? (baseline as Record<string, unknown>)[k]
            : undefined,
        ),
    );
  return typeof value === "string"
    ? value.trim().length > 0
    : typeof value === "number";
}
/** Editors stay mounted inside native details: uploads and validation survive collapse. */
export function CollectionSection({
  field,
  item,
  surfaces,
  rows,
  disabled,
  style,
  hideLabel,
  heading,
  header,
  description,
  onChange,
  renderItem,
}: Props) {
  const id = useId(),
    root = useRef<HTMLFieldSetElement>(null);
  const [added, setAdded] = useState<string>();
  const [removing, setRemoving] = useState<string>();
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const validation = useDataValidation();
  const p = field.presentation;
  useLayoutEffect(() => {
    if (!added) return;
    const details = Array.from(
      root.current?.querySelectorAll<HTMLDetailsElement>(
        ":scope > .a-collection__row",
      ) ?? [],
    ).find((d) => d.dataset.rowKey === added);
    if (details) {
      details.open = true;
      details
        .querySelector<HTMLElement>(
          "input:not([type=hidden]),select,textarea,button",
        )
        ?.focus();
    }
  }, [added]);
  return (
    <fieldset
      ref={root}
      className="a-data-surface__group a-collection"
      data-presentation={p?.renderer ?? "generic"}
      disabled={disabled}
      style={style}
    >
      <legend
        className={hideLabel ? "a-collection__legend--hidden" : undefined}
      >
        {field.label}
      </legend>
      <div
        className={
          header
            ? "a-collection__toolbar a-subsection-header"
            : "a-collection__toolbar"
        }
        data-heading={p?.headingCount || undefined}
      >
        {p?.headingCount ? (
          header ? (
            <h3 className="a-collection__heading">
              <SubsectionHeading header={header}>
                {heading ?? field.label}{" "}
                <span className="a-collection__heading-count">
                  ({rows.length})
                </span>
              </SubsectionHeading>
            </h3>
          ) : (
            <h2 className="a-collection__heading">
              {heading ?? field.label}{" "}
              <span className="a-collection__heading-count">
                ({rows.length})
              </span>
            </h2>
          )
        ) : (
          <span className="a-collection__count">
            {hideLabel ? null : field.label}{" "}
            <span
              className="a-collection__badge"
              aria-label={`${field.label}: ${rows.length}`}
            >
              {rows.length}
            </span>
          </span>
        )}
        <Button
          type="button"
          variant="secondary"
          size={header ? "small" : "medium"}
          disabled={disabled || rows.length >= field.maxItems}
          onClick={() => {
            const key = crypto.randomUUID();
            onChange([
              ...rows,
              {
                ...dataSurfaceDefaults(item, surfaces),
                key,
                ...(field.primaryField
                  ? { [field.primaryField]: rows.length === 0 }
                  : {}),
              },
            ]);
            setAdded(key);
          }}
        >
          {field.addLabel}
        </Button>
      </div>
      {description ? (
        <p className="a-collection__description">{description}</p>
      ) : null}
      {!rows.length && p ? (
        <p className="a-collection__empty">{p.emptyText}</p>
      ) : null}
      {rows.map((row, index) => {
        const norm = (value: unknown) =>
          String(value ?? "")
            .normalize("NFKC")
            .trim()
            .toLocaleLowerCase()
            .replace(/\s+/g, " ");
        const duplicate =
          p?.duplicateCheck &&
          p.duplicateCheck.requireAny.some((key) => norm(row[key])) &&
          rows.some(
            (other) =>
              other.key !== row.key &&
              p.duplicateCheck!.fields.every(
                (key) => norm(other[key]) === norm(row[key]),
              ),
          );
        const summary = collectionSummary(field, item, row, surfaces);
        const titleParts = p?.titleFields
          ? collectionSummary(
              {
                ...field,
                presentation: {
                  ...p,
                  summary: p.summary.filter((s) =>
                    p.titleFields!.includes(s.field),
                  ),
                },
              },
              item,
              row,
              surfaces,
            )
          : undefined;
        const secondary = p?.titleFields
          ? collectionSummary(
              {
                ...field,
                presentation: {
                  ...p,
                  summary: p.summary.filter(
                    (s) => !p.titleFields!.includes(s.field),
                  ),
                },
              },
              item,
              row,
              surfaces,
            )
          : summary.slice(1);
        const issues =
          !disabled && (validation?.attempted || checked.has(String(row.key)))
            ? issueCount(
                item,
                surfaces,
                row,
                checked.has(String(row.key))
                  ? "submit"
                  : (validation?.mode ?? "submit"),
              )
            : 0;
        const title =
          (titleParts ? titleParts.join(" · ") : summary[0]) ||
          `${field.itemLabel} ${index + 1}`;
        const remove = () => {
          const next = rows.filter((r) => r.key !== row.key);
          if (
            field.primaryField &&
            row[field.primaryField] === true &&
            next.length
          )
            next[0] = { ...next[0], [field.primaryField]: true };
          onChange(next);
          setRemoving(undefined);
          requestAnimationFrame(() =>
            root.current
              ?.querySelector<HTMLButtonElement>(
                ".a-collection__toolbar button",
              )
              ?.focus(),
          );
        };
        const confirmation = p?.removalConfirmation;
        const identity = confirmation?.titleFields
          ? collectionSummary(
              {
                ...field,
                presentation: {
                  ...p!,
                  summary: p!.summary.filter((s) =>
                    confirmation.titleFields!.includes(s.field),
                  ),
                },
              },
              item,
              row,
            ).join(" · ")
          : title;
        const impact =
          confirmation?.impactField &&
          Array.isArray(row[confirmation.impactField])
            ? (row[confirmation.impactField] as unknown[]).length
            : 0;
        const dialogTitle = (confirmation?.title ?? "{item}").replace(
          "{item}",
          identity || title,
        );
        const dialogMessage =
          impact && confirmation?.impactMessage
            ? confirmation.impactMessage.replace("{count}", String(impact))
            : confirmation?.message;
        return (
          <details
            className="a-collection__row"
            key={String(row.key)}
            data-row-key={String(row.key)}
            onToggle={(event) => {
              const current = event.currentTarget;
              if (current.open)
                for (const sibling of root.current?.children ?? []) {
                  if (
                    sibling !== current &&
                    sibling instanceof HTMLDetailsElement
                  )
                    sibling.open = false;
                }
            }}
          >
            <summary aria-controls={`${id}-${row.key}`}>
              <span className="a-collection__summary">
                <strong>{title}</strong>
                {secondary.length ? <span>{secondary.join(" · ")}</span> : null}
              </span>
              {field.primaryField && row[field.primaryField] === true ? (
                <span className="a-collection__badge">
                  {field.primaryLabel}
                </span>
              ) : null}
              {duplicate ? (
                <span className="a-collection__duplicate">
                  {p!.duplicateCheck!.label}
                </span>
              ) : null}
              {issues ? (
                <span className="a-collection__issues">
                  {p?.issuesLabel.replace("{count}", String(issues)) ??
                    String(issues)}
                </span>
              ) : null}
              <span className="a-collection__edit">
                {p?.editLabel ?? field.itemLabel}
              </span>
            </summary>
            <div className="a-collection__editor" id={`${id}-${row.key}`}>
              {duplicate ? (
                <p className="a-collection__duplicate-message" role="status">
                  {p!.duplicateCheck!.message}
                </p>
              ) : null}
              <DataValidationProvider>
                {renderItem(row, index)}
                <div className="a-collection__actions">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={disabled || rows.length <= field.minItems}
                    className={
                      p?.removalConfirmation
                        ? "a-collection__remove"
                        : undefined
                    }
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.currentTarget.focus();
                      if (
                        p?.removalConfirmation &&
                        populated(row, dataSurfaceDefaults(item, surfaces))
                      )
                        setRemoving(String(row.key));
                      else remove();
                    }}
                  >
                    {field.removeLabel}
                  </Button>
                  <DoneAction
                    label={p?.doneLabel ?? field.itemLabel}
                    validate={Boolean(p?.validateOnDone)}
                    onAttempt={() =>
                      setChecked(
                        (previous) => new Set([...previous, String(row.key)]),
                      )
                    }
                  />
                </div>
                {removing === String(row.key) &&
                confirmation?.mode === "dialog" ? (
                  createPortal(
                    <Dialog
                      open
                      onOpenChange={(open) => {
                        if (!open) setRemoving(undefined);
                      }}
                    >
                      <DialogContent
                        title={dialogTitle}
                        description={dialogMessage}
                        className="a-collection-removal-dialog"
                      >
                        <div className="a-collection-removal-dialog__actions">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setRemoving(undefined)}
                          >
                            {confirmation.cancelLabel}
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            disabled={disabled || rows.length <= field.minItems}
                            onClick={remove}
                          >
                            {confirmation.confirmLabel}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>,
                    document.body,
                  )
                ) : removing === String(row.key) && p?.removalConfirmation ? (
                  <div className="a-collection__confirmation" role="alert">
                    <p>{p.removalConfirmation.message}</p>
                    <Button
                      type="button"
                      variant="secondary"
                      autoFocus
                      onClick={() => {
                        setRemoving(undefined);
                        root.current
                          ?.querySelector<HTMLDetailsElement>(
                            `details[data-row-key="${row.key}"]`,
                          )
                          ?.querySelector<HTMLButtonElement>(
                            ".a-collection__remove",
                          )
                          ?.focus();
                      }}
                    >
                      {p.removalConfirmation.cancelLabel}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={disabled || rows.length <= field.minItems}
                      onClick={remove}
                    >
                      {p.removalConfirmation.confirmLabel}
                    </Button>
                  </div>
                ) : null}
              </DataValidationProvider>
            </div>
          </details>
        );
      })}
    </fieldset>
  );
}

// Named reusable presentations share the same data, validation and editing contract.
export const AddressesSection = (props: Props) => (
  <CollectionSection {...props} />
);
export const ContactsSection = (props: Props) => (
  <CollectionSection {...props} />
);
export const BankAccountsSection = (props: Props) => (
  <CollectionSection {...props} />
);
export const CertificationsSection = (props: Props) => (
  <CollectionSection {...props} />
);
export const SupportingDocumentsSection = (props: Props) => (
  <CollectionSection {...props} />
);
export const collectionPresentations = {
  generic: CollectionSection,
  addresses: AddressesSection,
  contacts: ContactsSection,
  "bank-accounts": BankAccountsSection,
  certifications: CertificationsSection,
  documents: SupportingDocumentsSection,
  channels: CollectionSection,
} as const;
