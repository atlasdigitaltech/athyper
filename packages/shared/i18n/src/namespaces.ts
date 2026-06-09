/**
 * @athyper/i18n — Translation Namespaces
 *
 * Each module has its own translation namespace file:
 *   lang/en/common.json       — shared UI strings
 *   lang/en/acc.json          — Finance (Core Accounting) strings
 *   lang/en/buy.json          — Buying strings
 *   etc.
 *
 * Namespace keys are lowercase module codes.
 * The "common" namespace is always loaded; module namespaces are loaded on demand.
 */

/** The common namespace — always loaded at startup. */
export const COMMON_NAMESPACE = "common" as const;

/**
 * All module translation namespaces.
 * Lowercase of the module code from athyper_Modules.txt.
 */
export const MODULE_NAMESPACES = [
  // Platform
  "fnd", "meta", "iam", "aud", "pol", "wfl", "job", "doc", "ntf", "int", "cms", "act", "rel",
  // Finance
  "acc", "pay", "treasury", "budget", "payg",
  // Supply Chain
  "srm", "source", "contract", "buy", "inventory", "qms", "subcon", "demand", "wms", "logistics",
  // Customer
  "crm", "sale",
  // People
  "hr", "payroll",
  // Projects
  "prjcost", "itsm",
  // Manufacturing
  "maint", "mfg",
  // Assets
  "asset", "assetrems", "assetfm",
] as const;

export type ModuleNamespace = (typeof MODULE_NAMESPACES)[number];
export type Namespace = typeof COMMON_NAMESPACE | ModuleNamespace;

/** All namespaces including common. */
export const ALL_NAMESPACES: readonly Namespace[] = [COMMON_NAMESPACE, ...MODULE_NAMESPACES];
