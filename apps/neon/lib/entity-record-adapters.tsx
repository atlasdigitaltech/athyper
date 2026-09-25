"use client";
import { useNeonWorkContext, useNeonOperatingOrganization } from "@athyper/product-neon-shell";
import { entityWorkContext } from "./entity-work-context";
import { resolveEntityRecordAdapter } from "@athyper/product-neon-entity-extensions";
import { EntityRecordPage } from "@athyper/platform-entity-form-detail/record";
export function EntityRecordRoute({ entityCode, recordId }: {
  readonly entityCode: string;
  readonly recordId: string;
}) {
  const work = useNeonWorkContext();
  const organizations = useNeonOperatingOrganization();
  const defaultResourceContext = entityWorkContext(work, organizations);
  const adapter = resolveEntityRecordAdapter(entityCode);
  if (!adapter) throw new Error("Entity record adapter is not registered");
  return <EntityRecordPage key={`${entityCode}:${recordId}`} adapter={adapter} recordId={recordId} defaultResourceContext={defaultResourceContext} />;
}
