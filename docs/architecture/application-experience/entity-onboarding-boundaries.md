# Native entity onboarding boundaries

Status: Stage 3 implemented for the Country path, 2026-09-28. This is not a
Business Partner migration or a new publication. Existing signed releases and
Country capability settings are unchanged.

## Identity and validation

New native entities use one canonical code grammar: `^[a-z][a-z0-9_]{1,62}$`.
Codes have 2–63 ASCII characters, start with a lowercase letter, and contain only
lowercase letters, digits and underscores. Identity is never trimmed, lowercased
or otherwise rewritten. `country` is valid; `Country`, `example.country`,
`example-country`, a single character and overlong codes are invalid.

The contract-owned `isCanonicalEntityCode` predicate is reused by native route
resolution, route admission, Studio graph validation, reference-product authoring,
authoring notification inspection and collection compilation bindings. One-character
product identities now fail at the source parser instead of later graph validation.

Do not confuse native entity codes with artifact keys, permission codes, module
codes, SQL identifiers or namespaced subject types. Older general record/API and
artifact contracts support wider identifier domains; those compatibility paths are
not globally narrowed in this Country-only change. They are not the grammar to copy
for new native onboarding. No legacy identifier or Business Partner metadata was renamed.

Only genuinely identical shape predicates are shared:

- `isObjectRecord`: non-null object, excluding arrays. It deliberately preserves
  existing object semantics rather than introducing a new plain-object policy.
- `isBoundedNonBlankText`: nonblank text bounded before trimming. Callers retain
  their own maximum, trimming behavior and error message.

UUID version/variant rules, raw versus `sha256:` hashes, timestamps, reference-key
grammars, required keys and error codes remain owned by their purpose-specific
contracts. In particular, a route's UUID-shaped record identifier is a syntactic
check, not storage validation or permission to read that record.

## Folder and dependency ownership

```text
packages/contracts/platform/entity-runtime/src/
  validation/
    entity-code.ts              Canonical native entity identity
    values.ts                   Shared shape predicates only
  routes/
    entity-read-route.ts         List/manage/detail URL shape

packages/platform/entity/runtime/form-detail/src/
  routes/
    entity-read-page.tsx         Framework-injected server route adapter
  attachments/
    uploader.tsx                Upload queue, validation and retry lifecycle
    collection.tsx              Browse, actions, search and preview composition
    upload-context.tsx          Single shared disclosure context
  attachment-workspace.tsx      Stable compatibility exports

metadata/products/shared/entities/country/
  definition.json               Country fields, labels, sections and bindings
  capabilities.json             Country collaboration declarations

server/packages/planes/studio/meta-entity-authoring/src/authoring/
  product.ts                    Validated product-to-graph boundary
  graph-builder.ts              Explicit descriptors and plane coordinates
```

Contracts do not import UI, Next.js or server services. The shared route adapter
accepts a `notFound` callback instead of depending on Next.js. The attachment entry
point retains its existing exports, so consumers need not change paths together.
Uploader and collection share one context instance; duplicating it would break
disclosure behavior. This is an incremental split, not a claim that every large
runtime file has been decomposed.

Country's domain configuration stays in its metadata source and published
descriptors. Shared UI must not add entity-name dispatch or direct Country SQL.
Future domain behavior belongs in an explicitly registered extension or descriptor
binding, with its own authorization and qualification tests.

## Plane adapters: share mechanics, preserve policy

Studio and Mesh use the same native read-page factory. Neon's native fallback uses
the same renderer and route validation; its catalog, entitlement and application
layout branches remain unchanged. `/manage` remains the list surface, not new write
permission. Unsupported nested routes remain 404.

The adapter never chooses a database, grants access, copies data between planes or
infers publication targets. Each host's session/API client and active descriptor
still select its own plane. Country's compiled runtime profiles, scope bindings and
operation permissions retain their plane coordinates and fail-closed tenant scope.
Targets remain explicit; a Neon-only product cannot compile for Mesh. Both `list`
and `read` stay read operations; collaboration has its separate published policy.

## Verification and future onboarding gate

### Supported Country URLs

On Studio, Neon and Mesh, the canonical native read URLs are
`/app/entity/country`, `/app/entity/country/manage`, and
`/app/entity/country/<record UUID>`. Manage selects the authorized list surface;
it does not grant edit permission. Native adapters and API authorization are
shared; plane-specific published descriptors still govern available operations.
The generated platform catalog currently contains no Country registration.
Do not invent workspace/module aliases or copy Neon's legacy catalog overlays
into Studio/Mesh. Introduce aliases only alongside an explicitly registered,
authorized catalog entry and plane-specific route tests.

`pnpm test:country-browser` is required by `test:root` and therefore `test:repo`.
Install the matching Playwright Chromium and OS dependencies before running it
(`pnpm exec playwright install --with-deps chromium`). Fixtures exercise real UI
components without requiring DEV credentials. Signed-in manual acceptance remains
a separate release check. Release 8's passed acceptance record is retained.

The Stage 3 checks cover:

- Entity code boundaries, whitespace/case rejection and no implicit normalization.
- Actual Studio/Mesh page exports and Neon's shared fallback, including invalid-route
  behavior, list/manage equivalence and record identity preservation.
- Country compilation for all three planes, plane-specific runtime profile identities,
  target exclusions, permission/scope coordinates and historical descriptor hashes.
- Stable presentation parser errors and purpose-specific label lengths.
- Attachment upload retries, disclosure persistence, version history, previews,
  search, drafts, navigation, tenant changes, light/dark themes and RTL behavior.
- Shared-only detail imports: summary and localization dependencies are explicitly
  allowed; no domain/product import was introduced.

Local verification: 89 existing browser regressions plus the new plane-adapter test
passed. The identity/navigation/descriptor/localization/route-admission Node suites
passed all 34 tests. Studio authoring passed 214 tests, including historical compiled
hash assertions. Studio, Mesh and Neon application typechecks passed, alongside the
changed contract/runtime/server packages. The localization test fixture was updated
to supply the previously added export message's `jobId`; production translation
behavior was not changed by this step.

Additional compatibility suites passed: publication 368 tests, metadata contracts
63 tests, and experience 153 tests. Purpose-specific identifier validation and
existing permission/entitlement behavior remain covered by those suites.

Before wider onboarding, continue using these shared contracts and adapters rather
than copying route regexes or plane pages. Qualify changed compiler fingerprints
through the normal governed workflow before any future successor publication.
This refactor did not deploy, activate, mutate live records or rewrite signed payloads.
