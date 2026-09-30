# Runtime API review — 2026-09-07

Reviewed the supplied 127 operations across 24 Swagger tags. All 127 are present in the development OpenAPI document (167 total deployed operations). The attached evidence maps every supplied operation to its source and records credential-free GET probes. This is source review plus local automated verification, not authenticated acceptance testing of every deployed operation.

## Confirmed defects fixed

| Severity | Finding and correction | Regression evidence |
| --- | --- | --- |
| High | Publication release/deployment reads and publish/retry fetched by ID after a permission check without checking tenant ownership. Release ownership now must match the verified tenant; deployment ownership is checked through its source release. Foreign IDs return 404 and never enqueue jobs. | Four foreign-tenant paths rejected; same-tenant reads and commands retained. |
| Medium | Transfer input helpers attached `status: 400` to a TypeError, but the runtime handles HttpError. Invalid UUIDs, operations and payload values became 500. Helpers now emit HttpError(400). Numeric URL inputs reject duplicate values, empty strings, hexadecimal and exponent notation. Both UI and public V1 routes share the fix. | Both route prefixes tested with invalid IDs, operations, chunk indices and pagination; no service invocation. |
| Medium | Publication input TypeErrors and operations errors reached the generic 500 handler. Input errors now produce 400, missing provenance 404, and unreplayable/unhealthy destinations 409; declarations include the domain statuses. Duplicate pagination is rejected. Rollback target IDs are validated before queuing. | HTTP tests for invalid IDs/query values, missing provenance and replay conflict. |
| Medium | Atlas read/draft return null when unconfigured, contradicting their object-only success schema. GET response schemas now admit null. Scope inputs reject malformed or repeated values. Known validation, Studio-only and revision errors now carry 400, 403 and 409 respectively. | HTTP tests for absent configuration and invalid scopes under response enforcement; existing configuration suite. |
| Medium | Response enforcement did not include middleware-generated errors when handlers omitted those statuses. This could turn an authentication/rate-limit failure into an internal error or Express's default HTML error page. Generated OpenAPI and enforcement now share effective middleware responses while preserving explicit route schemas. | JSON problem responses for 400, 401, 403, 429 and 503 under strict response enforcement. |
| Medium | Record creation replays correctly return 200, but the contract declared only 201. Mutation contracts also omitted NotFound (404) and LockRequired (423), causing failures with response enforcement. These outcomes are now documented and accepted. | HTTP regression cases for replay, missing record and lock required. |
| Medium | Swagger omitted the x-plane header required by host authentication. Host OpenAPI configuration now supplies a required enum header for authenticated operations. IAM context discovery verified bearer tokens but lacked authenticated metadata, so Swagger omitted its security requirement; it is now marked authenticated. | Generated-document assertion for x-plane; host IAM tests; host/runtime typechecks. |

## Verification

- 1,198 tests passed across runtime HTTP, publication, records, Atlas AI, jobs, experience, IAM, notifications and platform host. Three integration tests were skipped by their existing environment gates. Follow-up checks after the last edits also passed; repeated executions are not double-counted.
- Typechecks passed for runtime HTTP, publication, records, Atlas AI and platform host, including test typechecks where provided.
- Development read-only smoke checks: 55 GETs, yielding 46 authentication-required responses, four request-validation responses, four successful system probes and one metrics access denial. No unexpected 5xx responses. These checks used no bearer credentials and performed no mutation requests.
- The development endpoint uses a self-signed certificate. Certificate verification was disabled only for the credential-free OpenAPI capture and GET probes.
- Repository-wide OpenAPI policy is not green: the existing workspace has unresolved dynamic registrations, stale baseline exceptions and undocumented raw routes outside the supplied inventory (including finance, control administration and master data). The review did not expand the exception baseline or modify that unrelated work.

## Limits and release status

Changes are in the workspace; no runtime restart, deployment, publication or database migration was performed. Swagger on the running development instance will reflect the fixes after the updated runtime is deployed. Authenticated live flows, production database/RLS behavior, cross-process races and external integrations were not certified by the read-only probes or mocked HTTP tests. Many existing endpoint payload contracts remain broad object schemas; route presence alone does not demonstrate detailed payload documentation.

Existing workspace edits were preserved. In particular, HTTP parser fixes and records query validation changes already present before this review are not attributed to this work.

## Supplied inventory coverage

| Swagger tag | Operations |
| --- | ---: |
| Atlas | 1 |
| Atlas Administration | 3 |
| Entity runtime | 5 |
| IAM | 9 |
| Jobs | 12 |
| Mesh experience | 1 |
| NEON Business Partner Definitions | 2 |
| Neon experience | 2 |
| Notifications | 4 |
| Platform experience | 4 |
| Platform localization | 3 |
| Platform navigation | 1 |
| Platform verification | 2 |
| Public Records Transfer V1 | 20 |
| Publication | 5 |
| Publication Operations | 4 |
| Record favourites | 4 |
| Records | 6 |
| Records Transfer | 20 |
| STUDIO Business Partner Definitions | 8 |
| Studio experience | 5 |
| Studio navigation | 1 |
| System | 4 |
| Telemetry | 1 |

See [operation mapping and probe evidence](runtime-api-review-2026-09-07-evidence.json).
