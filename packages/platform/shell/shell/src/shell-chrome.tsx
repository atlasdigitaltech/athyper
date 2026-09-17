import React, { useRef } from "react";
import { useModalIsolation } from "@athyper/platform-ui";
import { RecordFooterSource } from "./record-footer";

export function SkipToContent({ label }: { readonly label: string }) {
  return (
    <a className="athyper-shell__skip" href="#main-content">
      {label}
    </a>
  );
}

/** Keep page provenance registration intact while extracting the global chrome. */
export function GlobalFooter() {
  return (
    <footer className="athyper-shell__footer">
      <span>© 2026 Atlas Digital Technology Solutions</span>
      <RecordFooterSource />
    </footer>
  );
}

/** Slots keep plane-specific identity and context out of shared layout ownership. */
export function GlobalAppBar(props: {
  readonly desktopBrand?: React.ReactNode;
  readonly navigationToggle: React.ReactNode;
  readonly mobileBrand: React.ReactNode;
  readonly businessContext: React.ReactNode;
  readonly actions: React.ReactNode;
}) {
  return (
    <header className="athyper-shell__topbar">
      {props.desktopBrand}
      {props.navigationToggle}
      {props.mobileBrand}
      {props.businessContext}
      {props.actions}
    </header>
  );
}

export function GlobalSidebar(props: {
  readonly open: boolean;
  readonly compact: boolean;
  readonly label: string;
  readonly brand: React.ReactNode;
  readonly controls: React.ReactNode;
  readonly navigation: React.ReactNode;
  readonly peek?: React.ReactNode;
  readonly quickAccess: React.ReactNode;
  readonly profile: React.ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  useModalIsolation(panel, props.compact && props.open, {
    outside: () =>
      Array.from(
        panel.current?.parentElement?.querySelectorAll<HTMLElement>(
          ":scope > .athyper-shell__scrim",
        ) ?? [],
      ),
    initialFocus: () =>
      panel.current?.querySelector<HTMLElement>(
        ".athyper-shell__navigation a",
      ) ?? null,
    restoreFocus: false,
  });
  return (
    <aside
      ref={panel}
      role={props.compact && props.open ? "dialog" : undefined}
      inert={props.compact && !props.open ? true : undefined}
      id="plane-navigation"
      className="athyper-shell__rail"
      aria-label={props.label}
      aria-modal={(props.compact && props.open) || undefined}
    >
      {props.brand}
      {props.controls}
      {props.navigation}
      {props.peek}
      {props.quickAccess}
      {props.profile}
    </aside>
  );
}
