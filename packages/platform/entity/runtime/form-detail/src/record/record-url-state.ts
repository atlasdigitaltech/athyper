import { isEntityRuntimeKey, isEntityRuntimeUuid } from "@athyper/contract-platform-entity-runtime";
import type { EntityRuntimeResourceContext } from "@athyper/platform-entity-descriptor-client";
import { isCollaborationRequested } from "../collaboration-route";

export function readSection(
  sectionForTab?: (tab: string) => string | undefined,
): string | undefined {
  if (typeof window === "undefined") return undefined;
  const query = new URLSearchParams(window.location.search);
  const value = query.get("section");
  if (isEntityRuntimeKey(value)) return value;
  const tab = query.get("tab");
  return tab ? sectionForTab?.(tab) : undefined;
}
export function readCollaborationFull(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(max-width:1100px)").matches ||
    new URLSearchParams(window.location.search).get("collaborationMode") !== "side";
}
export function readCollaborationOpen(): boolean {
  if (typeof window === "undefined") return false;
  return isCollaborationRequested(window.location.search);
}
export function readCollaborationSection(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const value = new URLSearchParams(window.location.search).get(
    "collaborationSection",
  );
  return isEntityRuntimeKey(value)
    ? value
    : undefined;
}
export function readResourceContext():
  EntityRuntimeResourceContext | undefined {
  if (typeof window === "undefined") return undefined;
  const query = new URLSearchParams(window.location.search);
  const uuid = (key: string) => {
    const value = query.get(key);
    return isEntityRuntimeUuid(value)
      ? value
      : undefined;
  };
  const asOf = query.get("asOf");
  const roleLens = query.get("roleLens");
  const value: EntityRuntimeResourceContext = {
    ...(uuid("operatingOrganizationId")
      ? { operatingOrganizationId: uuid("operatingOrganizationId")! }
      : {}),
    ...(uuid("companyCodeId") ? { companyCodeId: uuid("companyCodeId")! } : {}),
    ...(uuid("legalEntityId") ? { legalEntityId: uuid("legalEntityId")! } : {}),
    ...(asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? { asOf } : {}),
    ...(isEntityRuntimeKey(roleLens)
      ? { roleLens }
      : {}),
  };
  return Object.keys(value).length ? value : undefined;
}
export function resourceContextKey(
  value?: EntityRuntimeResourceContext,
): string {
  return value ? JSON.stringify(value) : "unscoped";
}
