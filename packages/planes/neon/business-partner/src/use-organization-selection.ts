import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useNeonOperatingOrganization,
  useNeonWorkContext,
} from "@athyper/product-neon-shell";
import { useContextDepartureGuard } from "@athyper/platform-shell";

/** Keep selection within the authorized catalog and the active company context. */
export function useOrganizationSelection(requestScope?: {
  operatingOrganizationId: string;
  companyCodeId?: string;
}) {
  const operating = useNeonOperatingOrganization();
  const work = useNeonWorkContext();
  const company =
    work.selection.mode === "company" ? work.selection : undefined;
  const companyCodeId = requestScope
    ? requestScope.companyCodeId
    : company?.companyCodeId;
  const compatible = useMemo(
    () =>
      operating.organizations.filter(
        (item) =>
          !companyCodeId ||
          item.companyAssignments.some(
            (assignment) => assignment.companyCodeId === companyCodeId,
          ),
      ),
    [operating.organizations, companyCodeId],
  );
  const requestedOrganizationId = requestScope?.operatingOrganizationId;
  const [selected, setSelected] = useState(requestedOrganizationId ?? "");
  useEffect(() => {
    setSelected((current) =>
      compatible.some((item) => item.id === current)
        ? current
        : requestedOrganizationId !== undefined
          ? compatible.some((item) => item.id === requestedOrganizationId)
            ? requestedOrganizationId
            : ""
          : compatible.length === 1
            ? compatible[0]!.id
            : "",
    );
  }, [compatible, requestedOrganizationId]);

  // Pending/Apply layer for the shared workspace-scope nav-band control (design
  // doc §10.1-10.2). `selected`/`setSelected` above stay live-commit for callers
  // that need a synchronous default (e.g. OrganizationField).
  const [pendingOperatingOrganizationId, setPendingOperatingOrganizationId] =
    useState<string>();
  const beginEdit = useCallback(
    () => setPendingOperatingOrganizationId((current) => current ?? selected),
    [selected],
  );
  const updatePending = useCallback(
    (organizationId: string) => setPendingOperatingOrganizationId(organizationId),
    [],
  );
  const discardPending = useCallback(
    () => setPendingOperatingOrganizationId(undefined),
    [],
  );
  const applyPending = useCallback(() => {
    if (pendingOperatingOrganizationId === undefined) return false;
    if (
      pendingOperatingOrganizationId &&
      !compatible.some((item) => item.id === pendingOperatingOrganizationId)
    )
      return false;
    setSelected(pendingOperatingOrganizationId);
    setPendingOperatingOrganizationId(undefined);
    return true;
  }, [pendingOperatingOrganizationId, compatible]);
  useContextDepartureGuard({
    dirty:
      pendingOperatingOrganizationId !== undefined &&
      pendingOperatingOrganizationId !== selected,
    busy: false,
  });

  return {
    operating,
    company,
    companyCodeId,
    compatible,
    selected,
    setSelected,
    pendingOperatingOrganizationId,
    beginEdit,
    updatePending,
    discardPending,
    applyPending,
  };
}
