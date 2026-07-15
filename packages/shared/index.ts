/**
 * Shared package discoverability boundary
 * ======================================
 *
 * This file serves as the shared package index used for
 * navigation during cleanups and package audits.
 */

import { sharedPackageCatalog, sharedPackageGroups, sharedPackageGroupMapVersion, SharedPackageGroup } from "./package-groups";
import {
  sharedBusinessGroups,
  SharedBusinessGroup,
  sharedPackageGroupAliases,
} from "./package-groups";

export {
  sharedPackageCatalog,
  sharedPackageGroups,
  sharedPackageGroupMapVersion,
  SharedPackageGroup,
  sharedBusinessGroups,
  SharedBusinessGroup,
  sharedPackageGroupAliases,
};

/** Canonical package group names for shared package maintenance and audits */
export const sharedPackageGroupBoundary = {
  generatedAtUtc: "2026-07-14T00:00:00.000Z",
  mapVersion: sharedPackageGroupMapVersion,
  source: "packages/shared/package-groups.ts",
  groups: sharedPackageGroups,
  businessGroups: sharedBusinessGroups,
  groupAliases: sharedPackageGroupAliases,
} as const;
