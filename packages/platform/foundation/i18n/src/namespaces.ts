/**
 * @athyper/platform-i18n — Translation Namespaces
 *
 * Each module has its own translation namespace file under lang/{locale}/dashboard/:
 *   lang/en/common.json                    — shared UI strings (always loaded)
 *   lang/en/dashboard/_widgets.json        — dashboard widget strings (always loaded)
 *   lang/en/dashboard/acc.json             — Finance (Core Accounting) strings
 *   lang/en/dashboard/buy.json             — Buying strings
 *   etc.
 *
 * Namespace keys are lowercase module codes.
 * The "common" namespace is always loaded; module namespaces are loaded on demand
 * via loadModuleMessages().
 */

/** The common namespace — always loaded at startup. */
export const COMMON_NAMESPACE = "common" as const;

/**
 * All module translation namespaces.
 * Lowercase of the module code. Maps to lang/{locale}/dashboard/{code}.json.
 */
export const MODULE_NAMESPACES = [
  // ── Athyper Platform ────────────────────────────────────────────
  "fnd", "ref", "core",
  "meta",
  "iam", "onb",
  "aud",
  "pol", "wfl",
  "job", "int",
  "doc", "cms",
  "ntf", "act",
  "sub", "ent", "usg",
  "obs", "err", "sre", "ana",
  "aip", "agt", "knw", "aig",
  "ext", "dev",
  "ops", "sec", "sea",
  "rel",

  // ── Neon — Finance ──────────────────────────────────────────────
  "acc", "pay", "treasury", "budget", "payg",

  // ── Neon — Supply Chain ─────────────────────────────────────────
  "srm", "source", "contract", "buy", "inventory", "qms", "subcon", "demand", "wms", "logistics",

  // ── Neon — Customer ─────────────────────────────────────────────
  "crm", "sale",

  // ── Neon — People ───────────────────────────────────────────────
  "hr", "payroll",

  // ── Neon — Projects & Services ──────────────────────────────────
  "prjcost", "itsm",

  // ── Neon — Manufacturing ────────────────────────────────────────
  "maint", "mfg",

  // ── Neon — Assets & Facilities ──────────────────────────────────
  "asset", "assetrems", "assetfm",

  // ── Mesh — Partner Network ──────────────────────────────────────
  "pcon", "omi", "imo", "ccon", "soo", "sii", "logx",
] as const;

export type ModuleNamespace = (typeof MODULE_NAMESPACES)[number];
export type Namespace = typeof COMMON_NAMESPACE | ModuleNamespace;

/** All namespaces including common. */
export const ALL_NAMESPACES: readonly Namespace[] = [COMMON_NAMESPACE, ...MODULE_NAMESPACES];
