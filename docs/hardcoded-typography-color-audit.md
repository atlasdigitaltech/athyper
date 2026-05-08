# Hardcoded Typography and Color Audit

Date: 2026-05-07

Scope reviewed:

- `apps/web`
- `packages/shared`
- `packages/domain/finance`
- File types: `*.ts`, `*.tsx`, `*.css`

Excluded from debt counts:

- `node_modules`
- generated typography CSS
- theme preset CSS and preset registry metadata
- canonical theme contract, typography token source, and Tailwind preset source

Those excluded files are the expected places for raw values to live.

## Cleanup Progress

All hardcoded-value cleanup phases from this audit are complete as of 2026-05-07.

Completed work:

- Added `scripts/policy/audit-style-tokens.ts`.
- Added `pnpm policy:style-tokens` and `pnpm policy:style-tokens:strict`.
- Expanded generated document typography utilities and added the auth display scale.
- Centralized modal, drawer, command, and context scrims behind shared theme utilities and UI overlay variants.
- Added named utilities for token-backed shadows, QR surfaces, media caption overlays, and OTP letter spacing.
- Removed ERD raw hex colors and tied viewer/export colors to theme variables.
- Replaced arbitrary pixel typography in scanned app/shared/domain surfaces with generated typography utilities or existing scale utilities.
- Removed remaining direct palette utility warnings by using semantic foreground/background tokens or named utilities.
- 2026-05-08 follow-up: restored distinct mono/serif font stacks, removed the parameters and Favorites panel arbitrary typography regressions, and re-verified style and typography policies.

Final audit summary:

| Rule | Current findings | Status |
| --- | ---: | --- |
| Raw hex color | 0 | Clean |
| Arbitrary color utility | 0 | Clean |
| Arbitrary pixel typography | 0 | Clean |
| Direct palette utility warnings | 0 | Clean |

Verification commands:

- `pnpm policy:style-tokens -- --quiet` - passed with 0 findings.
- `pnpm policy:style-tokens:strict -- --quiet` - passed with 0 findings.
- `pnpm --filter @athyper/theme --filter @athyper/ui --filter @athyper/workflow-ui --filter @athyper/entity-runtime --filter @athyper/collaboration-ui --filter @athyper/document-runtime run typecheck` - passed.
- `pnpm --filter @athyper/web run typecheck` - passed.
- `pnpm --filter @athyper/web run build` - passed.

Remaining design-system opportunity:

- Direct Tailwind typography utilities such as `text-xs`, `font-medium`, and `text-sm` remain common. They are tokenized Tailwind scale usage rather than dirty arbitrary values, so they are documented as a future component-standardization track rather than a blocking hardcoded-value cleanup item.

## Executive Summary

The baseline color debt was concentrated and cleanable. Outside theme token sources, there were 47 true hex color instances. Of those, 42 were in the ERD viewer/export page, 4 were Microsoft brand logo fills, and 1 was in a dev fixture. Palette utility drift was small: 20 direct Tailwind palette utilities such as `bg-black/50`, `text-white`, and `bg-white`.

The typography debt was broader. The baseline had 470 arbitrary typography utilities, dominated by `text-[10px]` at 373 matches, plus 4,086 direct Tailwind typography utilities such as `text-xs`, `font-medium`, `font-mono`, `uppercase`, and `tracking-wide`. The dirty arbitrary typography findings are now at 0. Not every direct utility is wrong, but the repo already has a semantic typography contract and can continue moving repeated component patterns toward that abstraction over time.

Primary cleanup theme: centralize color exceptions and move typography from scattered per-element values into shared primitives, generated token utilities, and component variants.

## Existing Token Surface

Color architecture already exists:

- `packages/shared/foundation/theme/src/theme-contract.ts` defines the required CSS custom property contract.
- `packages/shared/foundation/theme/src/tailwind-preset.ts` maps semantic Tailwind colors to CSS variables such as `--background`, `--foreground`, `--primary`, `--success`, `--warning`, `--info`, and categorical colors.
- `packages/shared/foundation/theme/src/semanticColors.ts` maps generic intents to semantic Tailwind classes.
- `packages/shared/foundation/theme/src/recordBadge.ts` maps record badge taxonomy to existing badge variants.
- `packages/domain/finance/finance-workbench/src/lib/statusColors.ts` centralizes finance document status text classes.

Typography architecture also exists:

- `packages/shared/foundation/theme/src/typography.ts` owns font families, type scale, document typography, generated Tailwind font-size values, and semantic `t` classes.
- `packages/shared/foundation/theme/src/typography.generated.css` exposes `text-doc-label`, `text-doc-support`, and `text-doc-subtitle`.
- `packages/shared/foundation/theme/src/base.css` defines `.section-label`.

Baseline gaps addressed by cleanup:

- Common micro text now has generated aliases for the dirty arbitrary values found in the scan.
- Shared scrim/overlay utilities and UI overlay variants now replace repeated `bg-black/*` overlays.
- ERD graph colors are now tied to theme variables and computed theme colors for SVG export.
- The semantic `t` object and direct Tailwind typography patterns remain a broader component-standardization opportunity, not a dirty hardcoded-value finding.

## Scan Results

| Category | Matches | Main locations or values | Classification |
| --- | ---: | --- | --- |
| Intentional preset color values | 1,254 | `packages/shared/foundation/theme/src/presets/**` | Not debt |
| True hex color instances outside token files | 47 | 42 in ERD page, 4 in Microsoft logo, 1 dev fixture | P1 with allowlisted exceptions |
| Tailwind palette color utilities | 20 | `bg-black/50`, `bg-black/20`, `text-white`, `bg-white` | P2 |
| Tailwind arbitrary color utilities | 5 | 3 raw `bg-[#...]`, 2 token-backed shadow values | P2 |
| CSS/color functions outside token files | 4 lines | ERD gradients, minimap rgba, shell `color-mix` helper | P2 |
| Arbitrary typography utilities | 470 | `text-[10px]` 373, `text-[11px]` 51, `text-[9px]` 37 | P1 |
| Direct Tailwind typography utilities | 4,086 | `text-xs`, `font-medium`, `text-sm`, `font-mono`, `font-semibold` | P2 |
| Token-backed arbitrary font-size classes | 20+ lines | workflow UI uses `[font-size:var(--doc-...)]` | P3, should be normalized |

## Color Findings

### P1: ERD viewer carries nearly all raw hex color debt

File: `apps/web/app/(shell)/(admin)/setup/metadata/erd/page.tsx`

Examples:

- Lines 115-117: relation colors use `#3b82f6`, `#16a34a`, `#9333ea`.
- Lines 240-244: export class fills use fixed blue, green, yellow, gray, purple palettes.
- Lines 314-337: SVG export hardcodes text/background fills.
- Lines 398-411: legend uses raw hex and hardcoded repeating gradients.
- Lines 504-535: ReactFlow canvas, background dots, minimap colors, and mask are fixed light-mode values.

Risk:

- Theme presets and dark mode do not control ERD graph colors.
- SVG export bakes in a light palette and cannot represent the current theme.
- Relation kind and entity class colors are duplicated across ReactFlow rendering, legend, minimap, and SVG export.

Cleanup:

- Introduce an ERD color resolver that maps relation/entity classes to existing semantic tokens:
  - `belongs_to` -> `--info` or `--categorical-1`
  - `has_many` -> `--success`
  - `m2m` -> `--categorical-4`
  - fallback -> `--muted-foreground`
- For SVG export, read computed CSS variables at export time and embed the resolved values, so exported files still stand alone.
- Replace fixed canvas values with `bg-background`, `bg-card`, `border-border`, `text-muted-foreground`, and token-derived minimap colors.

### P2: Overlay and scrim colors are scattered as `bg-black/*`

Examples:

- `packages/shared/ui/ui/src/primitives/AlertDialog.tsx`
- `packages/shared/ui/ui/src/primitives/Dialog.tsx`
- `packages/shared/ui/ui/src/primitives/Sheet.tsx`
- `packages/shared/ui/ui/src/primitives/DrawerShell.tsx`
- `packages/shared/ui/ui/src/composites/CommandPaletteBase.tsx`
- `apps/web/components/shell/SessionExpiredDialog.tsx`
- `apps/web/components/settings/shared.tsx`
- `packages/shared/runtime/entity-runtime/src/list/*Drawer.tsx`

Risk:

- Different overlays use `20`, `25`, `40`, `45`, and `50` opacity by convention rather than API.
- Future theme presets cannot tune scrim behavior centrally.

Cleanup:

- Add shared overlay variants, for example `overlayScrimVariants({ tone: "modal" | "drawer" | "soft" })`.
- Replace all direct `bg-black/*` overlays with the shared primitive or exported class constants.
- Keep one token source for the actual scrim value. If adding `--overlay` to the theme contract is too heavy, use a shared utility based on existing foreground/background variables.

### P3: Legitimate color exceptions should be allowlisted

Keep these, but document them:

- `apps/web/components/auth/SocialLoginButtons.tsx` lines 30-33: Microsoft logo brand colors.
- `apps/web/app/(shell)/(admin)/setup/doc-services/page.tsx` line 465: brand palette swatches are data-driven.
- `apps/web/app/(shell)/(admin)/setup/governance/[id]/page.tsx` uses `--category-color` from data.
- Theme preset CSS and preset metadata are canonical token sources.
- SVG or logo source files may need literal brand colors.

## Typography Findings

### P1: Arbitrary micro typography is widespread

Top arbitrary typography values:

| Value | Matches | Recommended replacement |
| --- | ---: | --- |
| `text-[10px]` | 373 | `text-doc-support`, `text-doc-badge`, or `Badge size="sm"` |
| `text-[11px]` | 51 | Add/use `text-doc-action` or a UI meta token |
| `text-[9px]` | 37 | Avoid where possible; otherwise add `text-doc-micro` |
| `text-[2.2rem]` | 3 | Add an auth/display heading token if this is intentional |
| `leading-[1.15]` | 3 | Pair with the display token |
| `text-[0.85em]` | 2 | Keep only for rich-text code rendering or move to rich-text CSS |

Top files by arbitrary typography count:

- `packages/shared/runtime/collaboration-ui/src/activity/ActivityFeed.tsx` - 25
- `apps/web/app/(shell)/(admin)/setup/users/page.tsx` - 22
- `apps/web/app/(shell)/(admin)/setup/policies/page.tsx` - 20
- `packages/shared/runtime/entity-runtime/src/panels/AttachmentsPanel.tsx` - 19
- `apps/web/app/(shell)/(admin)/setup/groups/page.tsx` - 15
- `apps/web/app/(shell)/(admin)/setup/jobs/orchestrations/page.tsx` - 12
- `apps/web/app/(shell)/(admin)/metadata-studio/page.tsx` - 11
- `apps/web/app/(shell)/(admin)/setup/metadata/descriptor/page.tsx` - 11

Risk:

- Micro type becomes inconsistent across admin, collaboration, runtime panels, badges, and tables.
- Density and accessibility tuning cannot happen centrally.
- Designers and engineers cannot tell whether 9px, 10px, 10.5px, and 11px represent distinct semantics or local patching.

Cleanup:

- Expand `documentTypography` or add a `uiTypography` group in `typography.ts` for common micro roles:
  - `micro`: very small machine/status metadata
  - `badge`: compact badge text
  - `meta`: secondary row metadata
  - `action`: compact action labels
  - `tableHeader`: uppercase table labels
- Generate utilities for all of the above instead of requiring `[font-size:var(...)]`.
- Replace per-call badge overrides with `Badge` size variants.

### P2: Direct Tailwind typography is the dominant pattern

Top direct utility values:

- `text-xs` - 1,841
- `font-medium` - 884
- `text-sm` - 731
- `font-mono` - 537
- `font-semibold` - 438
- `text-2xs` - 348
- `uppercase` - 232
- `text-doc-support` - 178
- `tracking-wide` - 109
- `leading-none` - 75

Top files by direct typography count:

- `apps/web/app/(shell)/(admin)/setup/doc-services/page.tsx` - 197
- `packages/shared/runtime/document-runtime/src/items/LineEditorSheet.tsx` - 168
- `packages/domain/finance/finance-workbench/src/views/ApWorkbenchView.tsx` - 138
- `packages/domain/finance/finance-workbench/src/views/ArWorkbenchView.tsx` - 132
- `apps/web/app/(shell)/(admin)/setup/policies/page.tsx` - 125
- `apps/web/app/(shell)/(core)/settings/_sections/identity-section.tsx` - 122
- `packages/shared/runtime/entity-runtime/src/panels/AttachmentsPanel.tsx` - 114
- `packages/shared/runtime/document-runtime/src/items/LinesGrid.tsx` - 89
- `packages/shared/runtime/document-runtime/src/items/JournalLinesGrid.tsx` - 84
- `packages/shared/runtime/entity-runtime/src/list/EntityListPage.tsx` - 82

Risk:

- This makes typography consistent only by habit.
- The semantic `t` contract exists but does not shape most feature code.
- Feature pages repeat local table, badge, metadata, and section-label styling.

Cleanup:

- Do not attempt a single mechanical rewrite of all 4,086 utilities.
- Start at shared primitives and repeated layout components:
  - `Badge`
  - `Button`
  - shared `DataTable`
  - `PageFrame`/`PageHeader`
  - admin section cards
  - runtime list/table rows
  - collaboration activity and attachment components
- Once primitives carry the right type tokens, most feature pages can delete class overrides instead of swapping one class for another.

### P3: Token-backed arbitrary font-size classes should become generated utilities

Files:

- `packages/shared/runtime/workflow-ui/src/approval/ApprovalPanel.tsx`
- `packages/shared/runtime/workflow-ui/src/lifecycle/StatusTooltip.tsx`
- `packages/shared/runtime/workflow-ui/src/events/WorkflowEventTrail.tsx`

These use token-backed classes such as `[font-size:var(--doc-support-size)]`, so the value is not dirty. The class syntax is still noisy and should be replaced with generated aliases like `text-doc-support`, `text-doc-badge`, and `text-doc-field-value`.

## Completed Cleanup Plan

### Phase 1: Guardrails and allowlist - complete

Added a style-token audit script with these blocking/warning rules:

- Block raw hex colors outside an allowlist.
- Block `bg-[#...]`, `text-[#...]`, `border-[#...]`, `fill-[#...]`, `stroke-[#...]` outside token/demo allowlists.
- Block `text-[9px]`, `text-[10px]`, `text-[10.5px]`, `text-[11px]`, and similar arbitrary pixel typography outside allowlisted rich-text or SVG/export contexts.
- Warn on direct palette utilities such as `bg-black/*`, `bg-white`, and `text-white`.

Active allowlist:

- `packages/shared/foundation/theme/src/presets/**`
- `packages/shared/foundation/theme/src/typography.ts`
- `packages/shared/foundation/theme/src/typography.generated.css`
- vendor/logo source files
- generated SVG/export helpers where values are computed from CSS variables
- data-driven color swatches that render validated tenant/admin data

### Phase 2: Color cleanup - complete

1. Refactor the ERD viewer color system.
2. Add shared overlay/scrim variants.
3. Replace scattered `bg-black/*` overlays with the shared overlay primitive.
4. Leave vendor logo and data-driven color swatches in the allowlist.

### Phase 3: Typography token expansion - complete

1. Add missing generated typography classes for badge, field value, action, and micro text.
2. Update `Badge` so `sm` no longer hardcodes `text-[10px]`.
3. Add or standardize shared table header, meta text, stat value, and compact action text patterns.
4. Replace token-backed `[font-size:var(--doc-...)]` usages with generated aliases.

### Phase 4: Hotspot migration - complete for dirty hardcoded values

Migrated dirty hardcoded values across these component families:

1. Shared primitives and overlays.
2. Collaboration activity/attachment surfaces.
3. Entity runtime panels and list drawers.
4. Admin setup pages.
5. Document runtime item grids.
6. Finance workbench views.

### Phase 5: Verification - complete

Acceptance criteria status:

- Zero raw hex colors outside the documented allowlist.
- Zero raw `bg-[#...]`/`text-[#...]` color utilities outside dev/demo allowlists.
- Zero arbitrary pixel typography in shared primitives.
- No direct `bg-black/*` overlay classes outside the overlay primitive.
- Existing pages still pass build/typecheck.
- Theme visual smoke remains recommended before merge for high-traffic pages, but no static hardcoded-value findings remain.

## Completed Patch Set

The highest-value first patch set was completed:

1. Add generated typography aliases for `doc-badge`, `doc-field-value`, and `doc-action`.
2. Update `Badge` `sm` to use `text-doc-badge`.
3. Add shared overlay classes/variants to UI primitives.
4. Replace overlay colors in `AlertDialog`, `Dialog`, `Sheet`, `DrawerShell`, and `CommandPaletteBase`.
5. Refactor ERD color maps to semantic CSS variables.
6. Add the audit script with the initial allowlist in warning mode.

Feature pages can continue migrating repeated direct Tailwind typography patterns into shared component variants without changing the hardcoded-value audit status.
