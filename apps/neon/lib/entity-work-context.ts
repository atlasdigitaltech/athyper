/** Adapt the already-authorized shell catalog; this never grants record access. */
export function entityWorkContext(work: {
  status: string; switching: boolean;
  selection: { mode: string; companyCodeId?: string; legalEntityId?: string };
  legalEntityId?: string;
}, organizations: {
  status: string;
  organizations: readonly { id: string; companyAssignments: readonly { companyCodeId: string }[] }[];
}) {
  if (work.status !== "ready" || work.switching) return undefined;
  const legalEntityId = work.selection.legalEntityId ?? work.legalEntityId;
  if (!legalEntityId) return undefined;
  const companyCodeId = work.selection.mode === "company" ? work.selection.companyCodeId : undefined;
  const compatible = companyCodeId && organizations.status === "ready"
    ? organizations.organizations.filter(o => o.companyAssignments.some(a => a.companyCodeId === companyCodeId))
    : [];
  const ids = [...new Set(compatible.map(o => o.id))];
  return {
    legalEntityId,
    ...(companyCodeId ? { companyCodeId } : {}),
    ...(ids.length === 1 ? { operatingOrganizationId: ids[0]! } : {}),
  };
}
