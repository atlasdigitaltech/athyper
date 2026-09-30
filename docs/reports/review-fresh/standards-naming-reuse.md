# Coding standards, file/method naming, duplication, generalization — independent review

Area: cross-cutting `packages/**`, `apps/**`, `server/packages/**`.
Scope of measurement (canonical file set used for every count below):

```bash
find packages apps server/packages -type f \( -name '*.ts' -o -name '*.tsx' \) \
  -not -path '*/node_modules/*' -not -path '*/.next*' -not -path '*/.next-*/*' \
  -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/.turbo/*' \
  -not -path '*/coverage/*' -not -path '*/generated/*'
```

| Measurement                                  | Value         |
| -------------------------------------------- | ------------- |
| Files in scope                               | **2 029**     |
| Lines in scope                               | **262 134**   |
| `packages/**`                                | 77 580 lines  |
| `apps/**`                                    | 3 326 lines   |
| `server/packages/**`                         | 208 766 lines |
| Test files (`*.test.ts(x)` / `*.spec.ts(x)`) | 673           |
| `__tests__/` directories                     | 84            |

Independence: I did not read `docs/reports/country-route-comprehensive-review-20260929.md`, anything under
`docs/reports/review/`, or the untracked `server/apps/platform-host/docs/naming-and-layout-review.md`
(601 lines, clearly a prior review of this same subject). Every finding below is derived from the source
I opened in this session. All line numbers were re-read before being written down.

Note on a moving baseline: `HEAD` advanced from `63fc9492b` to `4fc23a29c` while this audit ran (sibling
agents are committing). All measurements are reproducible with the command given next to them.

---

## Findings

### F1 — HIGH — Four test suites in `@athyper/server-plane-studio-meta-entity-authoring` cannot collect; the package `test` script and CI are red

This is the rule-9 case: suites that cannot collect, with the exact import line and proof the target path is absent.

**(a) `server/packages/planes/studio/meta-entity-authoring/src/__tests__/intake-presentation.test.ts:3`**

```ts
import { publishedBusinessPartnerIntakeOverlay } from "../intake-presentation.js";
```

Target `server/packages/planes/studio/meta-entity-authoring/src/intake-presentation.ts` does not exist:
`find . -name 'intake-presentation*' -not -path './node_modules/*'` returns only the test file itself.

**(b) `.../src/__tests__/configuration-editor-qualification.test.ts:2-3`**

```ts
import { configurationEdit } from "../../../../../../../packages/planes/studio/business-partner/src/composition-configuration";
import { configurationFixture } from "../../../../../../../packages/planes/studio/business-partner/src/composition-configuration.fixture";
```

**(c) `.../src/__tests__/structural-editor-qualification.test.ts:2-3`**

```ts
import { structuralEdit } from "../../../../../../../packages/planes/studio/business-partner/src/composition-structure";
import { graph } from "../../../../../../../packages/planes/studio/business-partner/src/composition-structure.fixture";
```

`packages/planes/studio/business-partner/` contains **only** `node_modules/` — there is no `src/`:

```
$ ls -la packages/planes/studio/business-partner
drwxr-xr-x 3 .  ..
drwxr-xr-x 3 .. node_modules
```

`git ls-tree -r --name-only HEAD -- packages/planes/studio/business-partner` is empty, and
`git log --diff-filter=D -- 'packages/planes/studio/business-partner/src/*'` shows the deletion in
`870f08f52 cleanup: remove bespoke business partner and workforce`. The three test files are still
tracked at `HEAD` (`git cat-file -e HEAD:<path>` succeeds), so the deletion of the bespoke package was
not accompanied by deletion of its tests.

**(d) `.../src/__tests__/runtime-restoration.test.ts:117`**

```ts
const choices = read(
  "server/packages/platform/metadata/src/__tests__/fixtures/intake-choice-graphs.json",
).business_partner;
```

`server/packages/platform/metadata/src/__tests__/fixtures/` does not exist and
`find . -name 'intake-choice-graphs.json'` returns nothing. `read` at line 6-12 resolves relative to
`import.meta.url` with seven `../`, landing on the repo root, so the literal path above is the real path.

**Runtime proof.** The package vitest config collects these files — `server/packages/planes/studio/meta-entity-authoring/vitest.config.ts:2`:

```ts
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
```

```
$ pnpm --filter @athyper/server-plane-studio-meta-entity-authoring exec vitest run
 Test Files  4 failed | 45 passed (49)
      Tests  1 failed | 217 passed (218)
```

Per-file: `Error: Cannot find module '../intake-presentation.js' imported from ...`,
`Error: Cannot find module '../../../../../../../packages/planes/studio/business-partner/src/composition-configuration' imported from ...`,
`Error: Cannot find module '../../../../../../../packages/planes/studio/business-partner/src/composition-structure' imported from ...`,
`Error: ENOENT: no such file or directory, open '.../server/packages/platform/metadata/src/__tests__/fixtures/intake-choice-graphs.json'`.

**Consequence.** `.github/workflows/ci.yml:120` runs `pnpm run test:workspace -- --coverage` (`turbo test`),
which runs this package's `"test": "vitest run"` and fails; the `quality` job fails and `CI Success`
(`ci.yml:467`, "Quality gate failed — lint, typecheck, test, or format check did not pass") fails. Any
implementation under test in those four suites is **unverified** — the `intake-presentation`,
`composition-configuration`, `composition-structure` and intake-choice behaviours have no executing
coverage right now.

**Fix.** Delete or rewrite the three tests that target the removed bespoke `business-partner` package so
they exercise the shared framework path instead (`packages/planes/studio/meta-entity-authoring`'s own
`deterministic.ts`, which they already import), and either restore
`server/packages/platform/metadata/src/__tests__/fixtures/intake-choice-graphs.json` or replace the
hardcoded cross-package fixture read with a local fixture. Do not silence with `skip`.

**Confidence: verified** (executed the suites).

---

### F2 — HIGH — `pnpm format:changed:check` fails on 76 of 125 checked changed files; there is no Prettier config, and the gate is wired into pre-push and CI

Measured, not estimated:

```
$ node tooling/scripts/policy/format-changed.mjs --check
Formatting base: 4fc23a29ce428f56ce5577bcee814143dd7b2346; 133 changed files, 125 checked, 8 ignored, 0 unsupported.
exit=1
files-with-diff=76        # grep -c 'Formatting differs'
```

**71 of the 76 are source files**, not documentation. Country-path files in the failing set:

```
packages/contracts/platform/entity-list/src/filter-defaults.ts
packages/contracts/platform/entity-list/src/index.ts
packages/contracts/platform/entity-list/src/parsers.ts
packages/contracts/platform/entity-list/src/url-state.ts
packages/contracts/platform/entity-runtime/src/index.ts
packages/contracts/platform/entity-runtime/src/routes/entity-read-route.ts
packages/platform/entity/runtime/form-detail/src/entity-detail-runtime.tsx
packages/platform/entity/runtime/form-detail/src/entity-form-runtime.tsx
packages/platform/entity/runtime/form-detail/src/field-input.tsx
packages/platform/entity/runtime/form-detail/src/record/record.css
packages/platform/entity/runtime/list-view/src/index.tsx
packages/platform/entity/runtime/list-view/src/list-pagination.tsx
server/packages/services/records/src/entity-list-service.ts
server/apps/platform-host/src/composition/register-services.ts
```

**Why it matters.** The gate is not decorative:

- `.githooks/pre-push:84` — `check_drift format:changed:check format:changed`, and a non-zero exit aborts
  the push (`exit 1` at `.githooks/pre-push:95`).
- `governance/config/governance/static-policy-profiles.json` — `format:changed:check` is the last entry of
  the **`ci`** profile, which `.github/workflows/ci.yml:82` runs as `pnpm policy:static`.

**Root cause — verified absence of any formatter/eslint config.** `git ls-files | grep -iE 'prettier|eslint'`
returns only `.prettierignore`; there is no `.prettierrc*`, `prettier.config.*`, `.editorconfig`, or nested
config. `prettier.resolveConfig()` returns `null` for the files it checks, so the repo is silently relying on
Prettier defaults (`printWidth: 80`, `semi: true`, `singleQuote: false`) while several newly added files are
authored as single-line monsters that cannot ever satisfy `printWidth: 80`. Example of an added file that
fails for exactly this reason — `packages/platform/entity/runtime/form-detail/src/registered-renderers/contact-address.tsx:10`
is a single 1 200-character line.

**Consequence on the shipped Country route.** No runtime consequence by itself, but it blocks the push/merge
of the Country work and it means formatting is decaying in the same files that carry the Country request path.
The build is currently not releasable.

**Fix.** Add a committed `prettier.config.mjs` (or `.prettierrc.json`) so the standard is explicit and
reviewable, then `pnpm format:changed` and commit the result. Consider adding `format:changed:check` to
`.githooks/pre-commit` as well so drift cannot accumulate to 76 files again.

**Confidence: verified** (ran the gate; resolved Prettier config).

---

### F3 — HIGH — No ESLint configuration or dependency exists anywhere in the repository; `lint` is `tsc --noEmit`, so all lint-class rules are unenforced

```bash
$ git ls-files | grep -iE '(^|/)\.eslintrc|eslint\.config|eslintignore'
(empty)
$ grep -rn '"eslint"' --include=package.json apps packages server tooling
(empty)
```

Only `apps/{neon,mesh,studio}/package.json:11` define `"lint": "tsc --noEmit"`, and the root
`package.json:41` is `"lint": "pnpm policy:i18n && turbo lint"`, so `turbo lint` type-checks only.

**Consequence — measured unenforced surface:**

| Rule class a linter would enforce                      | Measured occurrences in scoped source                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `@typescript-eslint/no-explicit-any` — `: any`         | **170**                                                                                               |
| `@typescript-eslint/no-explicit-any` — `as any`        | **119**                                                                                               |
| `no-unsafe-*` / double cast `as unknown as`            | **196**                                                                                               |
| `react-hooks/exhaustive-deps`                          | 236 `useEffect` call sites, **zero** `eslint-disable exhaustive-deps` and zero automated verification |
| `@typescript-eslint/no-floating-promises` — `void fn(` | **122**                                                                                               |
| `no-non-null-assertion` — `x!.y` on the entity path    | **8**                                                                                                 |

`@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` are **0 in source** — all 168 raw hits are inside
`apps/*/.next*/types/validator.ts` build output. `TODO`/`FIXME`/`HACK` are **0**; `console.log` in
non-test, non-script source is **0**. So the escapes that exist are `any`/casts, not suppressions.

**Concrete worst offenders on the shared detail surface:**
`packages/platform/entity/runtime/form-detail/src/comments-workspace.tsx` (8 explicit `any` at lines 970,
1002, 1436, 1567, 1588, 1614, 1646) and `packages/platform/entity/runtime/form-detail/src/rich-text-render.tsx`
(5 at lines 35, 36, 66, 75, 80). Instance: `rich-text-render.tsx:66` `const visit = (node: any): ReactNode => {`.

**Consequence.** Type-safety regressions and hook-dependency bugs can be introduced anywhere — including the
Country path — with no automated objection. This is the enabling condition for F7, F11, F12, F16 and F17.

**Fix.** Add flat `eslint.config.mjs` at the root with `typescript-eslint` + `eslint-plugin-react-hooks`, run it
via `turbo lint` in addition to `tsc --noEmit`, and ratchet the existing `any`/cast counts in a baseline file
(the repo already has a ratchet idiom: `governance/config/governance/design-system-ratchet.json`,
`temporal-discipline-ratchet.json`).

**Confidence: verified.**

---

### F4 — MEDIUM — Entity-specific `business_partner`-shaped vocabulary is baked into shared contract packages, so entity onboarding is blocked by TypeScript unions and `TypeError`s

15 hardcoded `"business_partner"` comparisons exist in non-test, non-fixture, non-script source:

```bash
$ grep -rn --include=*.ts --include=*.tsx -E '(===|!==|==|!=) *"business_partner"' packages apps server \
  | grep -vE 'node_modules|/\.next|/dist/|__tests__|\.test\.|fixtures|scripts/' | wc -l
15
```

The four that live in **shared** packages and block any other entity:

**(a) `packages/contracts/platform/entity-runtime/src/related-presentation.ts:543`**

```ts
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

**(b) `packages/contracts/platform/entity-runtime/src/record-360-panel.ts:17`, validated at `:62-68`**

```ts
  readonly sidebar: readonly {
    readonly key: string;
    readonly label: string;
    readonly provider: "primary-contact" | "primary-address";
  }[];
...
    if (
      item.provider !== "primary-contact" &&
      item.provider !== "primary-address"
    )
      throw new TypeError("Unregistered 360 sidebar provider");
```

**(c) `packages/contracts/platform/entity-runtime/src/record-presentation.ts:222`**

```ts
      rendererKey: item.provider === "primary-contact" ? "platform.contact.summary.v1" : "platform.address.summary.v1",
```

Any sidebar provider that is not the business-partner primary contact silently becomes an address card.

**(d) `packages/platform/entity/runtime/form-detail/src/record/record-summary-panel.tsx:139` and `:148`**

```ts
  if (displayFields.length && rendererKey !== "platform.address.summary.v1")
    return (
      <MetadataFields
...
  if (
    displayFields.length &&
    rendererKey === "platform.address.summary.v1" &&
```

The shared record panel has a two-tier behaviour keyed on one renderer-key string literal.

**Mitigation checked and rejected.** Is there a registry that makes these dynamic? The renderer side _is_
registry-driven (`registered-renderers/index.ts:3-4` maps keys to components, and
`record-summary-panel.tsx:165` looks the key up), but the _contract_ side is a closed union plus a hardcoded
ternary (b, c). `validateRelatedPresentationOwner` is short-circuited by `profiles.length &&`: I verified
Country's metadata (`metadata/products/shared/entities/country/definition.json`) declares **no**
`relatedProfiles` and **no** `panel`, so the Country route does not hit (a) or (b) today.

**Consequence.** The next entity that wants a 360 sidebar, a summary card, or related records must edit
shared contract TypeScript rather than metadata — a direct violation of AGENTS.md ("Keep entity-specific
configuration in metadata"). For the country route specifically the impact is nil because country declares
neither.

**Fix.** Replace the `provider` unions and the ternary with a registry keyed by provider code
(`Record<providerCode, { rendererKey; summaryKind }>` validated against `metadata/.../registry-catalog.json`),
and change `validateRelatedPresentationOwner` to consult that registry instead of a literal.

**Confidence: verified** for the code and for Country's metadata; **probable** for "first entity that tries this will fail" (I did not author such metadata).

---

### F5 — MEDIUM — The export-privacy control is hardcoded to one entity and fail-open for every other entity, while a generic `classification` mechanism sits unused

`server/packages/services/records/src/transfer/transfer-service.ts:1841-1864`:

```ts
export function assertBusinessPartnerExportPrivacy(
  entityCode: string,
  filter: Readonly<Record<string, unknown>>,
): void {
  if (entityCode !== "business_partner") return;
  const transfer = filter["_transfer"];
  if (!transfer || typeof transfer !== "object" || Array.isArray(transfer))
    return;
  const fields = (transfer as Readonly<Record<string, unknown>>)["fields"];
  if (!Array.isArray(fields)) return;
  const forbidden = fields.find(
    (field) =>
      typeof field === "string" &&
      /^(?:person|personal|employee|employment|work_assignment|workforce|external_worker|worker_engagement|engagement|placement|onboarding|offboarding|date_of_birth|national_id|compensation)(?:[._]|$)/i.test(
        field,
      ),
  );
  if (forbidden)
    throw new RecordServiceError(
      403,
      "BUSINESS_PARTNER_EXPORT_WORKFORCE_FORBIDDEN",
      "Generic Business Partner exports cannot contain person or workforce fields",
    );
}
```

Called from two places — `transfer-service.ts:244` (`prepareExport`) and `transfer-service.ts:1568`
(export restart) — so the guard genuinely runs on the export path.

**Mitigation checked and rejected.** The export privacy decision is _not_ made generically elsewhere before
this point: the generic per-field `classification` value is already available on the runtime descriptor and is
used for the analogous list-visibility rule at `server/packages/services/records/src/entity-list-service.ts:882`
(`!["confidential", "pii", "sensitive_pii"].includes(field.classification ?? "internal")`). No equivalent
classification check exists in the transfer/export path — I grepped `classification` in
`transfer-service.ts` and found no use of it in the export guard.

**Consequence.** Any entity other than `business_partner` can export its `pii` / `sensitive_pii` fields with no
assert-analogue, and the protection is expressed as a field-name regex rather than the metadata classification
that already exists. Impact on the **shipped Country route is nil** — Country declares no `operations` at all
(`metadata/products/shared/entities/country/definition.json` has `operations: null`, only `list` and `read`
runtime bindings), so export is unavailable for Country. The defect is a framework-level gap plus the
entity-named export (`assertBusinessPartnerExportPrivacy`) sitting in the shared transfer service.

**Fix.** Delete the name regex, and enforce export privacy generically: reject requested export fields whose
`descriptor.fields[].classification` is `pii` / `sensitive_pii` unless the caller holds the corresponding
reveal permission. Rename to `assertExportFieldPrivacy`.

**Confidence: verified** for code, call sites and Country metadata; **probable** for the claim that no other
entity currently exports PII (I did not enumerate every entity's `operations`).

---

### F6 — MEDIUM — The shared list surface is only partially localized: 49 hardcoded English strings in `list-view/src/index.tsx`, and `drawer-registry.tsx` is 100 % English

The i18n machinery is real and wired: `packages/platform/foundation/i18n/src/entity-catalogs.ts:11-15`
merges `collaborationMessages` + `countryMessages` + `entityRuntimeMessages` for `en`/`ms`/`ar`;
`catalogs/country.ts:3-30` provides every Country field, section and title label in all three locales; and
`PlatformShell` mounts `IntlProvider` (`packages/platform/shell/shell/src/index.tsx:24`), which
`useEntityI18n()` (`packages/platform/foundation/i18n/src/entity-react.ts:12-22`) reads.

Yet in the same function, `packages/platform/entity/runtime/list-view/src/index.tsx`:

```ts
1658:  const entityIntl = useEntityI18n();
...
2048:              aria-label={entityIntl.message("entity.controls")}
2049:              title={entityIntl.message("entity.controls")}
2053:                {entityIntl.message("entity.controls")}
...
2117:                    label="Data operations…"
2121:                        ? "Use System default for data operations; standard-view export is not supported yet."
2135:                label={refreshRequested ? "Refreshing…" : "Refresh"}
2144:                label="Copy link to this view"
2151:                label="Reset list settings"
```

Measured: **49** capitalized literal UI props in `list-view/src/index.tsx` versus **181** i18n calls in the same
file; **86** such literals in the entity framework versus **448** i18n calls.

The worst concentration is a whole file:
`packages/platform/entity/runtime/list-view/src/drawer-registry.tsx:10-15` has zero i18n calls and hardcodes
both label and description for all six list drawers, e.g. line 14:

```ts
  { key: "display", label: "Display settings", Icon: LayoutIcon, available: (_d: EntityListDescriptorV1) => true, description: (d: EntityListDescriptorV1) => `Set personal defaults for ${d.plane[0]!.toUpperCase()}${d.plane.slice(1)} lists on this device.` },
```

Note the parallel defect on the next line: `d.plane[0]!` (non-null assertion) and
`d.plane.slice(1)` to capitalise the plane key.

`registered-renderers/contact-address.tsx:8-10` is the same pattern in the _detail_ surface — hardcoded
"Primary address", "Verified", "Address line 1", "City", "Region", "Postal code", "Country code", "Purpose",
"Primary contact".

**Consequence on the shipped Country route.** With a non-English tenant UI locale the Country list renders
translated field labels (from `catalogs/country.ts`) around English drawer labels, English toolbar menu items
and English search placeholders — a genuinely mixed-language screen for `ms`/`ar` tenants, because
`localizeEntityLabels` (`packages/platform/foundation/i18n/src/entity-labels.ts:20-35`) localises
`descriptor.fields[].label` while `drawer-registry.tsx` and the list chrome literals above are not touched.

**Fix.** Move the 86 literals into `catalogs/entity-runtime.ts` (the file already has the right shape and
already carries `list.notice.*`, `form.*`, `detail.*` namespaces) and route `drawer-registry.tsx` through
`useEntityI18n()`. `drawer-registry.tsx` currently has no hook usage at all, so the labels must become a
function of `intl` (as `LIST_DRAWERS`' `description` already is a function of `descriptor`).

**Confidence: verified.**

---

### F7 — MEDIUM — `searchHint` ranks search fields by regex-matching localized label text and by a hardcoded `country_code` role, contradicting the rule the adjacent new module just documented

`packages/platform/entity/runtime/list-view/src/index.tsx:5195-5214`:

```ts
function searchHint(descriptor: EntityListDescriptorV1): string {
  const priority = (field: ListFieldDescriptorV1) =>
    field.key === descriptor.entity.identityField
      ? 0
      : /display.?name|\bname\b/i.test(`${field.key} ${field.label}`)
        ? 1
        : field.semanticRole === "country_code" ||
            /country/i.test(`${field.key} ${field.label}`)
          ? 2
          : 10 + field.defaultOrder;
  return [...descriptor.fields]
    .sort((left, right) => priority(left) - priority(right))
    .slice(0, 3)
    .map((field) =>
      field.label
        .replace(new RegExp(`^${descriptor.entity.label}\\s+`, "i"), "")
        .toLocaleLowerCase(),
    )
    .join(", ");
}
```

Used at `list-view/src/index.tsx:1930` as ``placeholder={`Search by ${searchHint(descriptor)}…`}``.

**Why it is wrong.** The sibling module added in this same change states the rule explicitly —
`packages/contracts/platform/entity-list/src/filter-defaults.ts:6-8`:

```ts
/** Ranks fields for the fallback quick-filter bar. Ranking comes only from the
 * metadata `semanticRole` (never from key or label text, which are localized
 * and entity-specific); other fields keep their declared column order. */
```

`searchHint` does exactly what that comment forbids: it regexes `field.label` (which by the time it is called
has been through `localizeEntityLabels` — see `list-view/src/index.tsx:399-403`) and it hardcodes the
`country_code` role. It is the second of only two _unparameterised_ `country_code` literals in the client
(the other is `formatFieldValue` at line 5144).

**Consequence on the shipped Country route.** For `country` the hint happens to degrade correctly (`code` is
the identity field at rank 0, `name` matches the key at rank 1), so today's English placeholder reads
`Search by code, name, official name…`. But the ranking is derived from display text, so the hint silently
changes when a tenant locale changes a label, and the rule "ranking comes only from metadata" is violated in
the same commit that introduces it.

**Fix.** Move `searchHint` into `packages/contracts/platform/entity-list/src/filter-defaults.ts` as a
role-ranked function (`identityField` → `0`, `semanticRole === "name"` / a new declared `searchPriority` →
`1`, `country_code` → `2`), or have metadata declare `searchHintFields`. Reuse `quickFilterPriority`'s shape
rather than duplicating the ranking idea.

**Confidence: verified.**

---

### F8 — MEDIUM — ~15 direct `Intl.*` constructors in the entity runtime bypass the shared `IntlRuntime`, so the same Country record formats differently in the list and in the detail

The platform already owns an `IntlRuntime` that carries the tenant's `formatLocale`, `timeZone`, `calendar`
and `numberingSystem` — `packages/platform/foundation/i18n/src/index.ts:202-206`:

```ts
    number(value, options) { return new Intl.NumberFormat(localization.formatLocale, { numberingSystem: localization.numberingSystem, ...options }).format(value); },
    date(value, options) { const date = value instanceof Date ? value : new Date(value); return new Intl.DateTimeFormat(localization.formatLocale, { timeZone: localization.timeZone, calendar: localization.calendar, numberingSystem: localization.numberingSystem, ...options }).format(date); },
...
    displayName(code, options) { return new Intl.DisplayNames(localization.formatLocale, options).of(code) ?? code; },
```

It is bypassed in the Country list path:

- `list-view/src/index.tsx:5136` — `new Intl.DateTimeFormat(undefined, …)`: **browser** locale, no tenant
  timezone/calendar/numbering system. This is the `Created` / `Updated` columns of the Country list.
- `list-view/src/index.tsx:1792`, `:1796`, `:4677`, `:4693`, `:5219` — `new Intl.NumberFormat()` with no
  locale argument.
- `list-view/src/list-pagination.tsx:32,38` — same.
- `list-view/src/index.tsx:5149` — `new Intl.DisplayNames(undefined, { type: "region" })`, i.e. a second
  implementation of `IntlRuntime.displayName`.
- `form-detail/src/related-record.tsx:50` — a third implementation, this time with a `locale` parameter but
  still not the tenant runtime.

**Consequence on the shipped Country route — verified by reading both sides.** The list detail pane renders
record values through `formatFieldValue` (`list-view/src/index.tsx:5126-5159`) using the _browser_ locale and
no timezone, while the detail pane renders the same fields through `detailValue`
(`form-detail/src/related-record.tsx:25-68`) using an explicit `locale` and `timeZone`. So `created_at` on
`/app/entity/country/` and on `/app/entity/country/<id>` can show different dates, times, timezones and digit
shapes for the same record, and Country count labels ignore the tenant numbering system. Country's ISO code
column likewise uses the browser region display names rather than the tenant locale.

**Fix.** Thread the existing `IntlRuntime` (already in scope as `entityIntl` at
`list-view/src/index.tsx:1658` and `intl` in the detail) into `formatFieldValue`, `listCountLabel`,
`list-pagination.tsx` and `detailValue`, and delete the four hand-rolled `Intl.*` sites in favour of
`intl.number` / `intl.date` / `intl.displayName`.

**Confidence: verified** for the code paths and the divergence; **probable** for the exact pixel-level
difference in any given tenant locale (I did not boot the app).

---

### F9 — MEDIUM — Identical reference-directory message block copy-pasted across three packages

The same eight-entry message map appears verbatim in three different packages:

`packages/platform/entity/runtime/list-view/src/field-catalogue.tsx:218-225`

```tsx
      messages={{
        search: message("entity.reference.search"),
        recent: message("entity.reference.recent"),
        all: message("entity.reference.all"),
        results: message("entity.reference.results"),
        empty: message("entity.reference.empty"),
        unavailable: message("entity.reference.unavailable"),
        required: message("entity.reference.required"),
        clear: message("entity.reference.clear"),
      }}
```

`packages/platform/entity/runtime/form-detail/src/reference-select.tsx:223-231` and
`packages/platform/entity/runtime/collection-controls/src/filter-editor.tsx:395-403` are the same block plus
`clearRecent`. A rolling-hash sweep found these as one of **449 clusters of ≥10 identical substantive lines**
(815 clusters at ≥8 lines).

**Consequence.** A new `entity.reference.*` message requires three edits; missing one leaves a raw message id
in the reference picker on whichever surface was forgotten. The Country route does not use reference pickers
today, so the user-visible impact is currently zero — it is a maintenance/consistency defect on the shared
framework.

**Fix.** Export `referenceDirectoryMessages(message: (id: string) => string)` from
`packages/platform/foundation/i18n/` (or from a shared entity-runtime primitive) and consume it in all three
call sites. Ranked #3 in the generalization list below.

**Confidence: verified.**

---

### F10 — MEDIUM — `tenantScope()` and `humanize()` are duplicated per plane while a shared primitive exists and is re-exported under a different name

`tenantScope()` is byte-identical in three files:

- `server/packages/planes/mesh/src/record-collection-scope.ts:44`
- `server/packages/planes/studio/src/record-collection-scope.ts:20`
- `server/packages/planes/neon/src/record-collection-scope.ts:436`

```ts
function tenantScope(): Extract<
  RecordCollectionScopeResolution,
  { readonly status: "ready" }
> {
  return Object.freeze({
    status: "ready",
    authorizationResource: Object.freeze({}),
    constraints: Object.freeze([]),
    labels: Object.freeze([]),
    fingerprintMaterial: Object.freeze({ mode: "tenant" }),
  });
}
```

`humanize` is re-implemented in **nine** files, three of them byte-identical one-liners:

```
packages/platform/shell/app-foundation/src/boundaries.tsx:79
server/packages/planes/mesh/src/record-collection-scope.ts:46
server/packages/platform/notifications/src/kysely-notification-repositories.ts:162
packages/platform/shell/shell/src/home.tsx:1787
packages/platform/shell/shell/src/quick-access.tsx:397
packages/platform/shell/activity-center-data/src/index.ts:678
server/apps/platform-host/src/composition/shared/verification.ts:1075
server/db/scripts/provisioning/authorization-pack-applicator.ts:923
server/db/scripts/seed/tenant-authority-projection.ts:326
```

A shared primitive already exists —
`packages/contracts/platform/entity-runtime/src/text/humanize.ts:3`:

```ts
export function humanizeIdentifier(value: string): string {
  return value
    .replace(/[_.-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
```

and it is not merely available, it is already adopted — then renamed at the boundary, which hides it:

- `packages/platform/entity/runtime/form-detail/src/section-primitives.tsx:229` — `export const humanize = humanizeIdentifier;`
- `server/packages/services/records/src/entity-list-service.ts:5` — `humanizeIdentifier as humanize,`

**Consequence.** The mesh `humanize` differs from the shared one (`/[._-]+/` vs `/[_.-]+/` — identical
character sets, so equivalent by luck), but three shells, the notification repository and two provisioning
scripts each own a private copy; a fix to identifier humanisation has to be applied nine times. No
user-visible Country defect today.

**Fix.** Promote `humanizeIdentifier` to a leaf package both sides may depend on (or re-export it from
`@athyper/platform-i18n`), delete the nine copies, and drop the two `as humanize` aliases so the canonical
name is the only name. Move `tenantScope` into a shared
`server/packages/contracts/records/src/collection-scope.ts` helper.

**Confidence: verified.**

---

### F11 — LOW — Alias exports hide canonical export names

```ts
packages/platform/entity/runtime/form-detail/src/index.tsx:82:export { Fields as MetadataFields } from "./section-primitives";
packages/planes/neon/list-view/src/index.tsx:143:export { EntityApplicationSection as NeonEntityApplicationSection };
server/packages/planes/studio/meta-entity-authoring/src/publication/publication-workflow.ts:186:export { ReferenceFirstPublicationWorkflow as EntityFirstPublicationWorkflow };
```

`Fields as MetadataFields` is on the shared detail barrel. A reader grepping for `Fields` finds the
definition but not the public name; a reader grepping `MetadataFields` finds two names for one component.

**Fix.** Rename the declaration instead of aliasing (`export function MetadataFields`), or keep the alias but
add a one-line comment stating why. The third case additionally renames _away_ from a name that no longer
matches its concept (`ReferenceFirst...` → `EntityFirst...`), which is a rename that was never finished.

**Confidence: verified.**

---

### F12 — LOW — Explicit `any` on the shared detail surface erases parsed-contract type safety

`packages/platform/entity/runtime/form-detail/src/registered-renderers/contact-address.tsx:7-8`:

```tsx
export function ContactSummaryRenderer({ data }: { readonly data: unknown }) { const value=(data&&typeof data==="object"?(data as any).value:data)??{}; ...
export function AddressSummaryRenderer({ data }: { readonly data: unknown }) { const value=(data&&typeof data==="object"?(data as any).value:data)??{}; ...
```

`data` is `unknown` and the cast to `any` discards the discriminant check the `typeof` test is trying to
perform; `value` then becomes `any` for the rest of the function, so `value.displayName ?? value.name` and
`value.verified === true` are unchecked.

Plus 8 sites in `comments-workspace.tsx` (970, 1002, 1436, 1567, 1588, 1614, 1646) and 5 in
`rich-text-render.tsx` (35, 36, 66, 75, 80).

**Consequence.** On the Country detail surface these renderers are reachable only through
`summaryRenderers`, and Country publishes no summary cards, so no Country impact today. Any entity that does
use `platform.contact.summary.v1` / `platform.address.summary.v1` reads unvalidated record fields.

**Fix.** Replace `(data as any).value` with a narrow reader: `const value = (data && typeof data === "object" && "value" in data ? (data as { value: unknown }).value : data) ?? {};`.

**Confidence: verified.**

---

### F13 — LOW — Non-null assertion and a double cast that the type system was about to check

`packages/platform/entity/runtime/form-detail/src/entity-detail-runtime.tsx:113` (shared detail runtime on the
Country detail route):

```ts
            label: descriptor.actions.find((action) => action.kind === "edit")!
              .label,
```

The `canEdit` guard at line 98 makes it safe at runtime, but the expression is evaluated inside the ternary
branch and duplicates the `find` anyway (`canEdit` already computed it).

`server/packages/services/records/src/entity-authorization-rollout.ts:108`:

```ts
    release: Object.freeze(release) as unknown as EntityAuthorizationRelease,
```

**Mitigation checked and rejected as a real risk, but noted:** I read lines 85-108 and the six required
members of `EntityAuthorizationRelease` (`:20-27`) are all validated immediately above — `planeKey` via the
`["neon","mesh","studio"].includes(...)` check, `entityCode` and `runtimeVersion` via the reference loop, and
`descriptorHash` / `profileHash` / `bindingsHash` via the `hashPattern` loop. So the cast is currently
lossless; the defect is that adding a seventh required member silently yields `undefined`.

**Fix.** `const editAction = descriptor.actions.find(...)` once and reuse it; build the release object
field-by-field so the compiler enforces the interface.

**Confidence: verified.**

---

### F14 — LOW — Unnamed magic limit for default column visibility, next to a named constant for the sibling limit

`server/packages/services/records/src/entity-list-service.ts:876-884`:

```ts
      defaultVisible:
        field.key === identityKey ||
        (hasConfiguredColumns
          ? configuredColumns.has(field.key)
          : (field.list?.defaultVisible ??
            (index < 8 &&
              !["confidential", "pii", "sensitive_pii"].includes(
                field.classification ?? "internal",
              )))),
```

`8` is unnamed and undeclared, while the sibling concept in the same change uses a declared constant —
`packages/contracts/platform/entity-list/src/filter-defaults.ts:4`:

```ts
export const MAX_FALLBACK_QUICK_FIELDS = 4;
```

**Consequence on the Country route.** Country declares no `listPresentation` (verified:
`metadata/products/shared/entities/country/definition.json` has `listPresentation: null`), so this fallback
decides which of Country's fields are visible by default, via the literal `8`. Country publishes 22 fields;
the 8-field cut-off is therefore pure coincidence of the metadata order, and it cannot be tuned per entity
without editing shared server code.

**Fix.** `export const MAX_FALLBACK_VISIBLE_FIELDS = 8;` in
`packages/contracts/platform/entity-list/src/filter-defaults.ts` (or make the cap a metadata value on
`listPresentation`).

**Confidence: verified.**

---

### F15 — LOW — Stale documentation path after the route file rename

`docs/architecture/application-experience/entity-onboarding-boundaries.md:50`:

```text
    entity-read-page.tsx         Framework-injected server route adapter
```

`packages/platform/entity/runtime/form-detail/src/routes/` contains only `entity-read-route.tsx`
(`git status` records the rename `entity-read-page.tsx -> entity-read-route.tsx`). No `entity-read-page.tsx`
exists anywhere in the repo. Line 45 of the same document already lists the corrected contract-side path
(`entity-read-route.ts`), so the document is now internally inconsistent about the same concept.

**Fix.** Update the doc line, and grep the docs tree for the other renamed module
(`entity-read-runtime.tsx -> entity-read-surface.tsx`) — the only remaining stale reference I found is this one.

**Confidence: verified.**

---

### F16 — LOW — File name / exported symbol mismatch in the shared read route

`packages/platform/entity/runtime/form-detail/src/routes/entity-read-route.tsx` exports both
`renderEntityReadRoute` (line 10, matching the file name) and `createEntityReadPage` (line 15, not matching).
The package export map exposes it as `"./read-route": "./src/routes/entity-read-route.tsx"`
(`packages/platform/entity/runtime/form-detail/package.json`), and all three plane pages import
`createEntityReadPage` from `@athyper/platform-entity-form-detail/read-route`.

Separately, two different layers now ship a file with the same basename for different concepts:
`packages/contracts/platform/entity-runtime/src/routes/entity-read-route.ts` (URL shape resolution) and
`packages/platform/entity/runtime/form-detail/src/routes/entity-read-route.tsx` (React route adapter).

**Consequence.** Cosmetic; `read-route` is a reasonable subpath, but a reader scanning filenames cannot tell
a contract from an adapter. Not a bug.

**Fix.** Either export the subpath as `./read-page` (matching the factory) or rename the factory to
`createEntityReadRoute`. Optionally rename the platform file to `entity-read-page.tsx` so the two layers do not
share a basename.

**Confidence: verified.**

---

### F17 — LOW — Three competing test-placement conventions across server packages

| Package                                               | `src/*.test.ts` (colocated) | `src/__tests__/*.test.ts` | nested feature dirs |
| ----------------------------------------------------- | --------------------------- | ------------------------- | ------------------- |
| `server/packages/services/records`                    | 0                           | 41                        | 6                   |
| `server/packages/platform/experience`                 | 17                          | 0                         | 0                   |
| `server/packages/planes/studio/meta-entity-authoring` | 0                           | 49                        | 0                   |
| `server/packages/platform/governance`                 | 0                           | 0                         | 12                  |

Repo-wide: **84** `__tests__/` directories and **673** `*.test.ts(x)` files, with no stated rule. Each package
is mostly internally consistent, so this is a cross-package convention gap rather than chaos — but a
contributor cannot predict where a new test belongs, and `vitest.config.ts` include globs differ per package
(`server/packages/platform/governance/vitest.config.ts:2` and
`server/packages/planes/studio/meta-entity-authoring/vitest.config.ts:2` both use `src/**/*.test.ts`, which
covers both layouts).

**Fix.** Pick one — colocated `*.test.ts` beside the unit is the majority convention — document it in
`AGENTS.md`, and add it to the existing `tooling/scripts/policy/` checks.

**Confidence: verified.**

---

### F18 — LOW — No enforced rule for boolean naming; the same concept is named both `primary` and `isPrimary`

Measured: **658** distinct boolean identifiers in scoped source, of which **64 (~10 %)** carry an
`is`/`has`/`can`/`should` prefix and **594** do not. Many of the 594 are ordinary adjectives (`active`,
`enabled`, `required`, `open`) that read correctly as props, so this is a style gap rather than 594 bugs — but
the repo uses _both_ styles for the _same_ concept:

```ts
packages/platform/shell/shell/src/core.ts:30:                          readonly primary: boolean;
packages/platform/foundation/api-client/src/bootstrap.ts:14:            ... readonly primary: boolean; }
server/packages/platform/experience/src/contracts.ts:44:                readonly primary: boolean;
packages/contracts/neon/party/src/request-profile-values.ts:25:      readonly isPrimary: boolean;
server/packages/contracts/entity-governance/src/entity-change-case.ts:163:  readonly isPrimary?: boolean;
```

Most-used unprefixed booleans: `enabled` 24, `required` 20, `open` 19, `retryable` 17, `healthy` 15,
`disabled` 14, `loading` 12, `valid` 10. Most-used prefixed: `isPrimary` 12, `hasMore` 5, `requiresMfa` 5.

**Consequence.** A caller must remember which spelling each contract uses; `useAsyncResource`
(`packages/platform/entity/runtime/form-detail/src/use-async-resource.ts:20`) exposes `loading`, while nearby
code exposes `isPrimary`, so the shared entity API is not self-consistent.

**Fix.** Either enforce `is`/`has`/`can`/`should` in the new ESLint config for _exported_ booleans, or state in
`AGENTS.md` that plain adjectives are preferred and `is*` is reserved for derived/cached flags. Do not churn
the 594 sites without a decision.

**Confidence: verified** for the counts and the concrete pairs.

---

### F19 — LOW — Entity-specific editor/summary components shipped in the shared framework with fully hardcoded field shapes

`packages/platform/entity/runtime/form-detail/src/registered-renderers/contact-address.tsx:5` declares the
address shape as a literal type rather than reading it from metadata:

```ts
export type AddressDraft = Readonly<{
  line1?: string;
  line2?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
  purpose?: string;
  primary?: boolean;
}>;
```

and line 10 renders a fixed seven-field form with hardcoded English labels:

```tsx
{([['line1','Address line 1'],['line2','Address line 2'],['locality','City'],['region','Region'],['postalCode','Postal code'],['countryCode','Country code'],['purpose','Purpose']] as const).map(...)}
```

`AddressSummaryRenderer` at line 8 likewise special-cases `value.purpose`, `value.verified`, and passes raw
`value` into `PostalAddress`.

**Consequence.** This is the single largest "entity-specific code inside shared code" surface in the detail
package: a country whose postal format differs from `line1/locality/region/postalCode/countryCode` cannot be
expressed, even though Country metadata _does_ publish `address_format`, `postal_position`,
`postal_code_label` and `region_label` (`metadata/products/shared/entities/country/definition.json`) — the
metadata already carries exactly the information this component hardcodes. Any future entity that binds
`platform.address.editor.v1` gets this one layout.

**Fix.** Drive the address editor and summary from the owning entity's published field order and
`defaultText` labels (the same `detailValue`/`MetadataFields` path the rest of the detail surface uses), so
postal-position and region-label differences come from metadata.

**Confidence: verified** for the code and for Country's metadata keys; **probable** for how the address
renderer would be re-bound per entity (I did not trace every `rendererKey` binding site).

---

### F20 — LOW — Largest files and functions

Measured: **2 029** files / **262 134** lines. Largest authored source files (excluding generated
`packages/contracts/platform/dashboard/src/generated-defaults.ts`, 5 468 lines):

| Lines     | File                                                                          |
| --------- | ----------------------------------------------------------------------------- |
| **5 589** | `packages/platform/entity/runtime/list-view/src/index.tsx`                    |
| 3 549     | `packages/platform/gateway/bff-relay/src/index.ts`                            |
| 2 244     | `server/packages/services/records/src/transfer/transfer-service.ts`           |
| **2 100** | `packages/platform/entity/runtime/form-detail/src/comments-workspace.tsx`     |
| 1 893     | `server/packages/platform/experience/src/service.ts`                          |
| **1 758** | `packages/platform/entity/runtime/form-detail/src/attachments/collection.tsx` |
| **1 537** | `server/packages/services/records/src/entity-list-service.ts`                 |
| **1 446** | `packages/platform/ai/agent-runtime/src/index.ts`                             |

Largest top-level functions (measured by declaration-to-next-declaration distance):

| Lines      | Location                                                                         | Symbol                    |
| ---------- | -------------------------------------------------------------------------------- | ------------------------- |
| **~1 675** | `packages/platform/entity/runtime/form-detail/src/attachments/collection.tsx:85` | `AttachmentCollection`    |
| **~987**   | `packages/platform/entity/runtime/list-view/src/index.tsx:606`                   | `EntityCollectionRuntime` |
| **~703**   | `packages/platform/entity/runtime/list-view/src/index.tsx:1593`                  | `ListChrome`              |
| ~628       | `server/packages/services/records/src/entity-list-service.ts:106`                | `createEntityListService` |
| ~508       | `packages/platform/entity/runtime/list-view/src/index.tsx:2363`                  | `FilterDialog`            |

`list-view/src/index.tsx` alone holds **38** top-level declarations covering the whole list experience
(application shell, collection runtime, five dialogs, rows, selection bar, four value formatters, transport
error mapping, loading/error states). Directly relevant to the country route: `EntityCollectionRuntime`
(987 lines) and `ListChrome` (703 lines) are the two components that render `/app/entity/country/`.

**Consequence.** Review, blame and test scope for any Country list change is a 5 589-line file; the
`ListChrome` function alone holds both the i18n calls (2048) and the hardcoded literals (2144, 2151) cited in
F6, which is exactly the kind of mix a smaller module prevents.

**Fix.** Split `index.tsx` along its existing seams — it already has natural boundaries at
`FilterDialog` / `SortDialog` / `ColumnsDialog` / `SavedViewsDialog` / `DisplaySettingsDialog` / `GroupDialog`,
and the sibling package shows the intended granularity (`form-detail/src/` has 60+ single-purpose modules).
No behaviour change required.

**Confidence: verified** for file line counts and for `EntityCollectionRuntime`/`ListChrome` extents (declaration
list read directly); **probable** for `AttachmentCollection`'s ~1 675 (computed from declaration distance, not
brace matching).

---

## Top generalization opportunities, ranked by value ÷ risk

1. **Reference-directory messages (F9).** 3 call sites, 8 identical lines, mechanical extraction into one
   exported helper. Lowest risk, immediate payoff. Files:
   `packages/platform/entity/runtime/list-view/src/field-catalogue.tsx`,
   `packages/platform/entity/runtime/form-detail/src/reference-select.tsx`,
   `packages/platform/entity/runtime/collection-controls/src/filter-editor.tsx`.
2. **`IntlRuntime` adoption (F8).** Thread the already-in-scope runtime into `formatFieldValue`,
   `listCountLabel`, `list-pagination.tsx` and `detailValue`, deleting ~15 direct `Intl.*` constructions and
   fixing the list/detail divergence. Files: `list-view/src/index.tsx`,
   `list-view/src/list-pagination.tsx`, `list-view/src/data-operations.tsx`,
   `form-detail/src/related-record.tsx`. Behaviour change is intentional (tenant locale instead of browser
   locale) so it needs a visual/browser test.
3. **i18n completion for list chrome (F6).** Move 86 literals into
   `packages/platform/foundation/i18n/src/catalogs/entity-runtime.ts` and make
   `list-view/src/drawer-registry.tsx` hook-based. Contained, but touches many strings.
4. **Search/quick-filter ranking unification (F7).** Move `searchHint` next to `quickFilterPriority` in
   `packages/contracts/platform/entity-list/src/filter-defaults.ts` and rank by `semanticRole` only. Small and
   deletes a rule violation, but changes the search placeholder for every entity.
5. **Generic 360/related provider registry (F4).** Highest framework value, highest risk: replaces closed
   unions in `packages/contracts/platform/entity-runtime/src/record-360-panel.ts`,
   `related-presentation.ts` and `record-presentation.ts`, so it must be done with the publication/authoring
   path in the same change.
6. **Classification-driven export privacy (F5).** Replace the entity-name regex with a
   `classification`-driven check in `server/packages/services/records/src/transfer/transfer-service.ts`. A
   security-shaped change, so it needs a negative test per classification.
7. **`humanizeIdentifier` / `tenantScope` de-duplication (F10).** 9 + 3 sites, trivially safe, mostly
   mechanical.

---

## Verified healthy — do not churn

- **File naming is effectively universal.** Against 2 029 files, the only non-kebab-case basenames (excluding
  legitimate Next.js specials `page.tsx` / `route.ts` / `layout.tsx` / `loading.tsx` / `error.tsx` /
  `not-found.tsx` / `template.tsx` / `global-error.tsx` / `default.tsx` and TypeScript `index.ts(x)`) are
  `fixture.test-helper.ts`, `setup.test-helper.ts`, `record-history.postgres-case.ts` — see "checked but not a
  defect" below.
- **Zero Hungarian / `I`-prefixed types.** `grep -E '^(export )?(interface|type) I[A-Z]'` → **0**.
- **Handler prop naming is uniform.** `readonly on[A-Z]…` → **291** props; `readonly handle[A-Z]…` → **0**;
  `on*`-named exported functions → 3. No `handleX` vs `onX` split.
- **Factory verb is consistent.** `export function create*` → **375**; `export function make*` → **0**;
  `build*` → 9 and every one builds a derived request/key/projection rather than a service, so it is a
  different verb for a different operation, not a synonym.
- **Design-system discipline in the entity CSS.** Across the 6 CSS files under `packages/platform/entity/`:
  **0** hardcoded hex colours, **2 141** `var(--…)` token references, 686 size literals, and only **2** inline
  `style={{}}` in the whole entity tsx tree — both of which inject a CSS custom property typed as
  `CSSProperties` (`data-surface.tsx:268` `"--data-columns"`, `intake-surface.tsx:130` `"--intake-columns"`),
  not a raw value.
- **No TS suppression comments in source.** `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` → **0** in scoped
  source. `TODO` / `FIXME` / `HACK` → **0**. `console.log` outside tests/scripts → **0**.
- **`"use client"` coverage is complete.** All **50** files under `packages/platform/entity` that call
  `useState(`/`useEffect(` have the directive.
- **The Country route chain itself is thin and clean.** `apps/{neon,mesh,studio}/app/(shell)/app/entity/[entityCode]/[[...segments]]/page.tsx`
  are 4 lines each and byte-identical (`md5 3cb777216d40c0daa284d6b75f6828fc` ×3):
  `export default createEntityReadPage(notFound);`. There is no Country-specific app, route, API or component,
  which satisfies the AGENTS.md rule. `EntityReadSurface` is 23 lines with a single branch
  (`entity-read-surface.tsx:18-22`). The contract resolver is 18 lines
  (`packages/contracts/platform/entity-runtime/src/routes/entity-read-route.ts`) and validates both the entity
  code and the record id before returning.
- **Test import resolution is clean apart from F1.** I resolved every relative import in all **518** test
  files: exactly **5** unresolved specifiers, and they are the four suites of F1 (three of them failing on
  their own first import plus the fixture path).
- **The new metadata-only ranking module is a genuine improvement in flight.**
  `packages/contracts/platform/entity-list/src/filter-defaults.ts` correctly derives quick filters from
  `semanticRole` and its doc comment states the rule that `searchHint` (F7) still violates. Keep it; migrate
  `searchHint` to it rather than reverting.
- **The renamed route adapter is consistent at runtime.** `entity-read-route.tsx` and `entity-read-surface.tsx`
  are both wired through the existing `notFound` callback contract and both have live consumers; no code
  references the old `entity-read-page` / `entity-read-runtime` names (only the stale doc line, F15).

---

## Checked but not a defect

- `fixture.test-helper.ts`, `setup.test-helper.ts`, `record-history.postgres-case.ts` — flagged as
  non-kebab-case by a naive `name.ext` regex, but they are `name.test-helper.ts` / `name.postgres-case.ts`
  (two suffix segments). Crucially they **do not match** the vitest include globs used by their packages
  (`server/packages/platform/governance/vitest.config.ts:2` → `src/**/*.test.ts`), so they are not collected
  as empty suites. Verified; not a rule-9 failure.
- `packages/platform/entity/runtime/form-detail/src/entity-lookup.tsx:255` —
  `void adapter.resolveRecent(ids, controller.signal).then(...).catch(() => {});`. A swallowed rejection, but
  line 257 documents the intent (`/* Optional device history. */`) and line 256 is the same
  `try { … } catch { /* … */ }` shape for the `JSON.parse`. Deliberate optional-feature path;
  currently the recent-lookup panel simply stays empty on failure.
- `packages/platform/entity/runtime/form-detail/src/use-async-resource.ts:36` —
  `}, [key, reloadEpoch, ...deps]);`. A variable-length dependency array is normally a React hazard, but both
  call sites pass fixed-length arrays: `entity-detail-runtime.tsx:50` `[client, entityCode, recordId]` and
  `entity-form-runtime.tsx:62` `[client, entityCode, mode, recordId]`. The hook also documents why
  (`:35` "`load` closes over `deps`; the caller lists them explicitly"). No violation found.
- `LIST_DRAWERS` in `drawer-registry.tsx:9` uses SCREAMING_SNAKE_CASE for a frozen module-level table
  containing functions. Consistent with the other 13 SCREAMING constants in the entity packages
  (`MAX_FALLBACK_QUICK_FIELDS`, `ENTITY_LIST_MAX_FILTERS`, `GOVERNED_WORKFLOW_CONTRACT_VERSION`, …) and with
  42 camelCase exported consts elsewhere. No single rule, but not incoherent — a naming decision, not a bug.
- `packages/planes/studio/business-partner/` containing only `node_modules/` is _not_ my finding — the
  package was legitimately removed (`870f08f52`). The defect is the stale test imports (F1).
- `formatFieldValue`'s country branch is wrapped in `try { … } catch { return String(value); }`
  (`list-view/src/index.tsx:5147-5155`), so an invalid region code degrades to the raw code rather than
  throwing. The defect in F8 is the bypassed runtime, not error handling.
- `packages/platform/entity/runtime/form-detail/src/use-section-resource.ts` (618 lines) does **not** reuse
  `use-async-resource.ts` (44 lines), but I read both: `use-section-resource` owns a section-level cache with
  `invalidateEntityRuntimeRecord` / `subscribeEntityRuntimeRecord` / `mergeSectionPages` and cross-component
  subscription, while `useAsyncResource` is a plain keyed fetch with stale-result suppression. Different
  concerns, not a duplicated implementation. Not recommended for merging.
- `packages/platform/entity/runtime/form-detail/src/data-surface.tsx:268` and
  `intake-surface.tsx:130` inline `style={{ "--x": n } as CSSProperties}` — this is how a column count is
  passed to CSS grid, and `policy:style-tokens` owns the enforcement boundary. Not a token bypass.
- The `country_code` special case at `server/packages/services/records/src/entity-list-service.ts:868`
  (`valueKind: field.list?.semanticRole === "country_code" ? "reference" : field.type`) and `:1386-1390`
  (operator narrowing) are deliberate server-side rules that make the Country _reference_ column filterable as
  a closed set. They are the same class of hardcoded role as F7, but they are server-authoritative and
  consistent with each other, whereas the client re-derives the same knowledge from labels. Reported as part
  of F7/F8 rather than separately.
- `packages/platform/entity/runtime/form-detail/src/record/record-summary-panel.tsx:161` and `:183`
  ("Address purpose label unavailable", `? "Available"`) are hardcoded English, subsumed by F6/F19; not
  listed separately to avoid padding.
- `server/packages/planes/studio/meta-entity-authoring/src/__tests__/runtime-restoration.test.ts:124`
  uses `.find((f:any)=>…)` — an untyped accessor inside a test; covered by F3's counts, not a separate finding.
