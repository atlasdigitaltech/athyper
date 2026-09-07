# Communication channel setup

## Current development deployment (2026-09-07)

Capture mode is enabled in the running `athyper-dev` API, worker and scheduler.
All three are healthy, using `athyper/runtime-server:channel-capture-20260907`.
The image derives from the previously running image and includes only capture
configuration/adapter changes, avoiding unrelated work in the checkout.

Open **https://mail.dev.athyper.test** and search for `local-channel-acceptance`.
The inbox returned HTTP 200 using the configured local TLS certificate. The host's
default trust store does not trust that certificate; browsers without local trust
will require the existing development certificate setup. The certificate is at
`~/.athyper/platform/secrets/tls.crt`; never import or distribute its private key.

Repeat deployed-image acceptance from the repository root:

```bash
node tooling/scripts/verification/verify-local-channel-capture.mjs
```

This invokes the deployed host composition, the real capture adapters, SMTP and
Mailpit's API. Push uses the existing push handler with synthetic subscriptions.
It verifies six inbox messages. It does not qualify authenticated business-trigger
flows, persistent subscription enrollment, real device delivery or ownership.
No application database fixtures were created or changed.

Deployment artifacts, build recipe, image override and rollback are retained at:
`~/.athyper/instances/dev/deployments/channel-capture-20260907/`.
From the repository root, run `node` on `deploy.mjs` in that directory to reapply,
or `rollback.mjs` to restore the previous runtime image and provider configuration.
Only API, worker and scheduler are recreated. QA and staging are unchanged.

The normal stackctl plan still uses its configured image set and does not add the
capture overlay automatically. A later generic rebuild/deploy must include this
overlay and an image containing the capture implementation, or use the retained
`deploy.mjs`; otherwise it can replace this setup. This is a local deployment,
not a promoted release image.

## Implemented and verified

The host supports SMTP/SES email, Twilio SMS, Meta Cloud API WhatsApp, Web Push
(VAPID), and FCM (Android/iOS). Browser enrollment and a notification service worker
already exist. Mobile applications still need to obtain and register their FCM
device tokens; configuring a server credential does not install a mobile client.

`NOTIFICATION_CAPTURE=true` now selects local simulation for all these transports.
Email, SMS and WhatsApp are captured as readable JSON emails. Push passes through
the existing subscription lookup and captures one message per active subscription.
Synthetic SMTP destinations are used regardless of the original recipient.
Device tokens, subscription endpoints and encryption keys are omitted from captures.
Attachments are listed by name/type; their bytes and download URLs are not forwarded.
Notification payloads can contain links/codes: use synthetic data and protect inbox access.

All simulated provider IDs begin `capture:` and inbox subjects begin `[CAPTURE:...]`.
The existing delivery ledger treats successful SMTP capture as transport success.
This is simulation evidence, not proof of delivery or ownership verification.
Capture mode cannot be selected in staging/production host configuration. It
requires an explicit local environment and unauthenticated SMTP at `mailtrap`,
`localhost`, `127.0.0.1`, or `::1`. Keep Mailpit forwarding/relay disabled.

## Local development and isolated automated QA

Use the existing Mailpit service, internally named `mailtrap`. After rebuilding the
host image, append `deploy/compose/instance/compose.notification-capture.yaml` to
**the existing instance Compose file list**, preserving its project name and runtime
environment. Do not launch that overlay alone or attach it to a live-provider stack.
It sets these values on API, worker and scheduler:

```dotenv
ATHYPER_ENV=local
NOTIFICATION_CAPTURE=true
EMAIL_PROVIDER=smtp
SMTP_HOST=mailtrap
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_FROM=noreply@dev.athyper.test
```

QA is an isolated deployment instance using the host's `local` environment category;
`ATHYPER_ENV=qa` is not a supported host enum. Do not rename the instance or share its
database/keys with development. This overlay is opt-in, not automatically selected
by stackctl. Ensure its workload selection includes Mailpit (`mailtrap`). Provider
secret files can override SMTP environment values; remove conflicting external
SMTP mounts from a capture deployment. Startup fails closed for an external relay.

Development has a configured inbox route at `mail.dev.athyper.test`. Actual browser
access depends on local DNS, ingress and TLS configuration. Port 8025 is internal,
not automatically published at localhost:8025.

Exercise notifications through the normal authenticated notification flow with
valid tenants, recipient records, permissions, templates and preferences. Capture
mode does not manufacture these records or bypass authorization. Push requires an
active subscription; a synthetic subscription fixture is sufficient for isolated
transport tests. Do not interpret capture mode as testing a browser popup.

Run the automated transport capture smoke test against the local Mailpit container:

```bash
MAILPIT_SMOKE_HOST="$(docker inspect athyper-dev-mailtrap-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')" \
  pnpm --filter @athyper/server-adapter-communications exec vitest run src/__tests__/capture.mailpit.test.ts
```

This example assumes one container network reachable from the host. For other
setups, supply a reachable local Mailpit host explicitly. It writes six synthetic
messages (email, SMS, WhatsApp, web push, Android push, iOS push) and verifies their
subjects through Mailpit's API. It leaves these messages available for inspection.
It does not invoke IAM, create database fixtures or qualify an end-to-end user flow.

## Real provider configuration

Set `NOTIFICATION_CAPTURE=false` and use a dedicated instance for real-provider
qualification. Never mix real senders with automated capture tests.

| Channel | Required configuration | Separate external setup |
| --- | --- | --- |
| Email (SES) | `EMAIL_PROVIDER=ses`, `SES_REGION`, `SES_CONFIGURATION_SET`, `SES_FROM`; AWS credentials through workload identity; SES event queue settings | Sending identity/domain authentication, account access, event destinations and bounce/complaint processing |
| Email (SMTP alternative) | `EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, optional paired `SMTP_USER`/`SMTP_PASS` | Approved relay and sender identity |
| SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID` | Account, sender, destination-country qualification and approved test phones |
| WhatsApp | `META_WHATSAPP_API_VERSION`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_ACCESS_TOKEN` | Meta app/business sender, appropriate templates and approved test recipients |
| Browser push | `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Trusted HTTPS origin, browser permission and active subscription |
| Android/iOS push | `PUSH_FCM_PROJECT_ID`, `PUSH_FCM_CLIENT_EMAIL`, `PUSH_FCM_PRIVATE_KEY` | Firebase project, client SDK/token enrollment, and Apple push configuration for iOS |

Runtime startup supports `_FILE` inputs for SMTP, Twilio, Meta, FCM and VAPID fields
listed above. Mount secret files and set the corresponding `VARIABLE_FILE` path;
merely creating a secret on the host does not mount it into a container. Do not put
private keys or access tokens in source control. The existing notification-provider
Compose overlay is staging-specific; do not reuse its hardcoded environment for
production unchanged.

Existing VAPID bootstrap scripts:
- `deploy/bootstrap/ensure-dev-notification-secrets.sh`
- `deploy/bootstrap/ensure-instance-notification-secrets.sh qa|stg`

These depend on an existing instance secret authority. Inspect their prerequisites
before use. Keep each environment's key set separate. To test actual browser push,
turn capture off in the dedicated test instance, use its public VAPID key through
the existing enrollment UI, grant browser permission, and verify receipt while the
application is in the background. A successful capture test does not prove this.

## Staging and production gates

Staging should use synthetic business records, controlled email inboxes and phones,
separate accounts/credentials, and small delivery caps. Recipient allowlists must
be enforced in the live dispatch path or provider configuration before staging
traffic is enabled; this capture change does not implement a live recipient policy.
Validate authenticated provider callbacks, duplicate/out-of-order events, retry
behavior, permanent failures, expired push subscriptions, and tenant isolation.
Do not assume every adapter already supports delivery callbacks merely because it
can submit messages. Test each provider's actual integration.

Production requires confirmed tenants, channel scope, senders, credential references
and operational owners. Qualify real delivery and receipt for each channel, configure
metrics/alerts and a disable procedure, and retain the evidence before promotion.
Email is the currently agreed master-data pilot; SMS, WhatsApp and mobile push are
additional channel qualification work, not an automatic expansion of that pilot.

For contact ownership verification, implement challenge creation and completion,
then issue target-bound evidence using the master-data protocol. Delivery callbacks
alone cannot verify ownership. Keep staging and production signing keys separate.

## Validation for this change

- Communication adapter suite: 38 passing unit tests.
- Targeted host registration/configuration suites: 53 passing tests.
- Live development Mailpit smoke: passed, all six synthetic captures found.
- Communication adapter source/test TypeScript checks: passed.
- Targeted Compose capture/provider checks and runtime shell syntax: passed.
- Full Compose structure suite has an unrelated migration-manifest expectation
  failure: the fixture expects only the identity replay migration, but the checkout
  also contains governance/entitlement/feature migrations.
- Full host typecheck is blocked by pre-existing unknown-object errors in
  `server/packages/platform/control-admin/src/lookup-control.ts` (lines 56 and 68).

The development API, worker and scheduler now run the scoped capture image described
above. Real SMS, WhatsApp and device push were not sent. Provider accounts, sender
approvals and production credentials have not been provisioned by this change.

### Local capture addresses

New captures use `noreply@dev.athyper.test` for email, `sms@dev.athyper.test`,
`whatsapp@dev.athyper.test`, and `push-web`, `push-android`, `push-ios` at the same
domain. Synthetic recipients use the corresponding channel at
`capture.dev.athyper.test`. The host derives the domain from its configured SMTP
from address; the Compose overlay uses `ATHYPER_DOMAIN_SUFFIX`. Existing inbox
messages retain their original headers.
