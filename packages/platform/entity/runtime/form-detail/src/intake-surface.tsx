"use client";
import { EntityLookup, type EntityLookupAdapters } from "./entity-lookup";
import { useId, type CSSProperties } from "react";
import {
  intakeConditionMatches,
  intakeSurfaceValues,
  validateIntakeSurface,
  type EntityIntakeSurfaceV1,
  type IntakeChoiceField,
} from "@athyper/contract-platform-entity-runtime";
export {
  intakeSurfaceValues,
  validateIntakeSurface,
} from "@athyper/contract-platform-entity-runtime";

export function ChoiceCards({
  field,
  answers,
  onChange,
  error,
  disabled = false,
}: {
  readonly field: IntakeChoiceField;
  readonly answers: Readonly<Record<string, unknown>>;
  readonly onChange: (value: string) => void;
  readonly error?: string;
  readonly disabled?: boolean;
}) {
  const id = useId();
  return (
    <fieldset
      className="a-choice-cards"
      data-layout={field.presentation?.layout ?? "stacked"}
      data-option-columns={field.presentation?.optionColumns ?? 1}
      data-density={field.presentation?.density ?? "comfortable"}
      disabled={disabled}
      aria-describedby={
        [field.helpText ? `${id}-help` : null, error ? `${id}-error` : null]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      <legend>
        {field.label}
        {field.required ? <span aria-hidden="true"> *</span> : null}
      </legend>
      {field.helpText ? <p id={`${id}-help`}>{field.helpText}</p> : null}
      <div className="a-choice-cards__options">
        {field.options.map((option, index) => {
          const available = intakeConditionMatches(
              option.availableWhen,
              answers,
            ),
            selected = answers[field.key] === option.value;
          return (
            <label
              key={option.value}
              className="a-choice-cards__option"
              data-selected={selected}
              data-unavailable={!available}
            >
              <input
                type="radio"
                name={id}
                value={option.value}
                checked={selected}
                required={field.required}
                disabled={!available}
                aria-invalid={Boolean(error)}
                aria-describedby={
                  option.description || !available
                    ? `${id}-${index}-description`
                    : undefined
                }
                onChange={() => onChange(option.value)}
              />
              <span>
                <strong>{option.label}</strong>
                {option.description || !available ? (
                  <span
                    id={`${id}-${index}-description`}
                    className="a-choice-cards__description"
                  >
                    {option.description}
                    {!available ? (
                      <span className="a-choice-cards__reason">
                        {option.unavailableReason}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** Entity adapters own side effects; this renderer only emits declared answer changes. */
export function EntityIntakeSurface({
  surface,
  answers,
  onChange,
  lookupAdapters,
  showErrors = false,
  disabled = false,
}: {
  readonly surface: EntityIntakeSurfaceV1;
  readonly answers: Readonly<Record<string, unknown>>;
  readonly onChange: (
    answers: Readonly<Record<string, string>>,
    changedField: string,
  ) => void;
  readonly lookupAdapters?: EntityLookupAdapters;
  readonly showErrors?: boolean;
  readonly disabled?: boolean;
}) {
  const values = intakeSurfaceValues(surface, answers),
    errors = validateIntakeSurface(surface, answers);
  return (
    <div
      className="a-intake-surface"
      style={{ "--intake-columns": surface.columns } as CSSProperties}
    >
      {surface.sections
        .filter((section) =>
          section.fields.some((field) =>
            intakeConditionMatches(field.visibleWhen, values),
          ),
        )
        .map((section) => (
          <section className="a-intake-surface__section" key={section.key}>
            {section.title ? <h2>{section.title}</h2> : null}
            {section.description ? <p>{section.description}</p> : null}
            {section.fields
              .filter((field) =>
                intakeConditionMatches(field.visibleWhen, values),
              )
              .map((field) =>
                field.control === "entityLookup" ? (
                  <EntityLookup
                    key={`${field.key}:${JSON.stringify(values)}`}
                    field={field}
                    answers={values}
                    adapters={lookupAdapters}
                    disabled={disabled}
                  />
                ) : field.control === "choiceCards" ? (
                  <ChoiceCards
                    key={field.key}
                    field={field}
                    answers={values}
                    disabled={disabled}
                    error={
                      showErrors || (answers[field.key] && !values[field.key])
                        ? errors[field.key]
                        : undefined
                    }
                    onChange={(value) =>
                      onChange(
                        { ...answers, [field.key]: value } as Record<
                          string,
                          string
                        >,
                        field.key,
                      )
                    }
                  />
                ) : null,
              )}
          </section>
        ))}
    </div>
  );
}
