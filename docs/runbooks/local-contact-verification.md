# Local contact verification

## Running and qualified

The development API, worker, scheduler and Neon web are running the local
verification workflow. `catl.admin` and `catl.owner` each requested a verification,
received a durable queued message in Mailpit, confirmed through the browser, and
verified the correct synthetic contact. GET did not consume either proof; committed
retries were rejected. `athyper.admin` and `athyper.owner` were denied before send.
Each success has exactly one stored audit event and one outbox event.

Evidence: `master-data-launch/local-verification-acceptance-20260907.json`.
Browser tests use Keycloak admin-assisted development SSO sessions for the selected
principals, followed by ordinary Neon session/CSRF relay authorization. They do not
test password/MFA enrollment. No private keys, passwords or challenge tokens are
written to the evidence artifact.

## Canonical authority

Verification uses `neon.relationship.business_partner.verify_contact`, a sensitive
capability with a deterministic canonical permission ID. The local pilot publishes
it with medium risk, no MFA/SoD requirement, no sharing/delegation, and only
`operating_organization / exact` scope compatibility. These local pilot choices are
not a production authorization release or assurance policy.

Only catl.admin and catl.owner belong to the dedicated local verifier group. Its
role grants this one capability for organization
`a478f9c0-8226-5d22-9599-b8fb27a45180`. Athyper users received no new grants.

The host resolves the contact's business-partner owner from tenant-scoped database
rows, validates the owner registry/storage binding and unique active/effective
organization assignment, and passes that coordinate to the real IAM authorizer.
A missing or ambiguous assignment denies access. No caller-supplied organization
is used. A SHARE table lock prevents concurrent assignment INSERT/UPDATE/DELETE
until the verification transaction ends. This deliberately conservative locking
is suitable for the low-volume local pilot; qualify throughput before wider use.
The five other operations are now published and browser-qualified locally; see
`master-data-canonical-authorization.md`. That later release adds a synthetic
organization-B verifier grant for catl.owner while retaining the original A grant,
and records its own images and acceptance evidence. The evidence below describes
the earlier verification release.

## Endpoints and proof handling

- POST `/api/master/contacts/{contactId}/verification-challenges`: authenticated
  creation, stored email destination, hash-only challenge token storage.
- Link: `https://neon.dev.athyper.test/contact-verification.html#...`. Proof stays in
  the URL fragment and is removed from history on page load. GET does not consume.
- POST `/api/master/verification-challenges/{challengeId}/complete`: authenticated
  confirmation by the original requester, through the CSRF-protected Neon relay.
- Ten-minute challenge lifetime; three requests and ten completion attempts per
  principal per fixed ten-minute database window. Failed completions count even
  when their data transaction rolls back. A 429 response includes Retry-After.
- Completion verifies active/effective contact, current value, requester, tenant,
  plane, token, expiry and replay state, then signs stored claims with Ed25519.
  The existing verifier authenticates those claims. No arbitrary signing API exists.
- Verification, audit, outbox and challenge consumption share one SQL transaction.
  Audit/outbox errors roll back all these effects. Replays return
  `CHALLENGE_ALREADY_CONSUMED` without duplicate effects.

## Durable Mailpit delivery

Challenge creation and rows in `event.notification_message` /
`event.notification_delivery` commit together. The existing notification discovery,
claim, retry and delivery sweep handles sending. The link is AES-256-GCM encrypted
in both durable payload representations; authenticated encryption binds it to the
tenant and recipient principal. An independent local delivery key is shared by API
and worker. The worker does not receive the Ed25519 signing key.

SMTP failure is retried up to five attempts through the existing queue. A crash
after SMTP acceptance can produce a duplicate email; both copies contain the same
single-use challenge. Delivery is therefore at least once, not exactly once.
Expired or malformed proofs fail permanently without SMTP delivery. Local retention,
key rotation, persistent deployment and queue recovery are documented in
[Local master-data operations](local-master-data-operations.md). The scheduled
local policy retains expired challenges and terminal encrypted history for seven days.

## Reapply and rollback

From repository root:

```bash
node tooling/scripts/verification/setup-local-contact-challenge.mjs
node tooling/scripts/verification/setup-local-verification-authority.mjs
node tooling/scripts/verification/setup-local-verification-contacts.mjs
```

These target only development Neon and the selected tenant. The authority installer
is idempotent and retains PostgreSQL role/catalog validation triggers. It also
installs the exact verification audit contract. The fixtures add two synthetic
contacts to the existing CATL-BP-001 business partner; existing contacts are not
rewritten.

Deployment artifacts are at
`~/.athyper/instances/dev/deployments/local-verification-20260907/`:
- `deploy.mjs` reuses the existing Compose configuration, preserves the parameter
  runtime flag, adds capture/challenge overlays, and selects the validated images.
- `rollback.mjs` restores the previous parameter-runtime/capture deployment and
  previous Neon image. It leaves test data and signer files in place. To remove
  local verification authority separately, suspend the dedicated
  `local.contact-verifier` role through the normal IAM process.

The runtime image is `athyper/runtime-server:local-verification-20260907-r2`;
Neon is `athyper/neon-web:local-verification-20260907`. Both full builds passed;
r2 adds the tested durable payload format fix to the built server image.

The API loads the signer and verifier public trust from owner-only secret files.
Trust admits only CirrusAtlantic / Neon, with a 90-day key window from initial
setup. Staging and production must use different keys and reviewed authority.
Future generic deployments must retain the feature overlays and compatible images.

## Repeat browser acceptance

```bash
node tooling/scripts/verification/verify-local-contact-workflow.mjs
```

Use `LOCAL_CHALLENGE_RESUME=true` only to resume an existing unconsumed test proof;
it does not reset request limits. On this machine, Playwright needs the locally
extracted browser libraries:

```bash
LD_LIBRARY_PATH=/tmp/athyper-playwright-libs/extracted/usr/lib/x86_64-linux-gnu \
  node tooling/scripts/verification/verify-local-contact-workflow.mjs
```

Allow the ten-minute request window to reset before repeated full acceptance runs.
The script leaves synthetic captures and verification records available for review.
It never resets contact verification state to make a rerun pass.

## Final checks

- Master-data service suite: 235 passing unit/service tests.
- PostgreSQL suite: 13 passing tests, including missing/ambiguous organization scope,
  foreign-tenant lookup denial and concurrent assignment-insert blocking.
- Targeted host/config/encrypted-delivery suites: 55 passing tests.
- Master-data and host TypeScript checks pass. Full server and Neon image builds pass.
- All four local runtime containers are healthy. Browser acceptance passed for the
  two CirrusAtlantic users and denied the two Athyper users.
- Exactly two verification audit rows and two verification outbox rows were checked
  in local Neon, one of each per completed synthetic contact.
