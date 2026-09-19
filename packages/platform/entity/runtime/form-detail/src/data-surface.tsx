"use client";
import { EntityFormLayout } from "./form-layout";
import { SubsectionHeading, type SubsectionHeader } from "./subsection-heading";
import React, {
  useId,
  useState,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { collectionPresentations } from "./collection-section";
import { useDataValidation, useValidationMessage } from "./data-validation";
import { validateDataInput } from "@athyper/contract-platform-entity-runtime";
import {
  ReferenceSelect,
  type ReferenceHistoryBinding,
  type ReferenceChoiceScope,
} from "./reference-select";
import {
  Button,
  Dialog,
  DialogContent,
  Input,
  Select,
  choicePresentation,
} from "@athyper/platform-ui";
import {
  resolveDataItemSurface,
  resolveDataInput,
  resolveDataAnswers,
  changedDataInput,
  dataInputChangeRequiresConfirmation,
  dataFieldVisible,
  dataSurfaceDefaults,
  type DataAnswers,
  type EntityIntakeSurfaceV1,
  type IntakeInputField,
} from "@athyper/contract-platform-entity-runtime";
export {
  dataSurfaceDefaults,
  dataSurfaceValues,
  dataFieldVisible,
  type DataAnswers,
} from "@athyper/contract-platform-entity-runtime";
export type DataInputHandlers = Readonly<
  Record<
    string,
    (props: {
      field: IntakeInputField;
      value: unknown;
      onChange: (value: unknown) => void;
      id: string;
      name: string;
      disabled: boolean;
    }) => ReactNode
  >
>;
/** Same component renders root surfaces and bounded nested collection item surfaces. */
export function EntityDataSurface({
  surface,
  surfaces,
  answers: suppliedAnswers,
  onChange,
  handlers = {},
  disabled = false,
  prefix = "",
  referenceHistory,
  referenceChoiceScope,
  sectionNavigation,
  primaryField,
  primaryLabel,
  onPrimary,
}: {
  surface: EntityIntakeSurfaceV1;
  surfaces: readonly EntityIntakeSurfaceV1[];
  answers: DataAnswers;
  onChange: (answers: DataAnswers) => void;
  handlers?: DataInputHandlers;
  disabled?: boolean;
  prefix?: string;
  referenceHistory?: Omit<ReferenceHistoryBinding, "surfaceKey" | "fieldKey">;
  referenceChoiceScope?: ReferenceChoiceScope;
  sectionNavigation?: {
    readonly label: string;
    readonly mode?: "create" | "amend";
  };
  primaryField?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
}) {
  const answers = resolveDataAnswers(surface, suppliedAnswers);
  const id = useId();
  const [pending, setPending] = useState<{
    field: IntakeInputField;
    value: unknown;
  }>();
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const validation = useDataValidation(),
    message = useValidationMessage();
  const [focused, setFocused] = useState<string>();
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  // Effective dates belong to the current item surface, including certificate rows.
  const dateFields = surface.sections
    .flatMap((section) => section.fields)
    .filter(
      (field): field is IntakeInputField =>
        field.control === "input" &&
        field.widget === "date" &&
        dataFieldVisible(field, surface, answers),
    );
  const fromField = dateFields.find(
    (field) => field.valueKey === "effectiveFrom",
  );
  const untilField = dateFields.find(
    (field) => field.valueKey === "effectiveUntil",
  );
  const fromDate = fromField ? String(answers[fromField.valueKey] ?? "") : "";
  const untilDate = untilField
    ? String(answers[untilField.valueKey] ?? "")
    : "";
  const rangeError =
    fromField &&
    untilField &&
    /^\d{4}-\d{2}-\d{2}$/.test(fromDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(untilDate) &&
    untilDate < fromDate
      ? `${untilField.label} must be on or after ${fromField.label.toLocaleLowerCase()}.`
      : undefined;

  const read = useRef(
    (_mode: "draft" | "submit") => [] as { id: string; message: string }[],
  );
  read.current = (mode) =>
    disabled
      ? []
      : surface.sections
          .flatMap((s) => s.fields)
          .flatMap((raw) => {
            const f =
              raw.control === "input"
                ? resolveDataInput(raw, surface, answers)
                : raw;
            if (f.control !== "input" || !dataFieldVisible(f, surface, answers))
              return [];
            const issue = validateDataInput(
              mode === "draft" ? { ...f, required: false } : f,
              answers[f.valueKey],
              surface.validationMessages,
            );
            if (!issue && f.valueKey === untilField?.valueKey && rangeError)
              return [{ id: `${id}-${f.key}`, message: rangeError }];
            return issue
              ? [{ id: `${id}-${f.key}`, message: message(issue) }]
              : [];
          });
  useLayoutEffect(
    () => validation?.register(id, (mode) => read.current(mode)),
    [id, validation?.register],
  );
  const closeChange = () => {
    const field = pending?.field;
    setPending(undefined);
    if (field)
      requestAnimationFrame(() =>
        document.getElementById(`${id}-${field.key}`)?.focus(),
      );
  };
  const changeText = (template: string) => {
    if (!pending) return template;
    const label = (value: unknown) =>
      pending.field.lookup?.options?.find((o) => o.value === value)?.label ??
      String(value ?? "");
    return template.replace(/\{(previous|next)\}/g, (_, token) =>
      label(token === "next" ? pending.value : answers[pending.field.valueKey]),
    );
  };
  const navigationSections = surface.sections.flatMap((section) => {
    const visible = section.fields.filter(
      (f) =>
        (f.control === "input" || f.control === "repeatableGroup") &&
        dataFieldVisible(f, surface, answers),
    );
    if (!visible.length) return [];
    const collection =
      visible.length === 1 && visible[0]?.control === "repeatableGroup"
        ? visible[0]
        : undefined;
    return [
      {
        key: section.key,
        label: collection?.label ?? section.title ?? surface.title,
        ...(collection
          ? {
              count: Array.isArray(answers[collection.valueKey])
                ? (answers[collection.valueKey] as unknown[]).length
                : 0,
            }
          : {}),
      },
    ];
  });
  const sectionContent = surface.sections
    .filter((section) =>
      section.fields.some(
        (f) =>
          (f.control === "input" || f.control === "repeatableGroup") &&
          dataFieldVisible(f, surface, answers),
      ),
    )
    .map((section) => (
      <DataSection
        key={section.key}
        navigationKey={sectionNavigation ? section.key : undefined}
        navigationLabel={
          navigationSections.find((item) => item.key === section.key)?.label
        }
        title={
          section.fields.length === 1 &&
          section.fields[0]?.control === "repeatableGroup" &&
          section.fields[0].presentation?.headingCount
            ? undefined
            : section.title
        }
        header={section.header}
        collapsible={section.collapsible}
        populatedSummary={(section.populatedSummaryFields ?? [])
          .flatMap((key) => {
            const f = section.fields.find(
              (f) => f.control === "input" && f.valueKey === key,
            );
            const value = answers[key];
            if (
              !f ||
              f.control !== "input" ||
              !value ||
              value === f.defaultValue ||
              !dataFieldVisible(f, surface, answers)
            )
              return [];
            const effective = resolveDataInput(f, surface, answers);
            if (effective.widget === "hidden") return [];
            return [
              `${f.label}: ${f.widget === "password" ? "••••" : (f.lookup?.options?.find((o) => o.value === value)?.label ?? String(value))}`,
            ];
          })
          .join(" · ")}
      >
        {section.description &&
        !(
          section.fields.length === 1 &&
          section.fields[0]?.control === "repeatableGroup" &&
          section.fields[0].presentation?.headingCount
        ) ? (
          <p>{section.description}</p>
        ) : null}
        <div
          className="a-data-surface__grid"
          style={{ "--data-columns": section.columns ?? 12 } as CSSProperties}
        >
          {section.fields.map((candidate) => {
            if (
              candidate.control !== "input" &&
              candidate.control !== "repeatableGroup"
            )
              throw Error("Unsupported data surface control");
            const f =
              candidate.control === "input"
                ? resolveDataInput(candidate, surface, answers)
                : candidate;
            if (!dataFieldVisible(f, surface, answers)) return null;
            const name = prefix ? `${prefix}.${f.valueKey}` : f.valueKey,
              fieldId = `${id}-${f.key}`,
              update = (value: unknown) => {
                if (f.control !== "input") {
                  onChange({ ...answers, [f.valueKey]: value });
                  return;
                }
                if (
                  dataInputChangeRequiresConfirmation(
                    f,
                    surface,
                    answers,
                    value,
                  )
                ) {
                  setPending({ field: f, value });
                  return;
                }
                onChange(changedDataInput(f, answers, value));
              };
            const style = {
              "--data-span": Math.min(f.columnSpan, section.columns ?? 12),
            } as CSSProperties;
            if (f.control === "repeatableGroup") {
              const rows = (answers[f.valueKey] ??
                  []) as readonly DataAnswers[],
                item = resolveDataItemSurface(f, surface, answers, surfaces);
              if (f.presentation) {
                const Presentation =
                  collectionPresentations[f.presentation.renderer];
                return (
                  <Presentation
                    key={f.key}
                    field={f}
                    item={item}
                    surfaces={surfaces}
                    rows={rows}
                    disabled={disabled}
                    style={style}
                    hideLabel={section.title === f.label}
                    header={
                      section.fields.length === 1 ? section.header : undefined
                    }
                    heading={
                      section.fields.length === 1 ? section.title : undefined
                    }
                    description={
                      section.fields.length === 1 && f.presentation.headingCount
                        ? section.description
                        : undefined
                    }
                    onChange={update}
                    renderItem={(row, index) => (
                      <EntityDataSurface
                        surface={item}
                        surfaces={surfaces}
                        referenceHistory={referenceHistory}
                        referenceChoiceScope={referenceChoiceScope}
                        answers={row}
                        prefix={name + "." + String(row.key)}
                        handlers={handlers}
                        disabled={disabled}
                        primaryField={f.primaryField}
                        primaryLabel={f.primaryLabel}
                        onPrimary={() =>
                          update(
                            rows.map((r) => ({
                              ...r,
                              [f.primaryField!]: r.key === row.key,
                            })),
                          )
                        }
                        onChange={(value) =>
                          update(rows.map((r, i) => (i === index ? value : r)))
                        }
                      />
                    )}
                  />
                );
              }
              return (
                <fieldset
                  className="a-data-surface__group"
                  style={style}
                  key={f.key}
                  disabled={disabled}
                >
                  <legend>{f.label}</legend>
                  {rows.map((row, index) => (
                    <div className="a-data-surface__item" key={String(row.key)}>
                      <div className="a-data-surface__item-header">
                        <h3>
                          {f.itemLabel} {index + 1}
                        </h3>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={rows.length <= f.minItems}
                          onClick={() => {
                            const next = rows.filter((r) => r.key !== row.key);
                            if (
                              f.primaryField &&
                              row[f.primaryField] === true &&
                              next.length
                            )
                              next[0] = {
                                ...next[0],
                                [f.primaryField]: true,
                              };
                            update(next);
                          }}
                        >
                          {f.removeLabel}
                        </Button>
                      </div>
                      <EntityDataSurface
                        surface={item}
                        surfaces={surfaces}
                        referenceHistory={referenceHistory}
                        referenceChoiceScope={referenceChoiceScope}
                        answers={row}
                        prefix={name + "." + String(row.key)}
                        handlers={handlers}
                        disabled={disabled}
                        primaryField={f.primaryField}
                        primaryLabel={f.primaryLabel}
                        onPrimary={() =>
                          update(
                            rows.map((r) => ({
                              ...r,
                              [f.primaryField!]: r.key === row.key,
                            })),
                          )
                        }
                        onChange={(value) =>
                          update(rows.map((r, i) => (i === index ? value : r)))
                        }
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={rows.length >= f.maxItems}
                    onClick={() =>
                      update([
                        ...rows,
                        {
                          ...dataSurfaceDefaults(item, surfaces),
                          key: crypto.randomUUID(),
                          ...(f.primaryField
                            ? { [f.primaryField]: rows.length === 0 }
                            : {}),
                        },
                      ])
                    }
                  >
                    {f.addLabel}
                  </Button>
                </fieldset>
              );
            }
            if (f.widget === "hidden")
              return (
                <input
                  key={f.key}
                  type="hidden"
                  name={name}
                  value={String(answers[f.valueKey] ?? "")}
                />
              );
            const issue =
              !disabled && (validation?.attempted || touched.has(f.key))
                ? validateDataInput(
                    validation?.mode === "draft"
                      ? { ...f, required: false }
                      : f,
                    answers[f.valueKey],
                    surface.validationMessages,
                  )
                : undefined;
            const error = issue
              ? message(issue)
              : !disabled &&
                  (validation?.attempted || touched.has(f.key)) &&
                  f.valueKey === untilField?.valueKey
                ? rangeError
                : undefined;
            const count = Array.from(
              String(answers[f.valueKey] ?? "").trim(),
            ).length;
            const showCounter = Boolean(
              f.maxLength &&
              ["text", "textarea"].includes(f.widget) &&
              (focused === f.key || count >= Math.ceil(f.maxLength * 0.8)),
            );
            const value = answers[f.valueKey] ?? "",
              common = {
                id: fieldId,
                name,
                required: f.required,
                disabled,
                "aria-invalid": error ? true : undefined,
                "aria-describedby":
                  [
                    error
                      ? fieldId + "-error"
                      : f.helpText
                        ? fieldId + "-help"
                        : "",
                    showCounter ? fieldId + "-counter" : "",
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined,
              };
            const isPrimary = f.valueKey === primaryField;
            return (
              <div
                className={
                  isPrimary
                    ? "a-data-surface__field a-data-surface__field--primary"
                    : "a-data-surface__field"
                }
                onFocusCapture={() => setFocused(f.key)}
                onBlurCapture={(event) => {
                  if (
                    !event.currentTarget.contains(
                      event.relatedTarget as Node | null,
                    )
                  )
                    setFocused(undefined);
                  setTouched((current) => new Set([...current, f.key]));
                }}
                style={style}
                key={f.key}
              >
                {f.widget === "registered" ? (
                  (() => {
                    const handler = handlers[f.handlerKey!];
                    if (!handler)
                      throw Error(
                        `Unregistered input handler: ${f.handlerKey}`,
                      );
                    return handler({
                      field: f,
                      value,
                      onChange: update,
                      id: fieldId,
                      name,
                      disabled,
                    });
                  })()
                ) : (
                  <>
                    <label htmlFor={fieldId}>
                      {isPrimary ? (primaryLabel ?? f.label) : f.label}
                      {f.required ? " *" : ""}
                    </label>
                    {f.widget === "select" &&
                    choicePresentation({
                      optionCount: f.lookup?.options?.length ?? 0,
                      sourceKey: f.lookup?.sourceKey,
                    }) === "searchable" ? (
                      <ReferenceSelect
                        {...common}
                        label={f.label}
                        value={String(value)}
                        options={f.lookup?.options ?? []}
                        sourceKey={f.lookup?.sourceKey ?? f.key}
                        recentScope={referenceChoiceScope}
                        recentPolicy={
                          f.lookup?.sourceKey
                            ? f.lookup.recent
                            : { enabled: false, limit: 5 }
                        }
                        history={
                          referenceHistory
                            ? {
                                ...referenceHistory,
                                surfaceKey: surface.key,
                                fieldKey: f.key,
                              }
                            : undefined
                        }
                        placeholder={f.placeholder}
                        describedBy={common["aria-describedby"]}
                        onChange={update}
                      />
                    ) : f.widget === "select" ? (
                      <Select
                        {...common}
                        value={String(value)}
                        onChange={(e) => update(e.currentTarget.value)}
                      >
                        <option value="">
                          {f.placeholder ?? "Select an option"}
                        </option>
                        {f.lookup?.options?.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    ) : f.widget === "textarea" ? (
                      <textarea
                        {...common}
                        value={String(value)}
                        placeholder={f.placeholder}
                        onChange={(e) => update(e.currentTarget.value)}
                      />
                    ) : f.widget === "checkbox" ? (
                      <input
                        {...common}
                        type={isPrimary ? "radio" : "checkbox"}
                        name={
                          isPrimary
                            ? `${prefix.slice(0, prefix.lastIndexOf("."))}.__primary`
                            : name
                        }
                        checked={value === true}
                        onChange={(e) =>
                          isPrimary
                            ? onPrimary?.()
                            : update(e.currentTarget.checked)
                        }
                      />
                    ) : (
                      <div className="a-data-input-with-action">
                        <Input
                          {...common}
                          min={
                            f.widget === "date" &&
                            f.valueKey === untilField?.valueKey &&
                            fromField
                              ? fromDate || undefined
                              : undefined
                          }
                          type={
                            ["integer", "decimal"].includes(f.widget)
                              ? "number"
                              : f.widget === "password" && revealed.has(f.key)
                                ? "text"
                                : f.widget
                          }
                          step={
                            f.widget === "decimal"
                              ? "any"
                              : f.widget === "integer"
                                ? 1
                                : undefined
                          }
                          value={String(value)}
                          placeholder={f.placeholder}
                          onChange={(e) => update(e.currentTarget.value)}
                        />
                        {f.widget === "password" && f.revealLabels ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={disabled}
                            aria-controls={fieldId}
                            aria-pressed={revealed.has(f.key)}
                            onClick={() =>
                              setRevealed((current) => {
                                const next = new Set(current);
                                next.has(f.key)
                                  ? next.delete(f.key)
                                  : next.add(f.key);
                                return next;
                              })
                            }
                          >
                            {revealed.has(f.key)
                              ? f.revealLabels.hide
                              : f.revealLabels.show}
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </>
                )}
                {f.lookup?.emptyText && f.lookup.options?.length === 0 ? (
                  <p role="status" className="a-field-help">
                    {f.lookup.emptyText}
                  </p>
                ) : null}
                {error ||
                f.helpText ||
                (f.maxLength && ["text", "textarea"].includes(f.widget)) ? (
                  <div className="a-field-support">
                    <div className="a-field-support__message">
                      {error ? (
                        <p
                          id={fieldId + "-error"}
                          className="a-field-error"
                          aria-live="polite"
                        >
                          <span aria-hidden="true">⚠ </span>
                          {error}
                        </p>
                      ) : f.helpText ? (
                        <p id={fieldId + "-help"} className="a-field-help">
                          {f.helpText}
                        </p>
                      ) : null}
                    </div>
                    {showCounter ? (
                      <p id={fieldId + "-counter"} className="a-field-counter">
                        {count} / {f.maxLength}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </DataSection>
    ));
  return (
    <div className="a-data-surface">
      {pending?.field.clearOnChange?.mode === "dialog" ? (
        createPortal(
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open) closeChange();
            }}
          >
            <DialogContent
              title={changeText(
                pending.field.clearOnChange.title ?? pending.field.label,
              )}
              description={changeText(pending.field.clearOnChange.message)}
              className="a-collection-removal-dialog"
            >
              <div className="a-collection-removal-dialog__actions">
                <Button type="button" variant="secondary" onClick={closeChange}>
                  {changeText(pending.field.clearOnChange.cancelLabel)}
                </Button>
                <Button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(
                      changedDataInput(pending.field, answers, pending.value),
                    );
                    closeChange();
                  }}
                >
                  {changeText(pending.field.clearOnChange.confirmLabel)}
                </Button>
              </div>
            </DialogContent>
          </Dialog>,
          document.body,
        )
      ) : pending ? (
        <div className="a-data-change-notice" role="alert">
          <p>{pending.field.clearOnChange!.message}</p>
          <Button
            type="button"
            onClick={() => {
              onChange(changedDataInput(pending.field, answers, pending.value));
              setPending(undefined);
            }}
          >
            {pending.field.clearOnChange!.confirmLabel}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPending(undefined)}
          >
            {pending.field.clearOnChange!.cancelLabel}
          </Button>
        </div>
      ) : null}
      {sectionNavigation ? (
        <EntityFormLayout
          sections={navigationSections}
          navigationLabel={sectionNavigation.label}
          mode={sectionNavigation.mode}
        >
          {sectionContent}
        </EntityFormLayout>
      ) : (
        sectionContent
      )}
    </div>
  );
}

function DataSection({
  navigationKey,
  navigationLabel,
  title,
  populatedSummary,
  header,
  collapsible,
  children,
}: {
  navigationKey?: string;
  navigationLabel?: string;
  title?: string;
  populatedSummary?: string;
  header?: SubsectionHeader;
  collapsible?: boolean;
  children: ReactNode;
}) {
  const root = useRef<HTMLDetailsElement>(null);
  const populated = Boolean(populatedSummary);
  useLayoutEffect(() => {
    if (populated && root.current) root.current.open = true;
  }, [populated]);
  return collapsible ? (
    <details
      ref={root}
      data-form-section={navigationKey}
      aria-label={navigationKey ? navigationLabel : undefined}
      tabIndex={navigationKey ? -1 : undefined}
      className="a-intake-surface__section a-data-section--collapsible"
    >
      <summary className={header ? "a-subsection-header" : undefined}>
        <SubsectionHeading header={header}>
          {title}
          {populatedSummary ? (
            <small className="a-data-section__summary">
              {populatedSummary}
            </small>
          ) : null}
        </SubsectionHeading>
      </summary>
      {children}
    </details>
  ) : (
    <section
      className="a-intake-surface__section"
      data-form-section={navigationKey}
      aria-label={navigationKey ? navigationLabel : undefined}
      tabIndex={navigationKey ? -1 : undefined}
    >
      {title ? (
        header ? (
          <h3 className="a-subsection-header">
            <SubsectionHeading header={header}>{title}</SubsectionHeading>
          </h3>
        ) : (
          <h2>{title}</h2>
        )
      ) : null}
      {children}
    </section>
  );
}
