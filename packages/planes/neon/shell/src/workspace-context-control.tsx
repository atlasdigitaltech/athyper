"use client";
import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { NeonOperatingOrganization } from "@athyper/platform-api-client";
import { CheckIcon } from "@athyper/platform-icons";
import { useDismissablePicker } from "./dismissable-picker";

const EN = {
  apply: "Apply",
  cancel: "Cancel",
  company: "Company",
  organization: "Operating organization",
  chooseCompany: "Choose company",
  chooseOrganization: "Choose organization",
  clearOrganization: "All permitted organizations",
  searchOrganizations: "Search operating organizations",
  loading: "Loading…",
  retry: "Try again",
  supportReference: "Support reference",
} as const;
export type WorkspaceContextControlMessages = Readonly<{
  [K in keyof typeof EN]: string;
}>;

export interface WorkspaceContextControlProps {
  readonly mode: "editable" | "readonly" | "not_applicable";
  readonly status: "resolving" | "ready" | "required" | "denied" | "error";
  /** Precomputed accessible summary per §10.1's table, e.g. "Company: UK01 · Org: Procurement". */
  readonly summary: string;
  readonly pendingCompanyCodeId?: string;
  readonly pendingOperatingOrganizationId?: string;
  readonly companies?: readonly {
    readonly companyCodeId: string;
    readonly code: string;
    readonly displayName: string;
  }[];
  /** Already filtered to compatible-with-pending-company by the caller. */
  readonly organizations?: readonly NeonOperatingOrganization[];
  readonly onPendingChange: (next: {
    readonly companyCodeId?: string;
    readonly operatingOrganizationId?: string;
  }) => void;
  readonly onApply: () => void;
  readonly onOpenChange?: (open: boolean) => void;
  readonly busy?: boolean;
  readonly error?: string;
  readonly retry?: () => void;
  readonly messages?: Partial<WorkspaceContextControlMessages>;
}

export interface WorkspaceContextControlHandle {
  /** Opens the panel programmatically, e.g. from the required-context status strip's action. */
  open(): void;
}

/** Shared trailing nav-band control for Company Code / Operating Organization scope (design doc §10.1). */
export const WorkspaceContextControl = forwardRef<
  WorkspaceContextControlHandle,
  WorkspaceContextControlProps
>(function WorkspaceContextControl(props, ref) {
  const labels = { ...EN, ...props.messages };
  const details = useRef<HTMLDetailsElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const reset = () => {
    setQuery("");
    props.onOpenChange?.(false);
  };
  useDismissablePicker(details, search, reset);
  useImperativeHandle(
    ref,
    () => ({
      open() {
        if (details.current && !details.current.open) details.current.open = true;
      },
    }),
    [],
  );

  if (props.mode === "not_applicable") return null;

  if (props.mode === "readonly")
    return (
      <span className="neon-workspace-context neon-workspace-context--readonly">
        {props.summary}
      </span>
    );

  if (props.status === "resolving")
    return (
      <span className="neon-workspace-context" role="status" aria-live="polite">
        {labels.loading}
      </span>
    );

  if (props.status === "error")
    return (
      <span className="neon-workspace-context neon-workspace-context--error">
        <span>{props.error ?? labels.loading}</span>
        {props.retry ? (
          <button type="button" onClick={props.retry}>
            {labels.retry}
          </button>
        ) : null}
      </span>
    );

  const organizations = props.organizations ?? [];
  const companies = props.companies ?? [];
  const normalized = query.trim().toLocaleLowerCase();
  const filteredOrganizations = organizations.filter(
    (organization) =>
      !normalized ||
      [organization.code, organization.displayName, ...organization.path].some(
        (candidate) => candidate.toLocaleLowerCase().includes(normalized),
      ),
  );
  const choose = (action: () => void) => {
    action();
  };

  return (
    <details
      ref={details}
      className="neon-workspace-context-picker"
      data-status={props.status}
      onToggle={(event) =>
        props.onOpenChange?.((event.currentTarget as HTMLDetailsElement).open)
      }
    >
      <summary aria-label={props.summary}>
        <strong>{props.summary}</strong>
      </summary>
      <div className="neon-workspace-context-picker__panel">
        {companies.length ? (
          <fieldset>
            <legend>{labels.company}</legend>
            <select
              aria-label={labels.company}
              value={props.pendingCompanyCodeId ?? ""}
              onChange={(event) =>
                props.onPendingChange({
                  companyCodeId: event.target.value || undefined,
                  operatingOrganizationId: undefined,
                })
              }
            >
              <option value="">{labels.chooseCompany}</option>
              {companies.map((company) => (
                <option key={company.companyCodeId} value={company.companyCodeId}>
                  {company.code} · {company.displayName}
                </option>
              ))}
            </select>
          </fieldset>
        ) : null}
        <fieldset>
          <legend>{labels.organization}</legend>
          <label>
            {labels.searchOrganizations}
            <input
              ref={search}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              autoComplete="off"
            />
          </label>
          <ul>
            {organizations.length > 1 ? (
              <li>
                <button
                  type="button"
                  aria-pressed={!props.pendingOperatingOrganizationId}
                  onClick={() =>
                    choose(() =>
                      props.onPendingChange({
                        companyCodeId: props.pendingCompanyCodeId,
                        operatingOrganizationId: undefined,
                      }),
                    )
                  }
                >
                  {!props.pendingOperatingOrganizationId ? (
                    <CheckIcon size={14} />
                  ) : null}
                  {labels.clearOrganization}
                </button>
              </li>
            ) : null}
            {filteredOrganizations.map((organization) => (
              <li key={organization.id}>
                <button
                  type="button"
                  aria-pressed={
                    props.pendingOperatingOrganizationId === organization.id
                  }
                  onClick={() =>
                    choose(() =>
                      props.onPendingChange({
                        companyCodeId: props.pendingCompanyCodeId,
                        operatingOrganizationId: organization.id,
                      }),
                    )
                  }
                >
                  {props.pendingOperatingOrganizationId === organization.id ? (
                    <CheckIcon size={14} />
                  ) : null}
                  <strong>{organization.displayName}</strong>
                  <span>
                    {organization.code} · {organization.path.join(" / ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
        <div className="neon-workspace-context-picker__footer">
          <button type="button" onClick={reset}>
            {labels.cancel}
          </button>
          <button type="button" disabled={props.busy} onClick={props.onApply}>
            {labels.apply}
          </button>
        </div>
      </div>
    </details>
  );
});

export function useWorkspaceContextSummary(input: {
  readonly companyLabel?: string;
  readonly organizationLabel?: string;
  readonly required?: boolean;
  readonly chooseCompanyLabel?: string;
  readonly chooseOrganizationLabel?: string;
  readonly messages?: Partial<WorkspaceContextControlMessages>;
}): string {
  const labels = { ...EN, ...input.messages };
  return useMemo(() => {
    if (input.companyLabel && input.organizationLabel)
      return `${labels.company}: ${input.companyLabel} · ${labels.organization}: ${input.organizationLabel}`;
    if (input.organizationLabel)
      return `${labels.organization}: ${input.organizationLabel}`;
    if (input.companyLabel) return `${labels.company}: ${input.companyLabel}`;
    return input.organizationLabel === undefined && input.required
      ? (input.chooseOrganizationLabel ?? labels.chooseOrganization)
      : (input.chooseCompanyLabel ?? labels.chooseCompany);
  }, [
    input.chooseCompanyLabel,
    input.chooseOrganizationLabel,
    input.companyLabel,
    input.organizationLabel,
    input.required,
    labels.chooseCompany,
    labels.chooseOrganization,
    labels.company,
    labels.organization,
  ]);
}
