"use client";
import type { ReactNode } from "react";
import type { EntitySectionComponentV1 } from "@athyper/contract-platform-entity-runtime";

/** Components receive the admitted field renderer, not raw records, fetch clients
 * or mutation capabilities. Presentation cannot widen authorization. */
export function RegisteredEntitySection({ component, fields, renderField }: {
  readonly component: EntitySectionComponentV1;
  readonly fields: readonly string[];
  readonly renderField: (field: string) => ReactNode;
}) {
  const roles = new Map(Object.entries(component.bindings).map(([role, field]) => [field, role]));
  return <div className="a-entity-address-fields" data-section-component={component.rendererKey}>
    {fields.map(field => <div key={field} data-address-role={roles.get(field)}>{renderField(field)}</div>)}
  </div>;
}
