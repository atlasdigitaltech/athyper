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

**Follow-up completed:** both browser fixtures now give esbuild a virtual output path, select emitted JavaScript explicitly, and inject emitted CSS alongside existing fixture styles. Production date-picker styles remain unchanged. The 360 fixture now uses the actual presentation configuration, current section response fields, primary-record IDs, seven tab labels and accessible section-selector name. Its scroll assertion waits for lazy content to settle and verifies clearance below the sticky tabs. The three selected Playwright tests pass. These are isolated fixtures, not a live authenticated application walkthrough.

**Task 2 started:** `BrowserApplicationProviders` in app-foundation now owns the previously duplicated browser query/API-client initialization. Neon, Mesh and Studio retain thin router adapters and their existing server bootstrap; Neon retains ShellRouteProvider. Provider nesting, CSRF handling, lifecycle callbacks and authentication destinations are preserved. App-foundation and all three apps passed typecheck; all nine query/provider lifecycle contract tests passed. Other task 2 items are still open.

**Task 2 continued:** shared `ApplicationLoading` and provider-independent `ApplicationFatalError` adapters now wrap the existing app-foundation boundaries and source plane identity from the brand catalog. All three apps use them for root loading, shell loading and framework fatal errors. Existing collapse-cookie handling and reload recovery remain intact. Startup-error consolidation remains open.

The shared shell now delegates its skip link and footer to `shell-chrome.tsx`, preserving `RecordFooterSource`. `use-shell-surfaces.ts` coordinates navigation, header panels and Recent/Favorites through one reducer: opening a surface replaces the previous one, and closing an inactive surface cannot dismiss another kind of surface. Opening Atlas dismisses these transient surfaces; Atlas pin/full-screen lifecycle and context-picker coordination remain to be extracted. Business routes, intake authorization, record/collection header ownership and Studio editor state were not changed.

**Validation for this increment:** app-foundation, shell and all three apps passed typecheck; 32 focused fallback, error-boundary, surface-state and query/provider tests passed. The three Business Partner browser tests still pass. The shared-shell fixture received the same CSS-preserving bundling correction. Its 14 tests produced 9 passes and 5 failures; all five also reproduced using the original `HEAD` shell client with the same corrected fixture. The temporary comparison fixture was removed. This is not a clean shell browser pass.

**Shell baseline cleanup completed:** all five browser failures are resolved. The fixture now includes the production UI drawer stylesheet and checks the current `/home` destination, Home-first navigation focus, static single-context display and compact phone branding. The activity-panel test uses a non-home route so its breadcrumb checks are meaningful. Production styling was preserved. The real Escape bug was in header actions: an inactive header listener cleared another surface and could restore focus to an old opener. Only an active search/agent panel now handles that listener. A regression test switches from search to navigation and Recent, then verifies Escape restores focus to the navigation trigger.

**Shell extraction continued:** `shell-chrome.tsx` owns GlobalAppBar and GlobalSidebar layout slots alongside the footer/skip link. Header actions and navigation/Recent/Favorites controls moved into `shell-header-actions.tsx` and `shell-navigation.tsx`; `shell-i18n.ts` holds their existing shared localization fallback. `shell-overlay-host.tsx` owns Recent/Favorites and Atlas rendering without introducing a positioning wrapper. Header-anchored search/activity panels, context selection, and Atlas state transitions still retain their existing owners; full overlay coordination is not claimed complete.

**Latest checks:** the 17 existing selected browser tests pass, plus the new Escape regression test (18 total). Shell and Neon/Mesh/Studio typechecks pass. The 32 focused fallback/surface/error/provider tests pass; 14 of 15 shared-shell navigation contracts pass after updating source checks for the extracted modules and formatting. The remaining Atlas-home source-text assertion expects `timeZone }).format(date)` while the unchanged implementation formats this across lines with a trailing comma; that broader test was already stale and is outside this shell increment. Neon Business Partner: 46 files / 225 tests passed. Studio Business Partner: 23 files / 78 tests passed. These are isolated tests, not a live authenticated application walkthrough.

**Startup/overlay increment completed:** all six root and authenticated-shell error routes now delegate to `ApplicationError` in app-foundation. The installed framework's `retry` refreshes server rendering; plain `reset` only clears error state, so recovery remains `retry` or document reload. Root errors retain one main landmark; content errors retain the surrounding shell. Provider-independent rendering and diagnostic redaction are covered.

`use-shell-surfaces.ts` now uses `shell-overlay-state.ts` to coordinate header actions, overflow, navigation, context-picker identity and Atlas presentation. A new transient surface dismisses unpinned Atlas; a pinned desktop dock can coexist. Expanding Atlas takes the transient channel, minimizing retains the prior pin preference, and compact presentation does not overwrite that preference. The same Atlas workspace and prompt draft survive expand/minimize. Tenant changes clear active surfaces; route changes dismiss transient surfaces while preserving a desktop dock. Context pickers use the shared controller when mounted inside the shell and retain their standalone behavior otherwise. Existing context discovery, switch authorization and business workflow callbacks remain in place.

`ShellSurfaceBoundary` adds local, redacted render recovery for Search, Activity, Recent/Favorites, context content and Atlas. Recovery does not remount page input. Atlas close returns focus to its opener; replacement by another surface no longer restores focus to an obsolete opener. Modal focus containment/background inertness still needs its separate final audit below.

Compact app-bar priority now keeps Search and Inbox directly available through 760px, moving Notifications and Atlas into labeled overflow. Below 361px Inbox is also in overflow. All four actions remain reachable there. `activity-counts.ts` distinguishes unavailable/loading/failed/partial/invalid totals from successful zero; header badges, activity tabs and pending filter counts no longer manufacture zero totals.

**Validation:** 22 selected browser tests passed, including Business Partner section/history baselines, context/header replacement, compact overflow, Atlas draft preservation and unknown/zero counts. All 37 focused fallback, retry, provider, overlay-state and local-recovery tests passed. Neon Business Partner (225 tests) and Studio Business Partner (78 tests) also passed again. Shell/app-foundation and all three app typechecks passed. Navigation/activity client contracts passed (17 tests) with the previously deferred Atlas-home source-text test excluded explicitly. An additional legacy JSDOM activity-interaction run was blocked by `React is not defined` in the existing `AtlasBrandIcon` under the tsx runner; the equivalent browser interactions pass. That runner issue and Atlas-home source-contract cleanup remain separate; no production icon/style workaround was added.

**Modal/preferences/footer audit completed:** `platform-ui/src/modal-isolation.ts` now provides a shared modal stack for dialogs/drawers, mobile navigation, mobile Quick Access, transient/expanded Atlas and local surface-error recovery. It contains keyboard/programmatic focus, excludes hidden/disabled controls, handles empty dialogs, makes background branches inert and locks document scrolling. Closing a nested modal restores its parent; closing the last modal restores prior inert flags and overflow. Portaled menus register with their owning modal and focus only after positioning. Closed mobile navigation is inert; desktop Quick Access and pinned Atlas remain nonmodal. Existing navigation/context labels remain attached to their controls.

Appearance and density continue to use the one shared app-foundation profile provider across all three apps; theme contracts pass. Shell preference reads/writes now tolerate denied storage, use the existing collapse cookie as fallback and avoid persisting automatic viewport adaptations. Recent/Favorites retain one implementation. Recent records authorized pathname entries without requiring the panel to open; query/tab changes do not create another visit. Cached items are filtered against current route access before display, and durable bookmarks without an authorized entity route are omitted. The local cache is now v2 and partitioned by plane, tenant and principal. Legacy v1 data is retained but not automatically imported because its plane is ambiguous; the new cache starts fresh. Record-level success/identity reporting belongs to the upcoming PageWorkspace runtime.

Footer registration now tags route scope and owner identity. Scope changes hide prior provenance without remounting children, revoked registrations clear it, and an old owner's cleanup cannot erase a newer registration. Mesh and Studio now use the same ShellRouteProvider as Neon. Existing app-foundation session/access boundary keys continue to reset scoped children on authenticated-context invalidation.

**Latest validation:** 29 browser checks passed (28 selected shell/footer/Business Partner checks plus the explicit-cookie fallback test). All 54 focused primitive/theme/fallback/provider/overlay/footer tests, 17 navigation/activity contracts and 303 Business Partner/Studio tests passed. UI, shell, app-foundation and all three apps passed typecheck. The deferred Atlas-home source-text test remains excluded; its separate cleanup and the legacy JSX runner issue were not folded into this work.

**PageWorkspace initial increment completed:** `platform-shell/src/page-workspace.tsx` composes the existing PageFrame/PageHeader and exposes header, navigation, status, toolbar, body, actions and action-outcome slots. It accepts an existing record header without creating another h1. PageLayout supplies content, sections-content and sections-content-overview variants; columns collapse using existing shell breakpoint conventions and spacing tokens, with no new scroll container. Slot content retains responsibility for semantic navigation and status/error announcements. This is composition, not a resource-state controller.

The generic EntityDetailRuntime now uses PageWorkspace for both loading and ready content. EntityPageLayout/useRecordPage registration is unchanged, including its existing post-mount effect timing. Specialized Business Partner detail/intake and Studio composition remain on their existing runtimes for incremental adoption; this does not claim their workspace migration is complete. No authorization, focus/history handlers or draft state were moved.

**Increment validation:** two new PageWorkspace browser tests pass for header handoff, retained input/focus/scroll during status/action updates, responsive column layouts and absence of nested scrolling. Three existing Business Partner browser tests pass for section layout, explicit navigation, deep links and history. Neon/Studio Business Partner suites pass (303 tests); shell, form-detail and all three apps pass typecheck. Header/intake foundation checks also pass. The initial browser assertion was adjusted to wait for the existing effect-based header registration before checking the single heading; production ownership timing was not changed.

**Next action:** incrementally adopt workspace slots in the existing collection/detail/intake/Studio compositions, preserving current header owners and navigation controllers. Centralize sticky offsets, then add resource/render recovery and successful-page identity/footer reporting. Keep authorized intake, one primary scroll root, explicit-focus/history behavior and Studio draft state intact.

### 2. Consolidate application startup and shell

- [x] Reuse existing app-foundation and plane shell adapters; avoid duplicate bootstrap requests.
- [x] Share root/shell loading and provider-independent fatal-fallback adapters.
- [x] Consolidate startup-error adapters using existing bootstrap behavior.
- [x] Extract shared app-bar/sidebar slots, navigation/header controls, footer and Recent/Atlas overlay rendering without changing business routes.
- [x] Finish header/context/Atlas overlay coordination, including active-surface recovery.
- [x] Fix active-surface Escape/close ownership, mobile action overflow and unknown badge states.
- [x] Audit modal focus containment/background inertness and remaining context labels.
- [x] Keep one shared preferences and Recent/Favorites implementation.
- [x] Keep footer record information page-owned and clear it when the page/context changes.

### 3. Build PageWorkspace

- [x] Compose existing PageFrame/PageHeader and preserve EntityPageLayout collection-versus-record ownership; initial integration in generic EntityDetailRuntime.
- [x] Add content, sections-content and sections-content-overview layouts with responsive columns; specialized workspace adoption remains incremental.
- [ ] Use the existing primary page scroll root and shared spacing tokens; centralize sticky offsets instead of adding another scroll container.
- [x] Add header/navigation/status/body/toolbar/action and action-outcome slots.
- [ ] Adopt slots in remaining specialized runtimes and add structured page information.
- [ ] Publish successful page identity/readiness for Recent and structured footer provenance.
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
