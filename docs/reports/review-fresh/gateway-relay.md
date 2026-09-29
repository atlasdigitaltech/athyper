# Audit: BFF relay gateway and app relay adapters

Area: `packages/platform/gateway/bff-relay` + the three plane relay adapters and relay contract tests.
Method: full read of `packages/platform/gateway/bff-relay/src/index.ts` (all 3549 lines), all three
`apps/{neon,mesh,studio}/lib/relay.ts`, all three `apps/*/app/api/relay/[...path]/route.ts`, all three
`apps/*/lib/catalog-routes.ts`, and all six relay test files. Duplicate/shadowing analysis and plane
composition were computed by loading the real module (`node --experimental-transform-types`) and replaying
the exact operation lists from the app files, not by eyeballing.

Independent derivation: no pre-existing review under `docs/reports/` was read.

## 0. Measured inventory

| Metric | neon | mesh | studio |
|---|---|---|---|
| `apps/<plane>/lib/relay.ts` lines | 139 | 44 | 56 |
| Effective allowlist operations | 274 | 129 | 185 |
| Operations inherited from `COMMON_PLANE_RELAY_OPERATIONS` | 114 | 113 | 113 |
| Plane-specific operations | 160 | 16 | 72 |
| Distinct operation ids | 273 | 129 | 177 |
| Duplicated `id` (and `method + path`) | 1 (`attachments.browse`) | 0 | 4 ids, 8 extra entries |
| Cross-template shadowing pairs (a more-general template earlier in the list) | 0 | 0 | 0 |
| `requiresTenant === false` | only `iam.me` | only `iam.me` | only `iam.me` |
| `maxBodyBytes` unset (falls back to 1 MiB default) | 126 | 62 | 68 |
| `idempotency: "required"` | 91 | 49 | 58 |
| requestClass upload / download / stream | 2 / 3 / 2 | 2 / 3 / 2 | 2 / 3 / 2 |

Other measurements:

* `packages/platform/gateway/bff-relay/src/index.ts`: 3549 lines, 196 exports,
  `COMMON_PLANE_RELAY_OPERATIONS` = 113 operations.
* `apps/*/app/api/relay/[...path]/route.ts`: 9 lines each, byte-identical
  (all three md5 `5a0d98c4d78297c98897380f78701906`).
* `apps/{mesh,studio}/lib/catalog-routes.ts` are identical modulo the plane name (`diff` after
  substituting the plane name: no differences). `apps/neon/lib/catalog-routes.ts` is 188 lines.
* `apps/mesh/lib/relay.ts:15-36` and `apps/studio/lib/relay.ts:21-42` differ only in the
  `plane:` literal.
* `pnpm --dir packages/platform/gateway/bff-relay exec tsc --noEmit` → exit 0 (the gateway package
  typechecks clean, including the undeclared `allowedQuery` fields, see finding 2).
* Relay contract tests: 6 files, 822 lines. Executed all of them with
  `tsx --test tests/contracts/{bff-relay-security,app-relay-composition,relay-common-plane-operations,studio-authoring-relay,notification-authoring-relay,bp-intake-protection-relay}.test.ts`
  → **52 tests, 52 pass, 0 fail**. No relay test imports a module that does not exist.
* No write operation anywhere in the exported allowlists has `maxBodyBytes: 0` (a write with a zero
  body limit would 413 every request). Scan over all exported operation arrays: 0 hits.

## Findings

### 1. HIGH — the shared record-attachment download/preview/search operations are allowlisted only on neon, so they 404 on mesh and studio

Citations:

* `packages/platform/gateway/bff-relay/src/index.ts:499-506` (definition)
* `packages/platform/gateway/bff-relay/src/index.ts:2289-2313` (only membership site)
* `packages/platform/gateway/bff-relay/src/index.ts:539-548` and `:3527-3549` (common group that omits them)
* `apps/neon/lib/relay.ts:53` (neon spreads `BUSINESS_PARTNER_RELAY_OPERATIONS`; mesh/studio do not)

```ts
// index.ts:499-506
export const ATTACHMENT_DOWNLOAD_OPERATION: RelayOperation = Object.freeze({
  id: "attachments.download",
  method: "POST",
  path: "/api/attachments/:attachmentId/download",
  requestClass: "json",
  requiresTenant: true,
  maxBodyBytes: 4096,
});
```

```ts
// index.ts:2288-2313 — inside BUSINESS_PARTNER_RELAY_OPERATIONS (line 2202)
    PERSON_RESTRICTED_EVIDENCE_REVEAL_OPERATION,
    ATTACHMENT_DOWNLOAD_OPERATION,
    {
      id: "attachments.preview",
      method: "POST",
      path: "/api/attachments/:attachmentId/preview",
      ...
    },
    {
      id: "attachments.search",
      method: "POST",
      path: "/api/attachments/search",
      ...
    },
```

The common attachment group (`ATLAS_ANSWER_RELAY_OPERATIONS`, lines 526-573, folded into
`COMMON_PLANE_RELAY_OPERATIONS` at line 3539) registers only
`attachments.stage`, `.finalize`, `.status`, `.browse`, `.remove`, `.rename`, `.folder`, `.category`,
`.archive` and `.archive-outcome`. `download`, `preview` and `search` exist only in
`BUSINESS_PARTNER_RELAY_OPERATIONS`, which only neon spreads (`apps/neon/lib/relay.ts:53`).

Measured per plane (script replay of the real composition):

```
POST   /api/attachments/:attachmentId/download   neon:YES  mesh:--  studio:--
POST   /api/attachments/:attachmentId/preview    neon:YES  mesh:--  studio:--
POST   /api/attachments/search                   neon:YES  mesh:--  studio:--
POST   /api/attachments/:attachmentId/finalize   neon:YES  mesh:YES studio:YES
```

These are **shared** framework operations, not business-partner-specific ones:

* `packages/platform/entity/runtime/form-detail/src/collaboration-operations.tsx:97-101`
  `attachmentDownload` → `POST /api/attachments/${id}/download`
* `packages/platform/entity/runtime/form-detail/src/collaboration-operations.tsx:11-13`
  `attachmentPreview` → `POST /api/attachments/${id}/preview`
* `packages/platform/entity/runtime/form-detail/src/file-search.tsx:94`
  `{ method: "POST", path: () => "/api/attachments/search" }`

Consumers of those calls: `attachment-download.ts:10` (used by
`attachments/collection.tsx:466`, `comments-workspace.tsx:2056`, `attachment-reference.tsx:16`),
`attachment-thumbnail.tsx:55`, `attachment-preview.tsx:35`, and the file-search UI in
`attachments/collection.tsx` (imports at `:27`).

Country explicitly advertises these actions and is published to all three planes
(`metadata/products/shared/entities/country/definition.json` `"planes": ["studio","neon","mesh"]`):

* `metadata/products/shared/entities/country/capabilities.json:114` `"capabilityKey": "attachments", "enabled": true`
* `:151` `"key": "download"` with `"handlerKey": "platform.attachments.download.v1"`
* `:200` `"key": "preview"`, `:207` `"key": "extract"`
* `:239-240` `"preview": true, "extraction": true`

Consequence on the shipped Country route: on `mesh.dev.athyper.test` and
`studio.dev.athyper.test`, a user opening a Country record and (a) clicking download, (b) rendering an
attachment thumbnail/preview, or (c) using file search inside the attachments collection gets
`404 RELAY_OPERATION_NOT_ALLOWED` from the relay (finding is not visible on
`neon.dev.athyper.test`, which is why the drift is easy to miss). The upstream is never called, so
this is a hard, user-visible feature break on two of the three planes.

What I checked for mitigation and why it does not apply:

* No other plane-specific group adds the same paths. I replayed all three effective lists; the table
  above is the full result.
* No plane-side gate hides the action on mesh/studio: the capability declaration is shared metadata
  and the shared component (`attachments/collection.tsx`) does not consult the relay allowlist.
* No test asserts plane parity for these three operations. `tests/contracts/bff-relay-security.test.ts:372-385`
  asserts only `stage`, `finalize`, `category`, `archive` in the *common* group — i.e. the test codifies
  the subset that happens to live in COMMON, and never notices that three sibling operations live in a
  neon-only group used by the same shared runtime.

Fix: move `ATTACHMENT_DOWNLOAD_OPERATION`, `attachments.preview` and `attachments.search` into
`ATLAS_ANSWER_RELAY_OPERATIONS` (or a new `ATTACHMENT_RELAY_OPERATIONS` composed into
`COMMON_PLANE_RELAY_OPERATIONS`), leaving tenant/record authorization to the upstream as it already is
for the other attachment operations. Add a contract test that every operation used by
`packages/platform/entity/runtime/**` exists in every plane's effective allowlist.

Confidence: **verified**.

### 2. MEDIUM — `allowedQuery` is written into 9 operations, is not part of the `RelayOperation` type, and is never enforced (dead security control)

Citations:

* `packages/platform/gateway/bff-relay/src/index.ts:6-15` — `RelayOperation` has no `allowedQuery`
* `packages/platform/gateway/bff-relay/src/index.ts:211, 2200, 2211, 2222, 2234, 2242, 2262, 2277, 2672` — the only 9 occurrences in the repository
* `packages/platform/gateway/bff-relay/src/index.ts:2896-2905` — the query is forwarded with no check

```ts
// index.ts:6-15
export interface RelayOperation {
  readonly id: string;
  readonly method: RelayMethod;
  readonly path: `/api/${string}`;
  readonly requestClass?: RelayRequestClass;
  readonly requiresTenant?: boolean;
  readonly tenantParam?: string;
  readonly idempotency?: "none" | "optional" | "required";
  readonly maxBodyBytes?: number;
}
```

```ts
// index.ts:2672-2673 (one of the 9 sites, on an operation that intends to reject all query)
      id: "notifications.deliveries.list",
      method: "GET",
      path: "/api/operations/notifications/deliveries",
      requiresTenant: true,
      allowedQuery: ["before"],
```

```ts
// index.ts:2898-2903 — forwarding
          const upstream = await fetcher(
            new URL(
              `${normalizedPath}${new URL(request.url).search}`,
              runtime,
            ).toString(),
            init,
          );
```

Why it is wrong: the field reads like an allowlist of query parameter names (`allowedQuery: []`
appears on 6 mutating governance operations), implying query parameters are rejected or filtered.
It is neither type-checked (`not in RelayOperation`, and `Object.freeze([...])` suppresses the excess
property check — `tsc --noEmit` passes, verified) nor read anywhere (repository-wide grep for
`allowedQuery` finds only these 9 definitions; `createRelayHandler` never references it). The real
behaviour is the opposite: the entire client query string is concatenated onto the upstream URL for
every operation.

Consequence on the shipped Country route: none by itself for the list/descriptor calls (they need
query parameters, and the relay forwards them — which is the desired behaviour). The defect is that a
security-relevant control that reviewers will read as enforced is not implemented, and any future
operation added with `allowedQuery: []` expecting query to be blocked will silently accept it.

What I checked for mitigation:

* `tests/contracts/bff-relay-security.test.ts:195-205` explicitly asserts arbitrary query forwarding
  (`?companyCodeId=company&legalEntityId=legal&operatingOrganizationId=org` on
  `application-descriptor`, `?limit=50` on `records/transfers`). So unlimited query forwarding is the
  *tested* behaviour, which confirms the field is vestigial rather than a recently broken gate.
* I looked for an upstream route that would let a query parameter override tenant/plane authority
  (`searchParams.get("tenant")`, `query.tenantId` on the HTTP boundary, etc.). Tenant scope in the
  services comes from the request context, not from a query parameter; I did not find an exploit path.
  Severity is therefore medium (unenforced/misleading control), not critical.

Fix (choose one, do not leave the half state): either add `readonly allowedQuery?: readonly string[]`
to `RelayOperation` and enforce it in the handler before forwarding (`new URL(request.url).searchParams`
keys ⊆ `operation.allowedQuery`, otherwise `400 RELAY_QUERY_NOT_ALLOWED`), or delete the 9 fields so the
configuration stops advertising a control that does not exist. Given finding 1's scope, deleting the
fields is the lower-risk change; enforcing them requires auditing every client call site.

Confidence: **verified** for "declared but never read"; **not verified** that any client uses a
forbidden query parameter.

### 3. MEDIUM — `STUDIO_BP_CASE_CONTRACT_RELAY_OPERATIONS` is derived with `String.replace` and silently clones 4 unrelated operations twice, producing duplicate ids and duplicate `method + path`; no uniqueness invariant exists

Citations:

* `packages/platform/gateway/bff-relay/src/index.ts:3320-3337` (derivation)
* `packages/platform/gateway/bff-relay/src/index.ts:1051-1076` (source group containing 4 operations without the replaced substring)
* `packages/platform/gateway/bff-relay/src/index.ts:2955-2973` (`compileOperation`, no duplicate check)
* `packages/platform/gateway/bff-relay/src/index.ts:2974-3000` (`findOperation`, first match wins)
* `apps/studio/lib/relay.ts:52-53` (both groups spread into the studio plane)
* `tests/contracts/relay-common-plane-operations.test.ts:15-20` (the only uniqueness assertion, COMMON only)

```ts
// index.ts:3320-3337
export const STUDIO_BP_CASE_CONTRACT_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze(
    STUDIO_BP_DEFINITION_RELAY_OPERATIONS.flatMap((operation) =>
      [
        "business-partner-case-contracts",
        "business-partner-company-case-contracts",
      ].map((resource) =>
        Object.freeze({
          ...operation,
          id: operation.id.replace("business-partner-definitions", resource),
          path: operation.path.replace(
            "business-partner-definitions",
            resource,
          ) as RelayOperation["path"],
        }),
      ),
    ),
  );
```

`STUDIO_BP_DEFINITION_RELAY_OPERATIONS` (lines 1051-1076) is not homogeneous: four of its eight
entries are task-rule/task-policy operations that do not contain the substring
`business-partner-definitions`:

```ts
// index.ts:1053-1071
    Object.freeze({
      id: "studio.task-rules.baselines",
      method: "GET" as const,
      path: "/api/studio/supplier-task-rule-baselines",
      ...
    }),
    ...(["author", "read", "publish"] as const).map((action) =>
      Object.freeze({
        id: `studio.task-edit-policy.${action}`,
        ...
        path: `/api/studio/task-edit-policies${action === "author" ? "" : "/:id"}${action === "publish" ? "/publish" : ""}`,
```

`replace()` returns the string unchanged when the substring is absent, so each of those four
operations is emitted twice with an identical `id`, `method` and `path`. Measured on the real export:
`STUDIO_BP_CASE_CONTRACT_RELAY_OPERATIONS.length === 16`, with

```
studio.task-rules.baselines       : 2
studio.task-edit-policy.author    : 2
studio.task-edit-policy.read      : 2
studio.task-edit-policy.publish   : 2
(the four real definition operations × 2 resources: 8 entries, 1 each)
```

Effect on the studio plane's effective list: 185 entries, 177 distinct ids, and these four
`method + path` keys appear **3×** each (base group at `apps/studio/lib/relay.ts:52` plus the two
verbatim clones at `:53`):

```
GET  /api/studio/supplier-task-rule-baselines
POST /api/studio/task-edit-policies
GET  /api/studio/task-edit-policies/:id
POST /api/studio/task-edit-policies/:id/publish
```

Why it is wrong: `createRelayHandler` maps every operation through `compileOperation` (line 2707) and
never checks for duplicate ids or duplicate templates, so the allowlist silently accepts a derived
group that means something different from its name. The derived constant is named for case contracts
but allowlists task-rule/task-policy routes. Today the duplicates are byte-identical so
first-match-wins routing produces the same behaviour, which is exactly why this passes unnoticed —
but the composition is a latent shadowing hazard: if a task-* operation in the base group is later
edited (or if the clone is ever given a fallback/default), the two copies diverge and the first entry
wins for the studio plane.

What I checked for mitigation:

* Replayed the studio effective list through the exact `findOperation` comparison logic: the four
  duplicated keys are identical objects, so no request is misrouted **today**. I also scanned every
  ordered pair of studio operations for a genuinely more-general-but-earlier template and found
  0 cross-template shadows.
* The existing uniqueness test (`relay-common-plane-operations.test.ts:15-20`) only covers
  `COMMON_PLANE_RELAY_OPERATIONS`, which does not contain this derived group.
* The endpoint that the test does exercise (`tests/contracts/studio-authoring-relay.test.ts:82-136`)
  only asserts CSRF/idempotency on the cloned route, not that the clone set is exactly the four
  case-contract operations.

Fix: derive only from the definition operations, e.g. build an explicit array of the four
`STUDIO_BP_DEFINITION_*_OPERATION` constants and replace over that, or guard the clone with
`if (!operation.path.includes("business-partner-definitions")) throw new TypeError(...)` so a
future rename fails loudly instead of duplicating. Independently, add a duplicate check to
`compileOperation`/`createRelayHandler` (throw on repeated `id` or repeated `method + path`) and
extend the contract test to assert uniqueness for each plane's effective list.

Confidence: **verified** (counts and duplicate keys measured on the real module).

### 4. LOW (probable) — the second `replace()` derivation site clones the business-partner case operations onto an upstream path that has no registration in this tree

Citations:

* `packages/platform/gateway/bff-relay/src/index.ts:1566-1592`
* `packages/platform/gateway/bff-relay/src/index.ts:2270-2281` (the derived group is spread into `BUSINESS_PARTNER_RELAY_OPERATIONS`)
* `apps/neon/lib/relay.ts:53` (neon only)

```ts
// index.ts:1578-1591
    ].flatMap((operation) => [
      operation,
      Object.freeze({
        ...operation,
        id: operation.id.replace(
          "business-partner-cases",
          "business-partner-company-setup-cases",
        ),
        path: operation.path.replace(
          "business-partner-cases",
          "business-partner-company-setup-cases",
        ) as RelayOperation["path"],
      }),
    ]),
```

Here `replace()` does fire (every source operation id/path contains `business-partner-cases`), so the
clone is coherent: 9 original + 9 clones = 18 operations, targeting
`/api/neon/business-partner-cases…` and `/api/neon/business-partner-company-setup-cases…`.
A repository-wide search for the literal `business-partner-company-setup-cases` finds only the gateway,
`tests/contracts/studio-authoring-relay.test.ts:96`, and archived governance artifacts — no TypeScript
route registration in `server/` matches `/api/neon/business-partner-cases` or its `-company-setup-cases`
variant, even though `governance/config/governance/business-partner-phase0.v1.json:129-178` lists the
base paths as expected routes.

Mitigation/uncertainty I found: `governance/policy/reports/business-partner-company-correction-only-smoke-20260912.dev.json:11`
records `{"path": "/api/neon/business-partner-company-setup-cases", "status": 401}` for a deployed
image, i.e. the route was reachable (401, not 404) at that point. The route therefore probably exists
at runtime through a mechanism not visible as a literal in this tree. I am reporting the derivation
pattern, not a confirmed dead endpoint: `.replace()` cannot tell "renamed" from "not present", the
same fragility as finding 3, and the mirrored resource is only validated by a test whose `fetch` stub
always returns 403 (`studio-authoring-relay.test.ts:111-114`).

Fix: guard the replacement (throw when `path` lacks the substring) and, if
`business-partner-company-setup-cases` is no longer served, delete the clone block; if it is served,
add a route-registration assertion so the mirrored allowlist cannot outlive the endpoint.

Confidence: **probable** for the endpoint absence; **verified** for the code shape and the missing
literal registration.

### 5. LOW — the neon plane's effective allowlist contains a duplicate `attachments.browse` entry

Citations:

* `packages/platform/gateway/bff-relay/src/index.ts:544` (common group) and `:2314` (business-partner group)
* `packages/platform/gateway/bff-relay/src/index.ts:6-15` / `2974-3000` (no duplicate detection; first match wins)

`ATTACHMENT_BROWSE_OPERATION` is a member of `ATLAS_ANSWER_RELAY_OPERATIONS` (line 544, inherited by
every plane through `COMMON_PLANE_RELAY_OPERATIONS`) and is spread again by
`BUSINESS_PARTNER_RELAY_OPERATIONS` (line 2314), which neon adds. Measured: neon 274 entries vs 273
distinct ids; the duplicate `method + path` key is `POST /api/attachments/browse` (2×). The duplicated
objects are identical, so there is no behaviour change today; it is the same missing-invariant class as
finding 3 and makes the neon list size misleading. Fix: remove line 2314 (the common group already
covers it) and add the per-plane uniqueness assertion.

Confidence: **verified**.

### 6. LOW — client-supplied tracing identifiers are forwarded to the API verbatim

Citations:

* `packages/platform/gateway/bff-relay/src/index.ts:116-130` (`SAFE_REQUEST_HEADERS`)
* `packages/platform/gateway/bff-relay/src/index.ts:3039-3053` (`requestHeaders`)

```ts
// index.ts:116-130
const SAFE_REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "content-type",
  "if-match",
  ...
  "traceparent",
  "tracestate",
  "x-request-id",
  "x-correlation-id",
]);
```

The allowlist itself is correct and is the right shape (everything else is dropped, and the relay's own
authority headers are overwritten at lines 2868-2874: `authorization`, `x-plane`, `x-realm`,
`x-principal-id`, `x-auth-epoch`, `x-tenant-id`). The residual issue is that `x-request-id`,
`x-correlation-id`, `traceparent` and `tracestate` are accepted from the browser, so a client can
choose the correlation id/trace context that appears in API logs and traces.

Checked for mitigation: values are not echoed back unchecked — response-side echoing filters ids
through `safeIdentifier` (`index.ts:3240-3243`) and `problem()` re-validates `requestId`
(`index.ts:3296`), so this is log/trace metadata spoofing, not header injection or an auth bypass.
Impact on the Country route is operational only. Fix (optional hardening): generate
`x-request-id`/`x-correlation-id` server-side when absent and only forward `traceparent`/`tracestate`
when they parse as W3C trace context.

Confidence: **verified**.

### 7. LOW — allowlist membership is observable before authentication

Citations:

* `packages/platform/gateway/bff-relay/src/index.ts:2720-2733`

```ts
// index.ts:2720-2733
      if (
        !requestPath.startsWith("/api/relay/") ||
        RAW_PATH_ATTACK.test(requestPath)
      )
        return problem(400, "RELAY_INVALID_PATH", "Relay path is invalid");
      const normalizedPath = normalizePath(path);
      const method = request.method.toUpperCase() as RelayMethod;
      const match = findOperation(operations, method, normalizedPath);
      if (!match)
        return problem(
          404,
          "RELAY_OPERATION_NOT_ALLOWED",
          "The requested platform operation is not allowlisted",
        );
      const { operation, params } = match;
      const session = await options.session.resolve(request);
```

An anonymous caller gets `404 RELAY_OPERATION_NOT_ALLOWED` for an unlisted path but `401` for a listed
one, i.e. the allowlist can be enumerated without a session. Impact is low: the allowlist is compiled
into the client, so it is not a secret. Fix (optional): resolve the session first, or return the same
`401` for both outcomes.

Confidence: **verified**.

### 8. LOW — plane relay composition is copy-pasted, not generalized

Citations:

* `apps/neon/lib/relay.ts:27-138`, `apps/mesh/lib/relay.ts:15-43`, `apps/studio/lib/relay.ts:21-55`
* `apps/*/app/api/relay/[...path]/route.ts` (9 lines each, byte-identical, md5 `5a0d98c4d78297c98897380f78701906`)
* `apps/mesh/lib/relay.ts:31` and `apps/studio/lib/relay.ts:37` (declared-and-unused `environment`)

Every plane repeats the same three constructs: the `createLazyRelay(() => createAppRelay({...}, process.env))`
bootstrap, the `createAppRelay(options: Omit<Parameters<typeof createRelayHandler>[0], "plane" | "operations">, environment)` signature, and the identical 5-method route module. The only differences are the
`plane` literal and the operation list. The `environment` parameter is used only by neon (for the
`LOCAL_CONTACT_CHALLENGE_ENABLED` / `LOCAL_MASTER_DATA_PILOT_ENABLED` pilots at
`apps/neon/lib/relay.ts:66-136`); mesh and studio declare it and never read it, which suggests the
signature was copied rather than designed.

Measured duplication: 27 identical route lines; `apps/mesh/lib/relay.ts:15-36` vs
`apps/studio/lib/relay.ts:21-42` differ only by the plane name; per-plane composition is
113 shared + {160, 16, 72} plane-specific operations, so ~87 % of the mesh list and ~61 % of the
studio list is boilerplate-free but the wrapper is not.

Fix: export a `createPlaneRelay({ plane, operations, environment })` (or `createAppRelayFactory`)
from `packages/platform/gateway/bff-relay` and a single re-exportable route handler
(`export { platformRelay as GET, ... }` from a shared module), leaving each app file as a
plane constant plus its operation list. This is a generalization opportunity, not a defect: the
current duplication is small and behaves correctly.

Confidence: **verified**.

### 9. LOW — entity navigation config lives in app code with hardcoded English names and unfrozen nested structures

Citations:

* `apps/neon/lib/catalog-routes.ts:18-69` (the `entityRoutes` overlay)
* `apps/neon/lib/catalog-routes.ts:73-105` (`applyNeonEntityRoutes`)
* `apps/neon/lib/catalog-routes.ts:106-108` (neon-only application of the overlay)

```ts
// apps/neon/lib/catalog-routes.ts:19-33
  bp: {
    defaultEntityCode: "business_partner",
    entities: [
      {
        code: "business_partner",
        routeSlug: "business-partners",
        name: "Business Partners",
      },
      ...
```

The generated single source for navigation (`packages/contracts/platform/navigation/src/generated-catalog.ts`,
"Generated by tooling/scripts/catalog/generate-platform-catalog.mjs. Do not edit.") emits every module
with `"entities": []` (verified: modules `bp` at line 376, `org` at 397, `buy` at 504 all have
`entities: []`), so the entity code / route-slug / display-name triples for 8 entities are hand-written
in `apps/neon/lib/catalog-routes.ts` and are invisible to `pnpm catalog:generate` /
`pnpm catalog:check`. Only neon applies an overlay (mesh/studio only re-export and validate), and
`apps/{mesh,studio}/lib/catalog-routes.ts` are identical copies modulo the plane name.

Notes on impact honesty: entity `name` values follow the existing style of the generated catalog
(which also contains English literals such as `"name": "Business Partners"` for module `bp`), and I
found no current consumer that renders `resolution.entity.name` (`resolveCatalogRoute`,
`packages/contracts/platform/navigation/src/index.ts:17-33`, returns the entity record; the neon page
only uses `entity.code` and `entity.routeSlug`). So this is a maintainability/i18n-readiness and
single-source-of-truth issue rather than a live user-visible string. Additionally the overlay freezes
the outer object and arrays at lines 87-102 but `entityRoutes`' inner objects/arrays (lines 18-69) are
not frozen, so the "immutable" claim is shallow.

Fix: generate the entity overlays into `generated-catalog.ts` from published metadata (the metadata
already carries `title.labelKey` + `defaultText`, e.g.
`metadata/products/shared/entities/country/definition.json`), and reduce the app files to a plane key
+ `validateCatalogRoutes`.

Confidence: **verified**.

## Verified healthy (do not churn)

* **Header trust boundary**. Client `authorization`, `cookie`, `x-plane`, `x-tenant-id`,
  `x-principal-id`, `x-realm`, `x-org`, `x-organization-id`, all `x-forwarded-*`/`forwarded`/`via`/
  `host` hop-by-hop headers are dropped (`index.ts:89-115`, `3039-3053`), and the relay then *sets*
  identity from the verified session (`index.ts:2868-2874`). `requestHeaders` is a closed allowlist,
  not a denylist, so a new client-supplied `x-…` header cannot leak through. Confirmed by
  `tests/contracts/bff-relay-security.test.ts:222-227` and
  `tests/contracts/app-relay-composition.test.ts:24-34`.
* **Tenant scoping**. Exactly one operation in every plane (`iam.me`) has `requiresTenant: false`;
  everything else defaults to `requiresTenant: true` via `compileOperation` (`index.ts:2955-2973`) and
  returns `409 AUTH_CONTEXT_MISMATCH` without a tenant (`index.ts:2748-2753`). Tenant identity travels
  only as the server-set `x-tenant-id` header (`index.ts:2874`). `tenantParam` exists as a defence for
  path-embedded tenants (`index.ts:2754-2762`); no shipped operation currently uses it, so there is no
  path/header tenant-confusion surface today.
* **SSRF / traversal**. `runtimeOrigin` requires http(s), forbids credentials/query/fragment
  (`index.ts:3024-3038`); upstream calls use `redirect: "error"` and `cache: "no-store"`
  (`index.ts:2894-2895`); `normalizePath` rejects empty/`.`/`..`/`/`/`\`/NUL/`?`/`#` segments and
  re-encodes with `encodeURIComponent` (`index.ts:3001-3023`); the raw path is screened by
  `RAW_PATH_ATTACK` (`index.ts:145`, `2720-2724`). The path forwarded upstream is the matched,
  re-encoded template path, not a client string (`index.ts:2898-2903`). Covered by
  `tests/contracts/bff-relay-security.test.ts:229-258`.
* **CSRF / cross-origin on unsafe methods**. `verifyUnsafeRequest` requires an exact `Origin` match and
  a timing-safe CSRF compare against the session's accepted tokens (`index.ts:2763-2770`,
  `3065-3085`); a missing `Origin` fails closed. A request cannot be replayed across planes because
  `session.plane !== options.plane` is rejected before forwarding (`index.ts:2742-2747`).
* **Body limits**. `defaultBodyBytes` 1 MiB (`index.ts:2711`); per-operation `maxBodyBytes` are
  declared on every write (measured: 0 unsafe operations with `maxBodyBytes: 0`); `content-length` is
  checked *and* the streamed/size-limited read enforces the real byte count
  (`index.ts:3132-3203`); compressed request bodies are rejected with 415 (`index.ts:3125-3131`).
  Confirmed by `tests/contracts/bff-relay-security.test.ts:268-273`.
* **Idempotency**. Keys are validated (`index.ts:3105-3107`), `required` operations refuse without one
  (428) and `none` operations refuse with one (400) (`index.ts:2771-2789`); retry after a 401 is
  attempted only when the body is replayable and the method is idempotent or a key exists
  (`index.ts:2807-2832`). Confirmed by the POST/PUT/PATCH replay matrix in
  `tests/contracts/bff-relay-security.test.ts:290-335`.
* **Response hardening**. `SAFE_RESPONSE_HEADERS` (`index.ts:133-144`, `3225-3247`) drops upstream
  `set-cookie`, `content-length`, `content-encoding` and `cache-control`, forces
  `private, no-store` (or `no-cache, no-transform` for streams), and sanitises
  `content-disposition` CR/LF. Confirmed by `tests/contracts/bff-relay-security.test.ts:94-130`,
  `222-227`.
* **Context-mismatch recovery**. 403 + `AUTH_CONTEXT_MISMATCH` invalidates the local session, clears
  cookies through the authority, and returns 401 with `x-athyper-session-action: login`, with no
  refresh loop (`index.ts:2833-2857`, `3205-3224`). Confirmed by
  `tests/contracts/bff-relay-security.test.ts:68-92`, `366-368`.
* **Browser isolation**. `packages/platform/gateway/bff-relay/package.json` maps the browser condition
  to `src/browser-denied.ts`, which throws on import, so the server-only relay cannot be bundled into
  a client component.
* **No cross-template shadowing**. Measured over all three effective plane lists: 0 cases where an
  earlier, more-general template hides a later, more-specific operation.
* **Tests**. All six relay contract suites collect and pass (52 tests) under
  `tsx --test tests/contracts/*.test.ts`; no missing module imports, no `skip`/`todo`.

## Checked but not a defect

* **Duplicate `method + path` in `COMMON_PLANE_RELAY_OPERATIONS`** — the group is internally unique
  (113 ids, 113 distinct `method + path`); the neon duplicate is cross-group (finding 5).
* **`allowedQuery: ["before"]` / `["channel","locale","version"]`** — never read, but also never
  claimed by a test as enforced (finding 2 covers the class).
* **`idempotency: "optional"`** — declared in the type but unused by every shipped operation; the
  handler branch is still exercised by `tests/contracts/bff-relay-security.test.ts:361-364`.
* **`requestClass: "upload"` bodies cannot be retried** (`prepareBody` returns `replayable: false`,
  `index.ts:3154-3171`) — intentional; `canRetry` at `index.ts:2808-2809` then denies the 401 retry.
* **`intake-operation-client.ts:10`** (`/entity-runtime/:entityCode/intake/:flowKey/operations/:operation`)
  has **no** matching allowlist entry in any plane. I grepped every consumer: `entityIntakeOperationClient`
  is exported (`descriptor-client/src/index.ts:21`) but never called anywhere in `packages/` or `apps/`
  (its only other occurrence is its own module). Dead code today, so it is not reported as a finding;
  it becomes a break the moment a surface uses it, and the fix belongs in the shared allowlist.
* **`attachments.extract`** is exposed only on neon and the Country capability declares an `extract`
  action (`capabilities.json:207`), but no current shared-runtime call site requests
  `/api/attachments/:id/extract` (my sweep of every `/api/…` literal in `packages/platform/entity/runtime`
  found none). Folded into finding 1 as future risk rather than measured impact.
* **Client-side path prefixing** — client operations are written both as `/records/:entityCode` and
  `/api/attachments/...`; `relayUrl` in `packages/platform/foundation/api-client/src/index.ts:174-183`
  strips a single leading `api/`, and `normalizePath` re-adds `/api`, so both forms reach the intended
  allowlist entry. Not a duplication bug.
* **`environment` parameter** — unused in mesh/studio (reported as noise inside finding 8, not as a
  behaviour bug): the app files are constructed with `process.env` in every plane, and the neon pilot
  flags evaluate to `false` when unset.
* **`BUSINESS_PARTNER_REQUEST_RELAY_OPERATIONS`** (`index.ts:2331-2333`) is a deprecated alias of
  `BUSINESS_PARTNER_RELAY_OPERATIONS`; grep found no remaining importers. Documentation debt, no
  runtime effect.
* **`tenantParam`** — only exercised by `tests/contracts/bff-relay-security.test.ts:260-266`; harmless
  defensive hook (see healthy section).
