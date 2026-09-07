# Local authenticated acceptance: all six master-data routes

Status: passed, with 65 recorded acceptance checks on the running local deployment.
Evidence: [local-six-route-acceptance-20260907.json](master-data-launch/local-six-route-acceptance-20260907.json).

| Route | Allowed result |
| --- | --- |
| POST `/api/master/owners/{entityCode}/{ownerTypeId}/{ownerId}/contacts` | 200; contact created |
| POST `/api/master/owners/{entityCode}/{ownerTypeId}/{ownerId}/addresses` | 200; address linked |
| GET `/api/master/owners/{entityCode}/{ownerTypeId}/{ownerId}/profile` | 200; created records visible |
| PATCH `/api/master/contacts/{contactId}/verification` | 200; stored contact changes from unverified to verified |
| POST `/api/master/contacts/{contactId}/deactivate` | 204; contact disappears from current profile |
| POST `/api/master/addresses/{addressLinkId}/deactivate` | 204; address link disappears from current profile |

Both catl.admin (organization A) and catl.owner (organization B) passed every
positive route. Historical profile queries retained the appropriate contact and
address records after deactivation. Each primary contact/address pair has exactly
five matching master-data audit and outbox events, one per successful mutation.

## Access matrix

| Actor / target | Coverage | Expected and observed |
| --- | --- | --- |
| catl.admin / A | All six | Successful |
| catl.owner / B | All six | Successful |
| catl.admin / B | All six | 403 |
| catl.owner / A | Five sensitive operations | 403 |
| catl.finance / A | All six | 403; verified identity has no master-data capabilities |
| athyper.admin / CirrusAtlantic A | All six | 404; no foreign-tenant target disclosure |
| athyper.owner / CirrusAtlantic A | All six | 404 |
| Anonymous / A through browser relay | All six | 401 |

catl.owner intentionally retains its earlier organization-A verification grant.
PATCH to A therefore passes authorization and rejects the submitted used proof
with `VERIFICATION_EVIDENCE_REPLAY` (409). The test records that behavior explicitly;
it does not change grants to manufacture an out-of-scope denial.

Every denial matrix compares before/after database fingerprints for the run's
contacts/address links and counts of master-data audit/outbox events. They remain
identical; denied responses contain no fixture PII or profile arrays. Authentication
audit records are expected and are not counted as master-data mutation effects.

Reusing accepted evidence returns 409 without duplicate effects. Submitting it for
a different contact in the same authorized organization returns
`VERIFICATION_EVIDENCE_INVALID` (422), also without effects.

## Verification fixture and boundaries

The PATCH positive case uses an independent implementation of the documented
Ed25519 wire encoding, signed with the existing development-only key. The fixture
reads the stored contact and refuses to sign outside this run's unique marker,
selected owners, tenant, channel and synthetic email values. It introduces no
signing HTTP endpoint and never modifies contacts or permissions through SQL.
All test mutations run through authenticated browser relay requests.

This proves direct API signature/target-binding integration. It is not evidence of
email ownership: the actual Mailpit challenge request/confirmation workflow has
separate evidence in `local-master-authority-acceptance-20260907.json`.

Sessions use Keycloak admin-assisted development SSO followed by ordinary Neon
session/CSRF and host IAM checks. Password/MFA enrollment, real external delivery,
QA, staging and production are outside this local acceptance gate.

## Repeat

Prerequisites: apply/deploy the local authority setup described in
[master-data-canonical-authorization.md](master-data-canonical-authorization.md).
The existing catl.finance identity is used without adding any grants. The harness
checks actual tenant IDs and effective permissions; it does not infer authority
from usernames.

```bash
LD_LIBRARY_PATH=/tmp/athyper-playwright-libs/extracted/usr/lib/x86_64-linux-gnu \
  node tooling/scripts/verification/verify-local-master-data-six-routes.mjs
```

Each invocation creates fresh synthetic fixtures through the API and writes its
receipt to `/tmp/athyper-local-six-route-acceptance.json`. It fails on the first
unexpected result and sets `complete: true` only after every check succeeds. No
challenge token, private key or signed evidence is written to the receipt.
Deactivated synthetic records and audit/outbox evidence are retained for review.
The private key is used only in local test process memory. No catalog, grants or
deployment changes are required to rerun this acceptance harness.

The tested images are `athyper/runtime-server:local-master-authority-20260907-r2`
and `athyper/neon-web:local-master-authority-20260907`.
