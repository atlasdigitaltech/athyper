import type { FinancePermissionChecker } from "@athyper/server-contract-finance";

/** Uses only the immutable authorization snapshot supplied by the trusted transport adapter. */
export const snapshotFinancePermissionChecker: FinancePermissionChecker = {
  async isAllowed(actor, permissionCode) {
    return actor.permissionCodes?.includes(permissionCode) === true;
  },
};
