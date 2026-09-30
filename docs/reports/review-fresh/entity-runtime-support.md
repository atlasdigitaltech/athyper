# Fresh review — Entity-runtime contracts, descriptor client and shared foundation UI

Area: `packages/contracts/platform/entity-runtime/src/**`, `packages/platform/entity/runtime/{cascade,content-ui,workflow-ui}/src/**`,
`packages/platform/foundation/{ui,api-client,i18n}/src/**`, `packages/platform/shell/app-foundation/src/**`,
`apps/*/lib/{experience-runtime.tsx,catalog-routes.ts,entity-record-adapters.tsx,entity-route-alias.ts,entity-route-context.ts,list-density.ts,redirect-entity-record.ts,entity-application-layout.tsx,entity-application-route.tsx}`,
plus the explicitly-named descriptor client (`packages/platform/entity/runtime/descriptor-client/src/**`).

Read-only review. Nothing outside this file was modified. All line numbers were re-verified against the working tree at review time.
No file from `docs/reports/review/` or `docs/reports/country-route-comprehensive-review-*` was read.

Reference route under discussion: `/app/entity/country/` → `apps/*/app/(shell)/app/entity/[entityCode]/[[...segments]]/page.tsx`
→ `packages/platform/entity/runtime/form-detail/src/routes/entity-read-route.tsx`
→ `packages/contracts/platform/entity-runtime/src/routes/entity-read-route.ts`.

---

## Findings

### 1. HIGH — the shared related-record contract hard-codes the owner entity `business_partner`

`packages/contracts/platform/entity-runtime/src/related-presentation.ts:538-547`

```ts
/** Related adapters are registered for an owner entity; metadata cannot invent joins. */
export function validateRelatedPresentationOwner(
  profiles: readonly RelatedPresentationV1[],
  entityCode: string,
) {
  if (profiles.length && entityCode !== "business_partner")
    throw new TypeError(
      `No related record providers registered for ${entityCode}`,
    );
}
```

Every relationship name in the same file is also baked to one owner (`related-presentation.ts:77,88,109`):

```ts
    relationship: "business_partner.external_reference",
    relationship: "business_partner.contact_person",
    relationship: "business_partner.address_link",
```

Why it is wrong: this is a *shared contract* package whose stated job is to serve every entity; it instead encodes one entity code and one entity's relationship names as the only legal value. The gate is enforced at publication:
`server/packages/platform/metadata/src/descriptor-parser.ts:67` calls `validateRelatedPresentationOwner(recordPresentation.related, row.entity_code)`.

Consequence on the Country route: today Country publishes no `recordPresentation.related`, so the Country list/detail is unaffected. The moment Country (or any second entity) declares a related projection such as a country→currency or country→address profile, publication/parse fails with `No related record providers registered for country`, and the shared related-record UI (`related-entity-section.tsx`, `RelatedPresentationV1`) can never be reached by that entity. Related-record profiles are therefore permanently single-entity in a framework that claims to be generic, and the entity identity lives in code rather than in `metadata/products/**`.

Fix: make owners a registered, data-driven set. Either (a) accept an owner→source registry injected by the server (`{ ownerEntityCode, source, relationshipKeys }`) and validate `profiles` against it, or (b) accept the owner's declared `entityRelationships` as the authority. Move the `business_partner.*` relationship strings, the field catalogue and the section keys into `metadata/.../country/definition.json`-style entity artifacts so a second entity can onboard without editing this contract.

---

### 2. MEDIUM — the shared error surface hard-codes every user-visible message

`packages/platform/shell/app-foundation/src/error-taxonomy.ts:51-67`

```ts
  if (facts.status === 401 || facts.transportKind === "authentication") return model("authentication", "Sign in required", "Your session is no longer available. Sign in again to continue.", "login", false, false, common);
  if ((facts.status === 403 && REQUIRED_ACTION_CODES.has(facts.code ?? "")) || requiredActions.length > 0) return model("required-action", "Action required", "Complete the required identity action before continuing.", "complete-action", false, true, common);
  if (facts.status === 403 || facts.transportKind === "authorization") return model("permission-denied", "Access denied", "You do not have permission to view this resource.", "none", false, false, common);
  if (facts.status === 404 && facts.code === "ENTITY_DESCRIPTOR_NOT_FOUND") return model("service-unavailable", `${input.applicationName?.trim() || "This entity"} is not configured for this workspace`, "An administrator needs to publish and activate the entity configuration for this workspace. This does not mean the business records are missing.", "none", false, false, common);
  if (facts.status === 404 || facts.transportKind === "not-found") return model("not-found", "Record not found", "This record does not exist, or it may have been moved or removed. Check the link or return to the workspace.", "none", false, false, common);
```

`packages/platform/shell/app-foundation/src/boundaries.tsx:47,55,72-75,110,112,114-115` adds the surrounding chrome:

```tsx
export function ErrorSurface({ model, reset, applicationName = "Athyper", ...
      <div role="alert" aria-live="assertive" aria-atomic="true" className="a-visually-hidden">An error needs your attention.</div>
  if (model.action === "login") return <ActionLink variant="primary" href={safeLoginLocation("/")}>Sign in</ActionLink>;
  if (model.action === "select-context") return <ActionLink variant="primary" href="/select-context">Choose context</ActionLink>;
  return <section className="a-empty-state" aria-labelledby="empty-state-title"><h2 id="empty-state-title">{title}</h2><p>{description}</p>{action}</section>;
```

Why it is wrong: `AppErrorBoundary`/`ErrorSurface` are the single recovery surface for all three apps and never consult the governed locale. `classifyAppError` is pure and already returns a stable `kind` (`AppErrorKind`) and `requestId`; only the copy is hard-coded. The repo only enforces locale wiring in the app layouts and the locale registry (`tooling/scripts/policy/verify-i18n-foundation.mjs:7-33`), so nothing catches this.

Consequence on the Country route: a denied Country read renders "Access denied" / "You do not have permission to view this resource."; a missing country record renders "Record not found"; an unpublished Country descriptor renders "This entity is not configured for this workspace" — all in English for every locale the platform enables (`en, ar, ms, zh-Hans, hi, ta, fr, de`, `i18n/src/index.ts:4`).

Fix: keep the classification in `error-taxonomy.ts` but return message **ids plus params** (e.g. `{ kind, messageKey: "error.notFound.title", values: {} }`) and resolve through the shared `IntlRuntime` in `ErrorSurface`. Add the keys to a shared shell/foundation catalog (alongside `entityEnglishMessages`) with ms/ar translations, matching the existing `entity.*` fallback pattern.

---

### 3. MEDIUM — the shared DatePicker ignores the governed locale and `weekStart`

`packages/platform/foundation/ui/src/date-picker-calendar.tsx:64`

```tsx
  const monthName = new Intl.DateTimeFormat("en", { month: "long" }).format(
    month,
  );
```

`packages/platform/foundation/ui/src/date-picker-calendar.tsx:281-303`

```tsx
                      : new Intl.DateTimeFormat("en", { month: "long" }).format(
                          candidate,
                        );
  ...
                        : new Intl.DateTimeFormat("en", {
                            month: "short",
                          }).format(candidate)}
```

`packages/platform/foundation/ui/src/date-picker-calendar.tsx:187-207` renders `DayPicker` with no `weekStartsOn` and no `locale`:

```tsx
            <DayPicker
              mode="single"
              required
              autoFocus
              selected={selected}
              month={month}
              onMonthChange={setMonth}
              hideNavigation
```

Why it is wrong: `react-day-picker@9.14.0` resolves the week start as `props.weekStartsOn ?? locale?.options?.weekStartsOn ?? 0`
(`node_modules/.pnpm/react-day-picker@9.14.0_react@19.2.8/node_modules/react-day-picker/dist/cjs/noonDateLib.js:13-16`), i.e. Sunday when neither is supplied. The platform's own governed default is Monday: `EffectiveLocalization.weekStart` is populated as `weekStart = validDay(input.weekStart) ? input.weekStart : 1`
(`packages/platform/foundation/i18n/src/index.ts:47,150`) and `activity-date-range.ts:1` documents "Weeks start Monday". A repo-wide grep for `weekStart` shows it is parsed and stored but **never read by any UI** — only `i18n/src/index.ts` and `api-client/src/bootstrap.ts` mention it.

Consequence on the Country route: every date control reachable from the Country list/detail (filter editor dates, detail date fields, submission dates) renders an English month grid with a Sunday-first week regardless of the tenant/principal locale and the governed `weekStart`/`formatLocale` — e.g. an `ar` or `ms` tenant sees `January` and a week beginning Sunday. The same file also hard-codes `"Back to calendar"` (`:314`), `"Today"` (`:326`) and `"Clear"` (`:330`), and `date-picker.tsx:29,169` hard-codes `"Choose date"` and `"Loading calendar…"`.

Fix: read `useOptionalI18n()?.localization` inside `DatePicker`/`DatePickerCalendar` and pass `locale={localization.formatLocale}` plus `weekStartsOn={localization.weekStart}` to `DayPicker`, use `Intl.DateTimeFormat(localization.formatLocale, …)` for month captions, and add message keys for `chooseDate`, `backToCalendar`, `today`, `clear`, `loadingCalendar` to the shared catalog.

---

### 4. MEDIUM — `validateIntakeSurface` returns literal English while its own module contract mandates message keys

`packages/contracts/platform/entity-runtime/src/intake-surface.ts:517-526`

```ts
        if (answers[f.key] && !values[f.key])
          return [
            [
              f.key,
              "This selection is no longer available. Choose another option.",
            ],
          ];
        return f.required && !values[f.key]
          ? [[f.key, `Select ${f.label.toLowerCase()}.`]]
          : [];
```

The sibling module states the opposite rule in its header (`packages/contracts/platform/entity-runtime/src/validation-messages.ts:1`):

```ts
/** Message keys only: metadata never supplies executable validation or templates. */
```

and `EntityIntakeSurfaceV1.validationMessages` is typed as `ValidationMessages` (keys), not text (`intake-surface.ts:48`).

Why it is wrong: the shared validator composes user-facing sentences from an entity-supplied label and a hard-coded English template, so it cannot be localized through the `IntlRuntime` at all, and it violates the key-only rule the rest of the intake contract follows (`validateDataInput` correctly returns `{ code, messageKey, params }`).

Consequence on the Country route: Country publishes no intake surfaces, so the route is unaffected today. Every entity that does (e.g. business-partner requests) renders these two strings verbatim: `packages/platform/entity/runtime/form-detail/src/intake-surface.tsx:126,163` feeds `validateIntakeSurface(...)` straight into `errors[field.key]`.

Fix: return `FieldValidationIssue`-shaped values (`{ fieldPath, code: "option" | "required", messageKey, params: { field: f.label } }`), reuse `validation.option` / `validation.required` from `entityEnglishMessages`, and let the existing `useValidationMessage` renderer localize them.

---

### 5. MEDIUM — the shared list-toolbar primitives hard-code English on every entity list, including Country

`packages/platform/foundation/ui/src/applied-filters.tsx:61-62,98,102`

```tsx
    <section className="a-applied-filters" aria-label="Applied filters">
      <span className="a-applied-filters__label">Applied filters</span>
  ...
            {expanded ? "Show less" : `Show all (${chips.length})`}
  ...
        <button type="button" onClick={onClear}>
          Clear all
        </button>
```

plus the per-chip label at `:78`:

```tsx
              aria-label={chip.removeLabel ?? `Remove ${chip.label} filter`}
```

`packages/platform/foundation/ui/src/view-selector.tsx:113-116`

```tsx
        aria-label="Select view"
      >
        View: {name}
        {modified ? " (modified)" : ""}
```

Why it is wrong: both components are rendered unconditionally by the shared list view — `packages/platform/entity/runtime/list-view/src/index.tsx:2158` (`<AppliedFilters chips={appliedChips} …>`) and `:1933` (`<ViewSelector … name={activeView?.name ?? "System default"}>`). The `ViewSelector` component already receives a `name` but not the surrounding chrome, and `AppliedFilterChip` has a `removeLabel` escape hatch for accessibility only. There is no message contract for these strings, so a host cannot localize them.

Consequence on the Country route: as soon as a Country filter is applied, the Country list shows an "Applied filters" bar with "Clear all" / "Show all (N)" / "Show less" in English, and the toolbar reads `View: <name> (modified)`, in all locales.

Fix: add an optional `messages?: { appliedFilters, showAll, showLess, clearAll, removeChip, selectView, modified }` prop (defaulting to the existing English so no caller breaks) and pass `entityRuntimeMessages`/`entity.reference.*`-style catalog keys from the list view. Add the new keys to `packages/platform/foundation/i18n/src/catalogs/entity-runtime.ts` for en/ms/ar.

---

### 6. MEDIUM — `SearchableSelectMessages` has no keys for three user-visible strings it renders

`packages/platform/foundation/ui/src/searchable-select.tsx:19-29` defines the whole message contract:

```ts
export interface SearchableSelectMessages {
  readonly search: string;
  readonly recent: string;
  readonly all: string;
  readonly results: string;
  readonly empty: string;
  readonly unavailable: string;
  readonly required: string;
  readonly clear: string;
  readonly clearRecent?: string;
}
```

but the component renders three more strings from literals:

`searchable-select.tsx:233`

```tsx
      setDirectory((current) => ({ ...current, loading: false, error: cause instanceof Error ? cause.message : "Lookup unavailable" }));
```

`searchable-select.tsx:612,621`

```tsx
                  Load more
  ...
              {directory.loading || directory.error ? (
                <p className="a-reference-select__empty" role="status">{directory.loading ? "Loading…" : directory.error}</p>
```

Why it is wrong: every caller localizes the eight declared keys (e.g. `packages/platform/entity/runtime/form-detail/src/reference-select.tsx:224-232` maps all of them to `entity.reference.*`), which proves the intent; the three undeclared strings bypass that pipeline. `":233"` also interpolates a raw `Error.message` into a rendered status line, and `"Load more"` is the only control for paging a shared reference directory.

Consequence on the Country route: Country has no reference-typed fields today, but any Country field/filter that resolves a shared reference directory (source-key lookups are the shared path) shows "Load more"/"Loading…" in English next to otherwise-localized chrome.

Fix: add `loadMore: string`, `loading: string` (and `unavailableReason?: string`) to `SearchableSelectMessages`; map them in `reference-select.tsx` to new `entity.reference.loadMore` / `entity.reference.loading` catalog keys; stop rendering `cause.message` directly (log it and render the localized `unavailable` text).

---

### 7. MEDIUM — Neon entity routing/entity catalogue is hand-written app code, not metadata (and the generator hard-codes `entities: []`)

`apps/neon/lib/catalog-routes.ts:8-70` overlays entity codes, slugs and English display names for `bp`/`org`/`buy` inside the app:

```ts
const entityRoutes: Readonly<
  Record<
    string,
    Readonly<
      Pick<
        CatalogWorkspaceRoute["modules"][number],
        "defaultEntityCode" | "entities"
      >
    >
  >
> = Object.freeze({
  bp: {
    defaultEntityCode: "business_partner",
    entities: [
      {
        code: "business_partner",
        routeSlug: "business-partners",
        name: "Business Partners",
      },
```

`apps/neon/lib/catalog-routes.ts:126-141` adds a second, bespoke per-entity table:

```ts
const entityApplicationRoutes: readonly NeonEntityApplicationRoute[] = Object.freeze([
  Object.freeze({
    publicPath: "/mdg/business-partner/manage",
    publicAliases: Object.freeze([
      "/mdg/business-partner",
      "/mdg/business-partner/partners",
      "/mdg/business-partner/business-partners",
    ]),
    internalPath: "/app/entity/business_partner/manage",
    workspaceCode: "mdg",
    moduleCode: "bp",
    entityCode: "business_partner",
    surfaceKey: "manage",
  }),
]);
```

and `apps/neon/lib/entity-application-layout.tsx:17` + `apps/neon/lib/tenant-workspace-route.ts:2-4` hard-code the same entity twice more:

```tsx
  if (entityCode === "business_partner" && isTenantWorkspaceRoute(pathname)) return <>{children}</>;
```

```ts
export function isTenantWorkspaceRoute(pathname: string): boolean {
  return pathname === "/mdg/business-partner/register";
}
```

Root cause: the shared catalog generator emits an empty entity list for every module — `tooling/scripts/catalog/generate-platform-catalog.mjs:111`
```ts
    modules: workspace.modules.map((module) => ({ code: module.code, routeSlug: module.routeSlug, name: module.name, ...(module.iconKey ? { iconKey: module.iconKey } : {}), entities: [] })),
```
so each app must hand-author the entity overlay.

Why it is wrong: `AGENTS.md` requires entity-specific configuration to live in metadata. Entity codes, route slugs, display names, workspace/module binding and per-entity route special cases live in `apps/neon/lib/*`, so onboarding an entity means editing Neon source, and the same facts can drift from `metadata/products/**/entities/<code>/definition.json` (which already carries `moduleCode`, `title.labelKey`/`defaultText` and `entityCode`).

Consequence on the Country route: Country is served by the shared page in all three apps, but it appears in **no** entity overlay (`entityRoutes` lists only business_partner/currency/purchase_order/…), so Neon's workspace/module navigation and `entityApplicationPublicPath` cannot link to it. Adding a Country navigation entry or a public alias today requires editing `catalog-routes.ts`; the `business_partner` literals in `entity-application-layout.tsx`/`tenant-workspace-route.ts` are unrelated hard-coded entity assumptions in the same layer.

Fix: generate `entities` (code, routeSlug, labelKey/defaultText, defaultEntityCode) in `generate-platform-catalog.mjs` from published metadata, delete the three app-level `entityRoutes` overlays, and replace the two `business_partner` literals with metadata flags (e.g. `presentation.tenantWorkspaceEntryPoint`) resolved by the shared layout.

---

### 8. MEDIUM — plane experience runtimes are drifted copies that carry hard-coded entity permissions and routes

`apps/mesh/lib/experience-runtime.tsx` and `apps/studio/lib/experience-runtime.tsx` are 293 lines each and differ only by renamed symbols and plane strings (md5 `84ed590aa89d2247b732ecf644f18427` vs `e26f0846bd3c023e631bce478df1b813`); `apps/neon/lib/experience-runtime.tsx` is a third 372-line variant (md5 `6d8940fe9cc66d4ad372dcf0a198851b`). Diff excerpt:

```
-import { meshCatalogRoutes } from "@/lib/catalog-routes";
+import { studioCatalogRoutes } from "@/lib/catalog-routes";
-    "mesh.atlas-welcome": AtlasWelcome,
+    "studio.atlas-welcome": AtlasWelcome,
-  fallback = defaultExperienceSurface(surfaceKey, "mesh"),
+  fallback = defaultExperienceSurface(surfaceKey, "studio"),
```

The Neon copy additionally hard-codes entity routes, English copy and an entity permission:

`apps/neon/lib/experience-runtime.tsx:25-32`

```tsx
  citationRoutes: {
    business_partner: entityRecordRouteTemplate("business_partner"),
    business_partner_request: "/mdg/business-partner/requests/{recordId}",
  },
  suggestions: [
    "Review my priorities",
    "Plan today’s work",
    "Review pending approvals",
```

`apps/neon/lib/experience-runtime.tsx:226-228`

```tsx
  const canBrowsePartners =
    navigation.some((workspace) =>
      workspace.modules.some((module) => module.code === "bp"),
    ) && permissions.has("neon.relationship.business_partner.read");
```

Why it is wrong: the three plane adapters were supposed to be thin plane bindings of one shared experience runtime (`packages/platform/shell/dashboard`), but the render/notice/home logic is copy-pasted, so a fix to one plane's surface resolution (fallback, badge handling, access-unavailable copy) must be repeated three times and will silently drift. The Neon copy also encodes one entity's permission code and business-partner paths in app code, against the metadata rule.

Consequence on the Country route: the entity read page itself is shared and unaffected, but the surrounding workspace/module surface that renders around Country in Neon only knows business-partner shortcuts, and any shared-experience fix applied to mesh/studio must be re-applied to Neon or the Country navigation will differ per plane.

Fix: extract the duplicated `WorkspaceExperience`/`ResolvedSurface`/`homeProps`/notice components into `packages/platform/shell/dashboard` parameterised by plane, leaving each `apps/*/lib/experience-runtime.tsx` as a ~40-line binding (registry extensions, icons, assets). Replace the hard-coded citation routes and permission code with registry/metadata lookups (`registry.references`, descriptor `actions`/`requiredPermissions`).

---

### 9. LOW — session-expiry warnings are hard-coded English and are rendered by every plane

`packages/platform/shell/app-foundation/src/index.tsx:257` (single line, excerpted):

```tsx
const id = push(target.kind === "idle" ? { tone: "warning", title: "Inactive session ending soon", detail: `You'll be signed out at ${time} due to inactivity. Continue working to keep your session active.` } : { tone: "warning", title: "Maximum session duration ending soon", detail: `Your session reaches its security limit at ${time}. Continuing to work will not extend it. Save your work and sign in again.` });
```

Why it is wrong: `SessionExpiryWarning` is mounted inside `AppFoundationProviders` for all three apps (index.tsx:130) and pushes security-relevant toasts. The time is formatted with `toLocaleTimeString([], …)` (browser locale) while the copy is English-only, so the message is mixed-locale.

Consequence on the Country route: while a user is reading a Country list or record, an expiry warning appears in English for every locale.

Fix: add `session.expiry.idle.title/detail` and `session.expiry.absolute.title/detail` keys to the shared catalog and resolve them through `useOptionalI18n()` (the shell `IntlProvider` already provides `fallbackMessages`, `verify-i18n-foundation.mjs:20`).

---

### 10. LOW — shared design-system chrome hard-codes accessibility and loading labels

`packages/platform/foundation/ui/src/index.tsx`:

```tsx
183:    {!pinned ? <button type="button" className="a-dialog-scrim" aria-label="Close panel" onClick={() => dialog.setOpen(false)}/> : null}
192:  return <header {...props} ... >{description ? <p id={drawer.descriptionId}>{description}</p> : <span id={drawer.descriptionId} className="a-visually-hidden">{typeof title === "string" ? `${title} panel` : "Drawer panel"}</span>}</span>
221:...<button type="button" className="a-dialog-scrim" aria-label={`Close ${drawer ? "panel" : "dialog"}`} ...
225:export function ToastRegion(props: HTMLAttributes<HTMLDivElement>) { return <div role="region" aria-label="Notifications" ... />
230:export function Skeleton({ label = "Loading", ...props }...
231:export function LoadingDots({ label = "Loading", ...
243: ...{value ? <Button variant="ghost" size="small" aria-label="Clear search" ...>Clear</Button> : <kbd aria-hidden="true">/</kbd>}</div>;
```

plus `packages/platform/shell/app-foundation/src/toasts.tsx:456,529`:

```tsx
        aria-label="Action notifications"
        aria-label="Dismiss notification"
```

Why it is wrong: these are the defaults every shared feature inherits (`DrawerHeader.closeLabel = "Close panel"`, `PanelHeader.actionsLabel = "Panel actions"`, `date-picker.tsx:29` `calendarLabel = "Choose date"`, `company-groups.tsx:78,84`), so localizing a feature means overriding each default instead of relying on the catalog. Callers can override most of them, which lowers the severity.

Consequence on the Country route: the Country list/detail drawer, view menu and loading states expose English accessible names ("Close panel", "Notifications", "Loading", "Clear search") to screen readers in every locale.

Fix: add a shared `UiMessages` contract with defaults sourced from the i18n catalog (`useOptionalI18n().message`), and default each prop to the localized value instead of a literal.

---

### 11. LOW — company/organization pickers hard-code English, including plural counts

`packages/platform/foundation/ui/src/company-groups.tsx:58,62-65,78,84,154,200,242`

```tsx
            All
            aria-label={`${selectedCount} selected · ${availableCount} available`}
            <b>{selectedCount}</b> selected · {availableCount}
  allLabel = "All permitted companies",
  searchLabel = "Search company name or code",
            {matches.length} companies · {groups.size} legal entities
                    Legal entity · {legal.legalEntityCode.toUpperCase()}
        <p role="status">No permitted companies match your search.</p>
```

`packages/platform/entity/runtime/list-view/src/directory-filters.tsx:59,109`

```tsx
        <p role="alert">Access is unavailable. Reload the page to retry.</p>
              <p role="status">No permitted organizations match your search.</p>
```

Why it is wrong: the count strings are grammatical English (with no plural rules) and the labels are not part of any message contract; `CompanyGroups` is a shared cross-plane primitive (`packages/planes/neon/shell/src/index.tsx:874` and list-view `directory-filters.tsx:115`).

Consequence on the Country route: only reachable if a Country descriptor declares `scope.filterKinds` of `company`/`organization` (`DirectoryFilterEditor` is rendered from `directory-filters.tsx`); with the current Country scope it is not shown, so impact is limited to eligible entities.

Fix: accept a messages object (`all`, `selectedCount`, `companyCount`, `legalEntity`, `noMatches`, `searchPlaceholder`) and pass ICU plural messages (`{count, plural, …}`) resolved through `IntlRuntime` — the shared catalog already uses this pattern (`list.notice.favouritesAdded`, `catalogs/entity-runtime.ts:7`).

---

### 12. LOW (dead code) — `ContextSelectionDrawer` is exported but has no importer

`packages/platform/foundation/ui/src/context-selection-drawer.tsx:30,39` define `ContextChoice`/`ContextSelectionDrawer`; the only other reference in the repository is the package barrel `packages/platform/foundation/ui/src/index.tsx:249`:

```tsx
export { ContextSelectionDrawer, type ContextChoice } from "./context-selection-drawer";
```

A repo-wide grep for `ContextSelectionDrawer|ContextChoice` returns only those three lines, so the 291-line component (with a further set of hard-coded strings: "Refresh list", "Version categories", "Search available versions…", "Loading available versions…", "Open version", "Details") is unreachable.

Consequence on the Country route: none. Fix: delete the module and its barrel export, or wire it to the feature that was supposed to use it; do not leave it exported as a second drawer implementation next to `DrawerPanel`.

---

### 13. LOW (dead code) — `entityIntakeOperationClient` has no importer

`packages/platform/entity/runtime/descriptor-client/src/intake-operation-client.ts:17`

```ts
export const entityIntakeOperationClient = Object.freeze({
```

The package barrel re-exports it (`descriptor-client/src/index.ts:21` `export * from "./intake-operation-client";`), but a repo-wide grep for `entityIntakeOperationClient` finds only the definition. The server side is live (`server/packages/platform/experience/src/entity-intake-operation-routes.ts:59` parses the same response), so the browser wrapper — including its idempotency/`If-Match` wiring — is unused.

Consequence on the Country route: none (Country has no intake flows), but any entity whose intake is submitted from the browser has no wired client path, and the dead wrapper will rot out of sync with the route contract.

Fix: either use it from the intake workspace or delete it, and keep `parseEntityIntakeOperationResponse` as the single contract.

---

### 14. LOW (dead code + drift) — two different "entity runtime bootstrap" contracts; the shared one is unvalidated

Shared contract (`packages/contracts/platform/entity-runtime/src/runtime-resource.ts:50-57,96`):

```ts
export interface EntityRuntimeBootstrapV1 {
  readonly schema: "athyper.entity-runtime-bootstrap/1";
  readonly entityCode: string;
  readonly surfaceKey: string;
  readonly release: EntityRuntimeReleasePinV1;
  readonly resources: readonly EntityRuntimeResourceV1[];
  readonly actions: readonly EntityRuntimeActionV1[];
}
...
export function parseEntityRuntimeBootstrap(
```

The live client uses a different shape and its own parser (`packages/platform/entity/runtime/descriptor-client/src/runtime-client.ts:71-76,202`):

```ts
export interface EntityRuntimeBootstrapResource {
  readonly releaseId: string;
  readonly releaseHash: string;
  readonly plan: EntityRuntimePagePlan;
  readonly header: EntityRuntimeHeaderResource;
}
...
function parseBootstrap(value: unknown): EntityRuntimeBootstrapResource {
```

`parseEntityRuntimeBootstrap` has zero callers (grep across the repo); the type is referenced only by an optional, unimplemented port (`server/packages/contracts/metadata/src/ports.ts:7-13`, "Optional until the entity-runtime routes are introduced").

Why it is wrong: the contract package advertises `athyper.entity-runtime-bootstrap/1` as the browser bootstrap boundary, but nothing validates that shape, while the shape actually served (`runtime-client.ts:129`) is validated elsewhere. Two contracts with the same name and different fields is exactly the drift this review was asked to find, and a future implementer of the optional port will satisfy the wrong interface.

Consequence on the Country route: none today (detail rendering uses `EntityRuntimeBootstrapResource`), but the shared contract's bootstrap validation cannot be relied on if the optional port is implemented.

Fix: delete `EntityRuntimeBootstrapV1`/`parseEntityRuntimeBootstrap` (and the port) or re-express `EntityRuntimeBootstrapResource` in terms of the shared contract and move `parseBootstrap` into the contract package so both layers parse one shape.

---

### 15. LOW (duplication) — three divergent record-id/entity-code validators

`packages/contracts/platform/entity-runtime/src/validation/record-id.ts:4-5`

```ts
const recordIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

`apps/neon/lib/route-params.ts:1-2`

```ts
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

`packages/contracts/platform/entity-runtime/src/governed-workflow.ts:164-165` uses a third, stricter variant that also pins version/variant:

```ts
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
```

Why it is wrong: `apps/neon/lib/redirect-entity-record.ts:12` imports the app-local `isEntityId` rather than the shared `isEntityRecordId`, so the legacy redirect and the shared canonical route can disagree about which record ids are acceptable; the shared comment in `record-id.ts:1-3` explicitly states the syntax must be shared "so both layers accept exactly the same values".

Consequence on the Country route: `/country/<id>` is served by the shared route, which uses `isEntityRecordId`; the Neon legacy redirect uses its own copy. A future relaxation (e.g. accepting a non-UUID identity) applied to one copy makes the two entry points disagree, producing different 404 behaviour for the same value.

Fix: delete `apps/neon/lib/route-params.ts` and import `isEntityRecordId` from `@athyper/contract-platform-entity-runtime`; if a stricter storage identity policy is needed, add a distinctly named predicate next to `record-id.ts` instead of a third anonymous pattern.

---

### 16. LOW — alias resolution accepts entity codes and segments the canonical read route rejects

`packages/contracts/platform/entity-runtime/src/entity-record-href.ts:2-10`

```ts
export function parseEntityApplicationPath(pathname: string): {entityCode:string;segments:readonly string[]}|undefined {
  if (!pathname.startsWith("/app/entity/")) return undefined;
  const raw = pathname.slice("/app/entity/".length).replace(/\/$/, "").split("/");
  try {
    const [entityCode, ...segments] = raw.map(value => decodeURIComponent(value));
    if (!entityCode || !/^[A-Za-z][A-Za-z0-9_.-]{0,126}$/.test(entityCode)) return undefined;
```

versus the canonical route contract (`packages/contracts/platform/entity-runtime/src/routes/entity-read-route.ts:12-16`) which requires `isCanonicalEntityCode` (`validation/entity-code.ts:5` `^[a-z][a-z0-9_]{1,62}$`) and `isEntityRecordId` for the record segment.

Why it is wrong: the two shared functions model the same URL space with different grammars. `parseEntityApplicationPath("/app/entity/Country/not-a-uuid")` and `entityApplicationHref("Country-Thing")` both succeed and can be used to build or accept a link, but `renderEntityReadRoute` returns `notFound()` for the same URL.

Consequence on the Country route: no leak (the route fails closed), but alias/proxy resolution and any user-visible "record link" helper can produce or accept URLs that always 404, which is exactly the class of bug that makes the Neon `entityApplicationPublicPath` mapping brittle.

Fix: have `parseEntityApplicationPath` delegate to `isCanonicalEntityCode` and `isEntityRecordId`, or document it explicitly as "path shape only, not admission" and stop using it for user-visible link generation (`entityApplicationPublicPath`).

---

### 17. LOW — directory pages are requested with an AbortController that is never aborted (stale-result race)

`packages/platform/foundation/ui/src/searchable-select.tsx:218-231`

```tsx
  const loadDirectory = useCallback(async (nextQuery: string, cursor?: string, exactValue?: string) => {
    if (!loadPage) return;
    const controller = new AbortController();
    setDirectory((current) => ({ ...current, loading: true, error: undefined }));
    try {
      const page = await loadPage({ query: nextQuery, ...(cursor ? { cursor } : {}), ...(exactValue ? { value: exactValue } : {}), signal: controller.signal });
      setDirectory((current) => ({
        query: nextQuery,
        options: cursor && current.query === nextQuery
          ? [...current.options, ...page.options.filter((option) => !current.options.some((item) => item.value === option.value))]
          : page.options,
```

The controller is created per call but never stored and never aborted; the caller-side debounce (`:243-250`) clears its timer but not in-flight requests. The only staleness guard is the `cursor && current.query === nextQuery` branch, so a *response for a non-cursor request* always replaces the current options.

Why it is wrong: typing quickly in the reference search fires overlapping requests; a slower earlier response overwrites the newer result set while `query` (React state) shows the newer term, so the list can display options that do not match the visible query.

Consequence on the Country route: only affects Country fields/filters backed by a shared reference directory (`loadPage` is supplied by `reference-select.tsx:172+`); Country's current string fields do not use it.

Fix: keep the controller in a ref, abort the previous one before starting a new request, and ignore responses whose `nextQuery` differs from the latest requested term.

---

### 18. LOW (typing/polish) — `any`-typed parser input and an inconsistent `.js` re-export in the contracts barrel

`packages/contracts/platform/entity-runtime/src/intake-data.ts:343-347`

```ts
const object = (x: unknown) => {
  if (!x || typeof x !== "object" || Array.isArray(x))
    throw Error("INTAKE_DATA_OBJECT");
  return x as Record<string, any>;
};
```

Because the accessor returns `Record<string, any>`, `payload.target` is not narrowed at `intake-data.ts:695-696` (`{ payload: { target: payload.target, path: key(payload.path) } }`) even though `:505-509` validates it against `["context","canonical","request_only"]`; the type system cannot catch a future field that skips validation. `intake-flow-authoring.ts:2` repeats this with `type Row = Record<string, any>;`.

`packages/contracts/platform/entity-runtime/src/index.ts:62`

```ts
export type * from "./activity.js";
```

Every sibling re-export is extensionless and value-preserving; this one uses a `.js` specifier and `export type *`, so any runtime value added to `activity.ts` would be silently dropped from the barrel.

Consequence on the Country route: none; both are hygiene issues that weaken the strict-TypeScript guarantee in the shared contract layer.

Fix: use `Record<string, unknown>` plus an explicit narrowing helper (or `as const` tuple `includes` check that returns the literal) and change the barrel line to `export * from "./activity";`.

---

## Verified healthy (do not churn)

- **The three app entity read pages are genuinely shared**: `apps/{neon,mesh,studio}/app/(shell)/app/entity/[entityCode]/[[...segments]]/page.tsx` all have md5 `3cb777216d40c0daa284d6b75f6828fc` and each is exactly:
  ```tsx
  import { createEntityReadPage } from "@athyper/platform-entity-form-detail/read-route";
  import { notFound } from "next/navigation";
  export default createEntityReadPage(notFound);
  ```
- **One canonical URL parser for the entity route**: `resolveEntityReadRoute` (`routes/entity-read-route.ts:8-18`) is shared by the browser route and the server page adapter (`form-detail/src/routes/entity-read-route.tsx:11`) and fails closed: `segments.length > 1` → `undefined` → `notFound()`, non-UUID record id → `undefined`, and the `manage` sentinel maps to the list surface only.
- **`EntityReadSurface` is plane-neutral and adds no entitlement** (`form-detail/src/entity-read-surface.tsx:7-23`), matching its comment; the list/detail runtimes receive the same `entityCode` with no client-side access decision.
- **Pre-serialization intersection in `readableRecordPresentation`** (`record-presentation.ts:270-316`): fields, operations, localized labels, badges, sections, navigation tabs and entity relationships are intersected with the caller's authorized sets before the browser sees them; `related: undefined` (`:291`) prevents flat entity fields from authorizing related projections; `titleField`/`codeField` fall back rather than leak an unauthorized field.
- **Descriptor/navigation parsers are strict and cross-checked**: `parseEntityDetailNavigation` rejects duplicate keys, unknown/ambiguous sections and requires tabs to cover every section (`detail-navigation.ts`); `parseRecord360Panel` allows exactly one `360` tab, rejects a section in both rail and tab, and rejects duplicate references; `parseEntityRelationships` requires a tenant mapping, forbids tenant/field collisions and duplicate keys; `parseEntityRecordPresentation` rejects duplicate sections/actions and more than one primary action.
- **`parseEntityAccessDecision` binds state and reason 1:1 and only `context_required` may disclose `missingCoordinates`** (`access-decision.ts`), and rejects unknown properties.
- **"Check one layer away" for the weak api-client surface parser**: `parseEffectiveSurface` (`api-client/src/experience-surface.ts:8-13`) only checks two object fields, but `BrowserExperienceSurface` immediately re-parses the payload with the strong `parseExperienceSurface(result.surface, createRegistryPolicy(registry))` and falls back to the governed default on failure (`packages/platform/shell/dashboard/src/client.tsx:14`). Not a defect.
- **`aliases` cannot be `undefined`** at `apps/neon/lib/entity-application-route.tsx:10` (`item.aliases.includes(path)`): the producer always defaults it (`packages/contracts/platform/entity-list/src/experience.ts:110-112` `aliases: Object.freeze(list(value.aliases ?? []).map(parseEntityNavigationHref))`), and the interface marks it required (`experience.ts:93`).
- **`AppFoundationProviders` enforces one coherent session/bootstrap and fails closed on auth invalidation**: it throws unless `bootstrap.planeKey/tenantId/principalId` match the sanitized session scope, and on an invalidated boundary it feeds `workspaces: []`, `permissions: []`, `features: {}` into the access/permission/feature providers (`app-foundation/src/index.tsx:111-116`).
- **`readProtectedBootstrap` re-checks bootstrap identity against the session server-side** and redirects on `401` from either read (`app-foundation/src/server.ts:206-214,196-201`); `callInternalRoute` refuses non-same-origin targets (`:88`).
- **Browser transport hardening**: `createHttpClient` rejects absolute URLs, refuses caller-supplied `authorization`/`cookie`/`x-tenant-id`/`x-csrf-token`/`idempotency-key` headers, requires a valid `Idempotency-Key` for declared mutations, requires a CSRF token for unsafe methods, and constrains every request to `/api/relay` (`api-client/src/index.ts:168-192`). CSRF is read only from the `__Host-`-prefixed cookie in production (`browser-csrf.ts:5-16`).
- **The shared entity-catalog composition is explicit and fallback-safe**: only en/ms/ar entity catalogs exist and unknown languages return `{}` so `fallbackMessages` (English + en catalog) supplies plural rules (`i18n/src/entity-catalogs.ts:8-21`); this matches the documented comment and is not a bug.
- **The three empty runtime packages are governed placeholders, not accidental stubs**: `packages/platform/entity/runtime/{cascade,content-ui,workflow-ui}/src/index.ts` each contain exactly `export {}` (13 bytes), and `governance/config/governance/entity-placeholder-packages.json:5-7` records them as `"reserved-placeholder"` with `"expectedImplementation": "export {};"`, `"runtimeConsumersFound": false` and dispositions "Retain pending explicit retirement" / "Retain". Do not churn these without a retirement decision.
- **`apps/mesh` and `apps/studio` catalog routes are 5-line validated wrappers** around the generated catalog (`validateCatalogRoutes(PLATFORM_CATALOG_ROUTES.<plane>)`), so the generated catalog remains the single slug owner.
- **`entityApplicationRoutes` path normalization is traversal-safe** (`apps/neon/lib/catalog-routes.ts:177-188`): it rejects `//`, `..`, decoded `.`/`..`, backslashes and control characters, and never used any filesystem or redirect sink for those values.

## Checked but not a defect

- **`apps/*/lib/entity-record-adapters.tsx` and `apps/*/lib/entity-route-context.ts` do not exist anywhere in the repository.** `find`/`glob` for `entity-record-adapters`, `entity-route-context`, `entity-route-alias`, `list-density`, `redirect-entity-record`, `entity-application-layout`, `entity-application-route` shows `entity-route-alias.ts`, `list-density.ts`, `redirect-entity-record.ts`, `entity-application-layout.tsx`, `entity-application-route.tsx` only under `apps/neon/lib/`, plus `experience-runtime.tsx` and `catalog-routes.ts` in all three apps. The scope list in the review brief is stale for those two paths; there is no missing/shared-file drift to report for them.
- **`parseExperienceLocalePolicy` compatibility branch fabricates `ar` qualification** (`api-client/src/bootstrap.ts:106` marks en/ar `status:"qualified"`, `coveragePct:100`, all review flags `true`, `enabledLocales:["en","ar"]` when the server omits `localePolicy`). Mitigated one layer away: the server's experience-bootstrap contract lists `localePolicy` as required (`server/packages/platform/experience/src/contracts.ts:154`), and `parseExperienceBootstrap` fails closed if `tenant.id !== tenantId` (`bootstrap.ts:69-70`). Only a non-conforming server could reach the branch, so it is not reported as an active defect — but it is fabricated evidence if it is ever reached.
- **`readableRecordPresentation` leaves `panel`/`summaryView` unfiltered** while filtering `navigation` tabs. Verified not exploitable: the only consumer resolves panel rail sections against the filtered section list and drops missing keys (`packages/platform/entity/runtime/form-detail/src/record-360-panel.tsx:103-104` `panel.sections.flatMap((key) => sections.find((item) => item.key === key) ?? [])`), and section bodies are rendered from the already-authorized record values.
- **`isBoundedNonBlankText` checks length before trimming** (`validation/values.ts:8-17`). Deliberate and documented at `:7`; no caller relies on a post-trim bound.
- **`parseEntityLookupOptions` / `parseRecentChoicePolicy` defaults are internally consistent** with `EntityLookupOptions`/`RecentChoicePolicy` (required fields always emitted, optional fields only when supplied, `mode`/`selectionMode`/`recordAccess` cross-validated at `lookup-options.ts:108-113`).
- **`createOperation` declaration consistency** (`api-client/src/index.ts:35-36`): an idempotency-required declaration on a non-mutating method throws; `reference-history.ts:43-52` declaring a POST with `idempotency: "forbidden"` is legal and intentional (a history append that is safe to repeat).
- **`request-destination.ts:23-31`** rebuilds the return-to header from the pathname+search and both writes and reads it through `sanitizeReturnTo`; no absolute-URL or newline injection path found.
- **`DataValidationError`'s English message** (`validation-messages.ts:144-158`) is only consumed by `intake-data-values.ts:317`, whose only importers are tests (`tests/foundation/*`); the production form path uses `validateDataInput` + `useValidationMessage`. Not user-visible, so not reported as a localization defect.
- **`parseEntityFormDescriptor` / `parseEntityDetailDescriptor` / `parseEntityRecord`** (`contracts/.../index.ts:14-16`) match their interfaces (mode↔pageKind, duplicate field rejection, 64-hex revision hashes, optional version only when a valid integer) and are exercised by `tests/contracts/entity-runtime-descriptor-validation.test.ts`.
- **`governed-workflow.ts`** (schema-tagged parsers) validates identifiers, timestamps, media types, bounded arrays and `progress.completed <= progress.required`; no drift found between the interfaces and the parsers. It is not on the Country path.

## Coverage and limitations

- Read in full or in the relevant part: all 31 files under `packages/contracts/platform/entity-runtime/src/**`; all 26 files under `packages/platform/foundation/ui/src/**`; all 11 `api-client` files; all 11 `i18n` files; all 8 `app-foundation` files; all `apps/*/lib` files named in scope plus `apps/neon/lib/route-params.ts`, `entity-work-context.ts`, `workspace-module-relevance.ts`, `browser-csrf`, `relay.ts` for context; the descriptor client (`index.ts`, `runtime-client.ts`, `intake-operation-client.ts`) and the reuse path through `list-view/src/index.tsx`, `form-detail`, `packages/contracts/platform/{dashboard,entity-list,navigation}` where the audit required checking one layer away.
- I did not read `docs/reports/review/**` or `docs/reports/country-route-comprehensive-review-*.md` (excluded by instruction), nor `server/**` beyond the specific gate/caller lines quoted as evidence.
- `packages/platform/entity/runtime/{cascade,content-ui,workflow-ui}` contain only the governed `export {}` placeholder, so no source-level findings exist there.
- No test suite was executed; every claim is from reading current source and, where noted, `node_modules` defaults.
- `pnpm policy:i18n` (`tooling/scripts/policy/verify-i18n-foundation.mjs`) only checks app layout locale wiring and the locale registry, so none of the hard-coded-English findings above are currently gated.
