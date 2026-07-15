/**
 * AP Feature Flags
 *
 * Centralized read of env-driven booleans that gate behavior during phased
 * rollouts. Default policy is fail-closed (false) — flags exist to enable
 * specific compatibility / transition paths, not to hide finished features.
 *
 * Adding a flag here keeps the read site shallow (`if (apFeatureFlags.X)`)
 * and lets parity verifiers (server/scripts/*) snapshot the active set.
 */

function readBool(envName: string, defaultValue = false): boolean {
  const raw = process.env[envName];
  if (raw == null) return defaultValue;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export interface ApFeatureFlags {
  /**
   * WS-COMPAT — preserve a non-zero `withholding_tax_amount` on a PI line
   * when the line has no `withholding_tax_group_id` AND no `pricing_component`
   * row of `term_type='withholding'` AND a pre-existing flat WHT value > 0.
   *
   * Off (default): pure PC-driven — flat WHT is overwritten by 0 whenever
   *   the computation yields 0. The PC layer is the only writer.
   *
   * On: legacy mode used during the cutover window after the WHT-as-PC
   *   refactor lands. Once `verify-wht-backfill-complete.ts` reports zero
   *   un-backfilled lines, flip this back off.
   *
   * Env var: ATHYPER_AP_WHT_LEGACY_FALLBACK
   */
  whtLegacyFallback: boolean;

  /**
   * WS-DEFERRAL-UX — feature gate that surfaces WHT add/edit affordances
   * (Add Withholding CTA, drawer, editable rows). Defaults off so the
   * client-side UI ships dark until WS-B server validation is in CI green.
   *
   * Env var: ATHYPER_AP_WHT_PC_ENABLED
   */
  whtPcEnabled: boolean;

  /**
   * WS-DEFERRAL-UX — gates the legacy "Override WHT Amount" affordance
   * (permission ap.override_wht_amount). Defaults off — capture WHT via
   * PC rows in v1; override workflow ships separately.
   *
   * Env var: ATHYPER_AP_WHT_OVERRIDE_ENABLED
   */
  whtOverrideEnabled: boolean;
}

export const apFeatureFlags: ApFeatureFlags = Object.freeze({
  whtLegacyFallback:  readBool("ATHYPER_AP_WHT_LEGACY_FALLBACK"),
  whtPcEnabled:       readBool("ATHYPER_AP_WHT_PC_ENABLED"),
  whtOverrideEnabled: readBool("ATHYPER_AP_WHT_OVERRIDE_ENABLED"),
});
