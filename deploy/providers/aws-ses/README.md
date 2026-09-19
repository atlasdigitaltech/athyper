# Amazon SES notification infrastructure

This Terraform root provisions the provider-side foundation for Athyper's
locked transactional email architecture:

- an SES v2 domain identity with Easy DKIM and a custom MAIL FROM domain;
- an environment-specific transactional configuration set;
- SES events delivered through the default EventBridge bus to a scoped rule,
  SQS, and its DLQ;
- separate least-privilege roles for sending and event consumption; and
- operator-readable Cloudflare DNS outputs.

It does not create credentials, Cloudflare records, SES account production
access, runtime secrets, application tenant mappings, or a production release.
STG and production must be applied from different AWS accounts and remote state
backends. The account precondition prevents an accidental cross-environment
apply.

## Owner prerequisites

An authorized AWS/DNS owner must provide, outside Git:

1. the dedicated STG or production AWS account and approved SES region;
2. a deployment identity allowed to create SES, EventBridge, SQS, and IAM
   resources in that account;
3. an environment-specific encrypted S3 Terraform backend and state-locking
   configuration;
4. the existing workload principals that will assume the sender and consumer
   roles; and
5. an approved DMARC aggregate-report mailbox.

No provider password or access key belongs in a `.tfvars` file. Authenticate the
AWS provider through the approved CI workload identity or short-lived operator
session.

## Initialize and plan STG

Copy the example outside the repository, replace account and principal
placeholders, and protect it as operator configuration:

```sh
install -m 0600 \
  deploy/providers/aws-ses/environments/stg.tfvars.example \
  "$HOME/.athyper/instances/stg/aws-ses.tfvars"

terraform -chdir=deploy/providers/aws-ses init \
  -backend-config=/secure/terraform/stg-ses-backend.hcl
terraform -chdir=deploy/providers/aws-ses fmt -check -recursive
terraform -chdir=deploy/providers/aws-ses validate
terraform -chdir=deploy/providers/aws-ses plan \
  -var-file="$HOME/.athyper/instances/stg/aws-ses.tfvars" \
  -out="$HOME/.athyper/instances/stg/aws-ses.tfplan"
```

An authorized owner reviews the plan before applying that exact plan. Repeat
with the production example, production AWS session, independent backend, and
production principals. Never copy STG state or principal ARNs into production.

## DNS handoff

After the identity exists, export the non-secret record descriptions:

```sh
terraform -chdir=deploy/providers/aws-ses output -json cloudflare_dns_records
```

The Cloudflare owner creates the exact CNAME, MX, SPF, and DMARC records from
this output. Every record is DNS-only; do not enable the Cloudflare proxy.
Re-plan after DNS verification and retain sanitized verification evidence.

DMARC intentionally begins at `p=none`. Moving to `quarantine` and then
`reject` is a separately approved deliverability change after DKIM/SPF
alignment and canary evidence are healthy.

## Tenant-management boundary

This root establishes the shared environment transport. The application-side
SES v2 implementation owns the stable Athyper tenant identifier, SES tenant
lifecycle, resource association, and delivery tags. Do not grant the runtime
sender role SES administrative permissions. A separate provisioning role/module
must govern tenant creation after the application contract and AWS provider
resource support are pinned and tested.

## Safety notes

- Open/click tracking is not enabled.
- SES API acceptance is not final delivery; the SQS consumer is authoritative
  for delivery, delay, bounce, complaint, reject, and rendering-failure events.
- SQS is encrypted with SQS-managed encryption and retains events for up to 14
  days; consumer failures move messages to the DLQ after the configured limit.
- DLQ replay is an operator action and must preserve event idempotency.
- The sender role is restricted to the verified identity and exact From
  address. It permits the environment configuration-set resource; because SES
  has no configuration-set IAM condition key, the native adapter must also
  require that configuration set and its contract tests must fail when absent.
- The sender role can read only SES account sending health (`ses:GetAccount`);
  it cannot change account, identity, configuration-set, tenant, or suppression
  configuration.
- The consumer role cannot purge queues or replay the DLQ.
