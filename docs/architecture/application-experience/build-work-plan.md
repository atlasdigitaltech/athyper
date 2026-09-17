# Shared Application Experience — Local Build Plan

Build and clean up the current local project. One developer, one local environment, frontend and backend developed together. No production rollout, owner assignment, release cohorts, feature flags, document versioning or replica work is required by this plan.

Use [System Design](system-design.md) for component behavior. Existing repository authorization and data-handling rules still apply; simplifying delivery does not remove business workflow checks.

## Working rules

- Reuse one Main/PageWorkspace and shared page-kind runtimes. Do not copy Business Partner layouts for new entities.
- Keep app routes thin; put reusable behavior in existing platform packages and specialized behavior in providers.
- One main landmark, one page h1, one primary page scroll surface.
- No entity-specific layout branches in generic components.
- Client-side visibility is not authorization. Keep server checks and context isolation.
- Keep visible keyboard focus and labels on icon buttons; mobile modal panels must open/close and return focus correctly.
- Preserve unrelated local edits. Make small changes, check the affected behavior, then continue.
- Do not delete old code merely because a text search finds no callers. Check routes, exports, registries, assets and package/build references first.

## Build tasks — roughly in this order

### 1. Inspect what exists

- [x] Identify the active Business Partner collection, detail/360, intake and Studio composition implementations.
- [x] Identify existing shared headers, section navigation, forms, loading/error components and duplicate CSS.
- [x] Record only the files being changed and their replacement; use a short working checklist, not a repository-wide governance inventory.
- [x] Check current local modifications before editing. Capture enough baseline behavior to recognize a regression.

**Inspection baseline (2026-09-17):** working tree was clean before this task; no inherited local edits needed preservation. No application code has been changed during inspection. The map below is the intended edit scope, not a deletion list.

| Active entry / implementation | Reuse or planned treatment |
| --- | --- |
| `apps/neon/app/(shell)/mdg/business-partner/layout.tsx` → `apps/neon/lib/entity-application-layout.tsx` → `packages/planes/neon/list-view/src/index.tsx` | Retain entityCode-driven application composition; adapt shared workspace chrome |
| Business Partner `page.tsx` / `manage/page.tsx` → `NeonEntityApplicationSection` | Overview and collection are already shared sections; do not replace with a new entity-local list |
| `partners/page.tsx` and `business-partners/[recordId]/page.tsx` | Existing redirect aliases; preserve URLs/query behavior, not duplicate pages |
| `[recordId]/page.tsx` → `BusinessPartnerRecord` in `packages/planes/neon/business-partner/src/index.tsx` | Validate ID; preserve existing `neon.business_partner.view_360` selection and aggregate fallback until both are understood |
| `packages/planes/neon/business-partner/src/360/business-partner-360.tsx` → shared `EntityRecord360Panel` | Retain authorized providers, URL state, tabs and section behavior; adapt geometry rather than rewrite domain sections |
| `new/page.tsx` → `AuthorizedNewBusinessPartnerRequest` → request entry / `NewBusinessPartnerRequest` | Preserve permission gating, request flow, draft values and governed submission |
| `packages/platform/entity/runtime/form-detail/src/{intake,intake-state,form-layout,section-navigation,record-360-panel,section-workspace}` | Reuse intake state and scroll navigation; consolidate layout wrappers around them |
| `apps/studio/app/(shell)/mdg/business-partner/{layout.tsx,module-navigation.tsx,workbench-context.tsx,model/page.tsx}` | Preserve draft context and module navigation; model route already wraps `BusinessPartnerInspection` in PageFrame |
| `packages/planes/studio/business-partner/src/{workbench,composition-workspace,composition-navigation,composition-editor,composition-review}.tsx` | Keep specialized editor behavior; extract only shared workspace orchestration |
| `packages/platform/shell/shell/src/{client,page-foundation,entity-page-layout,management-workspace,record-footer}.tsx` | Existing shared shell/header/record-ownership/footer foundation; first consolidation target |
| `apps/{neon,mesh,studio}/app` loading/error/provider/layout adapters and `packages/platform/shell/app-foundation/src/boundaries.tsx` | Inspect reuse before introducing another fallback implementation; existing AppErrorBoundary is an explicit error-presentation component, not by its name proof of render catching |

**CSS consolidation targets:** `packages/platform/foundation/ui/src/styles.css` currently owns both record-360 and section-workspace geometry. Record-360 derives sticky offsets from shell/tab variables, whereas section-workspace uses `top:8rem`. Shared navigation typography also lives here. Shell geometry is in `packages/platform/shell/shell/src/styles.css`; domain-specific styling remains in `packages/planes/neon/business-partner/src/styles.css` and `apps/studio/app/(shell)/mdg/business-partner/workbench.css`. These are overlapping responsibilities to consolidate, not evidence that whole files are redundant. Preserve record mobile selectors, overview reflow, Studio tables/editor overflow and shell document scrolling.

**Executed baseline checks:**

- `pnpm --filter @athyper/product-neon-business-partner test -- src/intake-runtime.test.tsx src/360/record-opening.test.tsx` — passed, **46 files / 225 tests**. The script invocation ran the full package suite rather than only the requested files.
- `pnpm --filter @athyper/product-studio-business-partner test -- src/composition-navigation.test.tsx src/composition-workspace.test.tsx` — passed, **23 files / 78 tests**; likewise ran the full package suite.
- `pnpm exec playwright test --config tooling/config/playwright.foundation.config.ts tests/foundation-browser/business-partner-section-layout.spec.ts tests/foundation-browser/business-partner-360-panel.spec.ts` — **blocked before browser execution**: esbuild cannot import `react-day-picker/src/style.css` from `packages/platform/foundation/ui/src/date-picker-calendar.tsx` without an output path. No browser or visual pass is claimed.

**Next action:** correct the two browser fixtures' CSS bundling setup while preserving actual styling, rerun this small baseline, then proceed to task 2. Do not hide the import failure by removing date-picker styles from production components. Preserve the source-verified baseline above: record versus collection header ownership, authorized intake entry, scroll selection/explicit focus, route aliases and Studio draft/editor state.

### 2. Consolidate application startup and shell

- [ ] Reuse existing app-foundation and plane shell adapters; avoid duplicate bootstrap requests.
- [ ] Share loading, startup error and provider-independent fatal fallbacks.
- [ ] Extract app bar, sidebar, footer and overlay coordination from the current shell without changing business routes.
- [ ] Fix mobile focus/close behavior, action overflow, context labels and unknown badge states.
- [ ] Keep one shared preferences and Recent/Favorites implementation.
- [ ] Keep footer record information page-owned and clear it when the page/context changes.

### 3. Build PageWorkspace

- [ ] Compose existing PageFrame/PageHeader and preserve EntityPageLayout collection-versus-record ownership.
- [ ] Add content, sections-content and sections-content-overview layouts.
- [ ] Use the existing primary page scroll root and shared spacing tokens; centralize sticky offsets instead of adding another scroll container.
- [ ] Add header/navigation/status/body/toolbar/action slots and structured page information.
- [ ] Reuse section navigation for explicit scroll or switch mode; preserve deep links and Back/Forward.
- [ ] Add shared loading/error/empty/denied states and independent section/panel recovery.
- [ ] Preserve input during refresh or failed save; disable dependent mutations when required content fails.

### 4. Define the shared entity runtime contract

- [ ] Use pageKind as the sole selector: collection, detail, create, edit, intake, review, configuration. No template field.
- [ ] Define common fields plus kind-specific requirements; keep layout/mode explicit in published definitions.
- [ ] Keep provider-specific settings under validated options and bind provider identifiers to local registered implementations.
- [ ] Put the canonical browser-safe definition/parser in the existing contract family; reuse it from frontend and backend. Do not manually mirror wire shapes.
- [ ] Reuse existing schema versions where compatible; use a distinct new contract when needed rather than silently changing an existing parser's meaning. Update local consumers together.
- [ ] Validate identifiers, references, options, page-kind/slot combinations and operations. Reject missing required providers; omit optional ones only when the task remains valid.
- [ ] Validate on the backend before publication and defensively at render time. Check the current plane's registered providers and applicable tenant capabilities; retain request authorization.
- [ ] Cover a few meaningful invalid definitions with tests, including an unknown required provider and a broken reference.

Generic layout/state work in task 3 can proceed without finalizing descriptor details. Finalize task 4's actual contract before wiring the resolver, provider bindings and publication parser to it. No formal decision register is needed.

### 5. Migrate Business Partner directly

- [ ] Adapt collection and detail/360 to PageWorkspace and the generic runtimes.
- [ ] Adapt intake while preserving steps, draft values, validation and governed submission. Submit is not necessarily direct record creation.
- [ ] Wrap Studio's specialized composition editor with reusable configuration navigation, dirty/save state and validation presentation. Do not assume the editor itself is generic.
- [ ] Keep specialized qualifications, duplicate checks and other domain logic in providers.
- [ ] Replace one experience at a time and check it locally. Do not mount old and new forms simultaneously.
- [ ] Preserve route/query behavior, permissions and existing business operations.

### 6. Prove reuse with another entity and Mesh

- [ ] Pick a second entity with different fields/relationships; only add page kinds it needs.
- [ ] Render ordinary sections through metadata and existing providers.
- [ ] Add one specialized provider if the entity needs it; do not force unnecessary custom code for a demonstration.
- [ ] Check a representative Mesh page with network-account context.
- [ ] Confirm there are no new copies of Main, headers, boundaries, scrolling or footer logic and no entity branches in the resolver.

Extension choice: metadata only → existing provider composition → specialized provider → custom content workspace. Use the smallest sufficient level; even custom workspaces retain shared page conventions.

### 7. Finish shared utilities and Knowledge as needed

- [ ] Reuse System/Light/Dark preferences across planes; add Compact density after spacing tokens are consistent.
- [ ] Share Language, Help and About controls. Show the actual app build/release information separately from record/metadata revisions.
- [ ] Start Knowledge with supported read-only Wiki/Documents browsing, authorized search, preview and links.
- [ ] Show filtered shared Recent/Favorites rather than introducing new stores.
- [ ] Add authoring/upload/Atlas integrations only when their backend capability is actually available.

### 8. Remove replaced code and finish

- [ ] Move reusable route-local code into the right existing package without mass renaming.
- [ ] Remove verified duplicate components, CSS, exports and unused dependencies after replacement works.
- [ ] Update affected imports, manifests, asset references and existing generated ownership data using its generator when necessary.
- [ ] Run relevant existing typechecks/tests and affected app builds.
- [ ] Update these documents to describe what was actually built and what remains unfinished.

## Lightweight verification

After each meaningful change, check the affected behavior rather than running an exhaustive release matrix:

- Load the page and try its normal task.
- Check a narrow window and keyboard navigation; use zoom when changing sticky geometry or text layout. Keep existing RTL support intact; a new exhaustive RTL matrix is not required.
- Exercise loading, one failure/retry, empty data where applicable, and a denied-access case when touching access integration.
- Check tab/section navigation, Back/Forward and unsaved input when changing those areas.
- For context changes, verify previous-context data disappears and footer information updates.
- Run affected package typechecks and existing relevant tests. Add tests for real regressions or new validation behavior, not every low-impact extraction.
- Use existing dependency and contract checks when touching those boundaries; do not introduce another enforcement framework for this cleanup.

Existing starting points include shared-shell/record-navigation browser tests, Business Partner section/360/intake/editor tests, policy boundary scripts and OpenAPI checks. Inspect their current setup before running them. No test result is implied by this list.

## Later, when deployment requires it

Keep three independently buildable apps and avoid hard-coded hostnames or new process-local authoritative state. Preserve existing session/storage integrations. Do not build replica caches, compatibility negotiation, cohort rollouts or cross-version release infrastructure now. Revisit them when moving beyond local development or supporting multiple independently deployed versions.

## Done for this local build

The Business Partner experiences and another entity use the shared foundation, Mesh can reuse it, the touched flows work locally, relevant checks pass, and replaced code is removed without losing domain behavior. Mark the task checkboxes as work is completed; no named-owner sign-off or document semver is required. Current checkboxes describe planned work, not completed implementation.
