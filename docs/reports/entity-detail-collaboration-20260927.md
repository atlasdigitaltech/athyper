# Generic detail collaboration integration

The generic detail descriptor now exposes only the comments/attachments kinds
admitted for the current principal and record. The records service establishes
record read access before invoking capability discovery. Missing declarations,
denied capabilities and unavailable providers are omitted; infrastructure faults
are not silently converted into empty successful discovery.

The new experience-layer capability read path resolves the current signed release,
calls the existing capability policy, checks the parent and action permissions,
and invokes the existing tenant-scoped SQL readers. It does not invent a page
section artifact. Thread reads additionally authorize the target comment.
The existing mutation endpoints still own comment visibility/ownership and
attachment stage/finalize/download/scan controls; no grants or bypasses were added.

The detail UI reuses EntityCollaborationSurface and CompiledEntitySectionContent,
including the existing comment composer, file uploader, pagination, and thread
and mention loaders. It loads lazily, clears content on denial, aborts its primary
in-flight read on unmount, and is keyed by the detail page's tenant/principal/auth
epoch/entity/record identity. Studio and Mesh now also load the shared detail CSS.

## Fresh verification

- Experience package: no-emit TypeScript check passed; 138 tests passed.
- Records package: source/test typechecks passed; 290 tests passed, 3 skipped.
- Shared form/detail package: typecheck passed.
- Host: 682 tests passed, 25 skipped. Typecheck retains exactly the existing
  entity-case-preflight.ts missing KyselyBusinessPartnerCaseRepository error.
- Chromium: 4 new collaboration component tests + 9 list plane-parity tests passed.
  Coverage includes lazy loading, no-capability omission, denial, tenant-switch
  remount, and rendering existing write components only with projected actions.
- Service coverage includes permission revocation, parent denial, tenant/principal/
  plane pin mismatch, thread-subject denial, and AST import-boundary enforcement.
- Scoped whitespace check passed.

DEV API restarted after implementation changes. Unauthenticated requests to the
new capability endpoint returned 401 with each of the three plane headers.
No DDL, permission grants, Country metadata, publication release or activation
head was changed. No QA, staging or production deployment occurred.

## Manual acceptance still required

### Relay integration correction

The initial component/API verification missed the browser relay registrations.
Authenticated browser requests exposed `RELAY_OPERATION_NOT_ALLOWED` before API
authorization. The shared entity-runtime relay group now includes exact GET
comments and attachments paths, parameterized by entity and record, in all three
applications. No wildcard capability route or additional write authority was added.

Fresh correction gates: relay typecheck passed; 40 relay security/composition
tests passed. Tests invoke each application's actual relay factory and verify
generic entity routing, query forwarding, trusted tenant/plane headers, and
denial of missing sessions, missing tenant context, wrong planes, unknown
capabilities, extra path segments and write methods on these read routes.
All six live DEV read URLs now return `401 AUTHENTICATION_REQUIRED` without a
session instead of the allowlist 404 (route matching precedes authentication).
This proves live registration, not authenticated backend success. The earlier
service/host/browser counts above were not rerun for this relay-only correction.

Refresh a Country detail page in each plane with an ordinary authorized tenant
session. Open Comments and Attachments, create a private comment, edit/archive
your own comment, upload a permitted small file, wait for its scan result, and
check authorized download. Verify another tenant cannot see those comments/files
on the shared Country parent. Verify a user without the relevant permission is
denied. Source and component tests do not establish live upload/scanner success
or replace this authenticated cross-tenant acceptance.
