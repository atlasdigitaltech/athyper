# Notification provider activation

This runbook activates external notification delivery without exposing provider
credentials or bypassing the three-plane migration and release gates.

## Scope and target order

1. DEV proves in-app delivery, Activity Center interactions, and local SMTP.
2. QA proves deterministic notification orchestration with mock integrations.
3. STG uses its dedicated SES AWS account/workload role, staging VAPID credentials,
   and allowlisted recipients.
4. Production activation begins only after a production instance contract,
   immutable image set, backup/restore evidence, and rollback owner exist.

Never reuse production credentials in STG. The staging rehearsal contract
explicitly prohibits them.

## Locked Amazon SES architecture

Amazon SES API v2 is the primary transactional email transport. The existing
SMTP adapter is a compatibility and rollback path only. The provider-side
delivery flow is:

```text
Athyper durable delivery worker -> SES API v2 -> recipient mail server
SES configuration set -> EventBridge -> SQS -> DLQ
SQS -> Athyper SES event consumer -> delivery/suppression/activity state
```

STG and production use separate AWS accounts, remote Terraform state,
identities, queues, IAM roles, and canary evidence. The repository foundation is
at `deploy/providers/aws-ses`; it refuses an apply when the authenticated AWS
account differs from the approved account in the environment input.

The infrastructure plan/application and application release are independent
approval boundaries. Infrastructure availability does not authorize Athyper to
route normal tenant traffic through email.

### AWS and DNS owner prerequisites

The authorized owners must complete these actions outside the repository:

1. Create or approve the dedicated STG and production AWS accounts in the AWS
   Organization and select the SES region for each environment.
2. Establish environment-specific encrypted Terraform backends and short-lived
   deployment access. Do not create long-lived access keys for repository use.
3. Supply the real worker and event-consumer IAM principal ARNs through protected
   operator configuration. STG principals must never appear in production.
4. Apply the reviewed SES Terraform plan in the correct account, then add the
   exact emitted Easy DKIM, custom MAIL FROM, SPF, and DMARC records in
   Cloudflare as DNS-only records.
5. Request SES production access and appropriate send quotas independently in
   each account. Sandbox removal for STG does not authorize production.
6. Approve the DMARC aggregate-report mailbox and retain domain-verification
   evidence without recipient PII or credentials.
7. Approve STG and production canary tenant/principal/recipient identities via
   the operational configuration system.

Start with these governed identities:

| Environment | Visible identity | Custom MAIL FROM | From address |
|---|---|---|---|
| STG | `notify.stg.athyper.com` | `bounce.notify.stg.athyper.com` | `notifications@notify.stg.athyper.com` |
| Production | `notify.athyper.com` | `bounce.notify.athyper.com` | `notifications@notify.athyper.com` |

Do not activate tenant custom domains during the platform-domain canary. Each
future tenant domain requires its own ownership verification, SES association,
health monitoring, and rollback contract.

### Repository infrastructure workflow

The Terraform root emits non-secret Cloudflare record descriptions but cannot
change DNS. Follow its README and use protected tfvars outside Git:

```sh
terraform -chdir=deploy/providers/aws-ses init \
  -backend-config=/secure/terraform/stg-ses-backend.hcl
terraform -chdir=deploy/providers/aws-ses validate
terraform -chdir=deploy/providers/aws-ses plan \
  -var-file="$HOME/.athyper/instances/stg/aws-ses.tfvars" \
  -out="$HOME/.athyper/instances/stg/aws-ses.tfplan"
```

Only an authorized owner may apply the reviewed saved plan. Application rollout
must remain blocked until SES identity verification, account production access,
event-queue health, immutable images, migrations, and authenticated canaries all
pass.

## Required STG secret files

Native SES API v2 authentication uses the environment's IAM workload role and
does not require SMTP credentials. The default STG plan therefore requires only
the Web Push files below. The six SMTP files are optional and belong only to the
explicit `compose.notification-smtp-rollback.yaml` procedure.

The secret-sync agent must create the following owner-only, non-empty files
under `~/.athyper/instances/stg/secrets/`:

| File | Content |
|---|---|
| `vapid-subject` | Staging abuse contact, normally a `mailto:` URI |
| `vapid-public-key` | Public member of the staging VAPID keypair |
| `vapid-private-key` | Private member of the same staging VAPID keypair |

Use mode `0600` for files and `0700` for the parent directory. Do not place
values in Git, shell history, controller receipts, tickets, or chat.

Install secret-manager output without putting a value on the command line:

```sh
deploy/bootstrap/install-stg-secret.sh vapid-subject --from-file /secure/provider/vapid-subject
```

Repeat for each secret reported by `pnpm athyper plan stg`. The installer uses
an allowlist, atomic replacement, directory mode `0700`, and file mode `0600`.

## Offline readiness check

Map the mounted files to the verifier without reading their values into the
shell:

```sh
export EMAIL_PROVIDER=ses
export SES_REGION=<approved-region>
export SES_CONFIGURATION_SET=<terraform-output-configuration-set-name>
export SES_FROM=notifications@notify.stg.athyper.com
export VAPID_SUBJECT_FILE="$HOME/.athyper/instances/stg/secrets/vapid-subject"
export VAPID_PUBLIC_KEY_FILE="$HOME/.athyper/instances/stg/secrets/vapid-public-key"
export VAPID_PRIVATE_KEY_FILE="$HOME/.athyper/instances/stg/secrets/vapid-private-key"
pnpm verify:notification-providers --target staging --push web
pnpm athyper plan stg --json
```

The verifier reports only pass/fail state and credential source. It never emits
provider values. The normal SES STG plan must not request `smtp-*` files and
must no longer report missing `vapid-*` files before deployment proceeds.

## Staging acceptance

1. Promote the exact QA image digests to the STG image set; never rebuild.
2. Capture the STG pre-migration backup and complete the isolated restore drill.
3. Apply the notification migration transactionally to all three STG plane
   databases and verify the canonical routing/template rows.
4. Deploy API and worker with `compose.notification-providers.yaml`.
5. Run authenticated System Verification and require the selected SES email
   transport health check to pass.
6. Send one idempotent canary notification to an allowlisted internal address.
7. Verify the message, delivery attempt, provider response ID, retry state, and
   Activity Center entry across the appropriate plane.
8. Exercise one transient failure and one permanent failure; verify retry and
   dead-letter behavior before enabling normal traffic.

### SES tenant and canary application contracts

The notification platform exposes provider-neutral, idempotent control-plane
ports for tenant creation, verified-identity/configuration-set association, and
tenant suppression synchronization. The SES implementation must reconcile the
desired state through those ports; it must not construct provider tenant names
from tenant display names, domains, or raw UUIDs. The canonical name is a
stable `t-` prefix plus a SHA-256-derived non-PII coordinate.

Identity association is fail-closed: the application contract refuses an
identity that has not already been verified. Reconciliation is safe to repeat,
repairs only drifted associations, and uses deterministic operation keys.
Suppression synchronization may pass an address to the injected provider
client, but returns and records only `sha256:` recipient references.

The authenticated staging email canary is injected with four operational
capabilities: authorization, notification dispatch, delivery observation, and
time. It can produce passing evidence only after all of these assertions hold:

- the authenticated principal was authorized for the tenant and plane;
- SES accepted the delivery and returned its authoritative message ID;
- the asynchronous provider event was correlated;
- final delivery was observed; and
- the Activity Center projection was published.

The evidence generator accepts no authorization token, credential, or provider
payload and rejects unknown request/evidence fields. It hashes both recipient
and provider references. Operators should serialize its returned document
directly to `stg/notifications/email-canary.json`; do not hand-edit a passing
record. The staging evidence schema requires the five exact assertions for the
email channel.

The CI publication workflow produces the candidate ImageSet. Promote its exact
digests locally only after the candidate revision is the clean pushed revision:

```sh
pnpm release:promote-images -- \
  --input deploy/image-sets/candidates/<candidate>.yaml \
  --output deploy/image-sets/releases/stg-<revision>.yaml
```

Point the STG instance template at that release file. The controller selects
`db-forward-migration` for QA/STG and records the migration-tree checksum in
the instance migration receipt. Each plane database also records each SQL file
checksum and state in `public.athyper_schema_migration_v1`; checksum drift,
concurrent execution, or a prior failed migration stops startup for operator
review.

STG rehearsal qualification remains blocked until these sanitized records are
present under the qualification root:

- `stg/notifications/provider-readiness.json`
- `stg/notifications/email-canary.json`
- `stg/notifications/web-push-canary.json`
- `stg/notifications/failure-exercise.json`

Each document must satisfy
`deploy/instances/schemas/staging-notification-evidence.schema.json`. Store only
hashed recipient and provider references; never retain an email address, push
endpoint, authorization token, or credential in qualification evidence.

## Web Push gate

Provider credentials alone do not activate browser push. Before adding `push`
to routing rules, the shared shell must provide:

- an authenticated endpoint that returns the environment's VAPID public key;
- a service worker that handles `push` and `notificationclick` events;
- an explicit user-driven permission and subscription flow;
- registration through `/api/notifications/push-subscriptions`;
- unsubscribe, expired-subscription cleanup, and cross-plane tests.

The shared shell now implements this enrollment lifecycle for Neon, Mesh, and
Studio, including device-local unsubscribe. Keep canonical routes at
`in_app,email` until a STG browser canary proves the public-key endpoint,
subscription persistence, delivery, notification click, and expired-endpoint
cleanup against real staging VAPID credentials.

## Production gate

The repository has a non-executable production target contract at
`deploy/production/instance.yaml` and a read-only activation contract at
`deploy/rehearsals/production.yaml`. They require a dedicated external secret
namespace, immutable STG image digests, backup/restore proof, email and Web Push
canaries, rollback evidence, and release approval. They deliberately do not add
a local Compose production template.

Inspect the remaining gates without changing either environment:

```sh
pnpm athyper rehearsal plan production --from stg --json
```

The plan must remain blocked until the real deployment-target reference and
production evidence are supplied through the approved operational workflow.
Do not repurpose the STG contract or its credentials as production.
