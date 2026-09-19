"use client";

import React, { useEffect, useRef } from "react";
import { Building2Icon } from "@athyper/platform-icons";
import { announceOverlayOpened, overlayOpenedEvent } from "@athyper/platform-ui";

export interface ListScopeOption {
  readonly value: string;
  readonly label: string;
}

export interface ListScopeControlProps {
  readonly id: string;
  readonly label: string;
  readonly value?: string;
  readonly options: readonly ListScopeOption[];
  readonly status: "loading" | "ready" | "error";
  readonly loadingLabel: string;
  readonly emptyLabel: string;
  readonly selectLabel: string;
  readonly summaryLabel: string;
  readonly summaryDetails?: readonly string[];
  readonly accessLabel?: string;
  readonly onChange: (value: string | undefined) => void;
}

/** Shared, access-aware scope selector used by every plane list adapter. */
export function ListScopeControl(props: ListScopeControlProps) {
  const summary = useRef<HTMLDetailsElement>(null);
  const selected = props.options.find((option) => option.value === props.value);
  useEffect(() => {
    const detailsElement = summary.current;
    const dismissOutside = (event: Event) => {
      const details = summary.current;
      if (details?.open && event.target && !details.contains(event.target as Node)) details.open = false;
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      const details = summary.current;
      if (event.key !== "Escape" || !details?.open) return;
      event.preventDefault();
      details.open = false;
      details.querySelector<HTMLElement>("summary")?.focus();
    };
    const dismissForAnotherOverlay = (event: Event) => {
      const details = summary.current;
      if (details?.open && (event as CustomEvent<Element>).detail !== details) details.open = false;
    };
    const announceWhenOpened = () => {
      const details = summary.current;
      if (details?.open) announceOverlayOpened(details);
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("click", dismissOutside, true);
    document.addEventListener("focusin", dismissOutside, true);
    document.addEventListener("keydown", dismissWithEscape);
    document.addEventListener(overlayOpenedEvent, dismissForAnotherOverlay);
    detailsElement?.addEventListener("toggle", announceWhenOpened);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("click", dismissOutside, true);
      document.removeEventListener("focusin", dismissOutside, true);
      document.removeEventListener("keydown", dismissWithEscape);
      document.removeEventListener(overlayOpenedEvent, dismissForAnotherOverlay);
      detailsElement?.removeEventListener("toggle", announceWhenOpened);
    };
  }, []);

  if (props.options.length === 1 && selected) {
    return (
      <details ref={summary} className="a-entity-list__scope-summary">
        <summary aria-label={props.summaryLabel} title={props.label}><Building2Icon size={17}/></summary>
        <div className="a-entity-list__scope-popover">
          <strong>Authorized context</strong>
          {props.summaryDetails?.map((detail) => <small key={detail}>{detail}</small>)}
          <span><strong>{props.label}:</strong> {selected.label}</span>
          {props.accessLabel ? <small>{props.accessLabel}</small> : null}
        </div>
      </details>
    );
  }

  const placeholder = props.status === "loading"
    ? props.loadingLabel
    : props.options.length
      ? props.selectLabel
      : props.emptyLabel;

  return (
    <div className="a-entity-list__scope">
      <span className="a-visually-hidden">Authorized</span>
      <span className="a-entity-list__scope-icon" aria-hidden="true"><Building2Icon size={17}/></span>
      <label htmlFor={props.id}><strong>{props.label}</strong></label>
      <select
        id={props.id}
        value={props.value ?? ""}
        disabled={props.status !== "ready" || !props.options.length}
        onChange={(event) => props.onChange(event.currentTarget.value || undefined)}
      >
        <option value="">{placeholder}</option>
        {props.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}
