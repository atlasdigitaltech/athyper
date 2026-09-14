import React, { type ReactNode } from "react";
export function ConfigSection({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="atlas-config__section">
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      <div>{children}</div>
    </section>
  );
}
export function ConfigRow({
  enabled,
  onEnabled,
  code,
  children,
}: {
  readonly enabled: boolean;
  readonly onEnabled: (enabled: boolean) => void;
  readonly code: string;
  readonly children: ReactNode;
}) {
  return (
    <label className="atlas-config__row">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => onEnabled(event.currentTarget.checked)}
      />
      <strong>{code}</strong>
      {children}
    </label>
  );
}
