# QA, staging and production closure

Assessment date: 2026-09-07 (local). **Neither qualification nor production rollout is complete.** The inventories here are evidence of current conditions, not release approvals. Separate release records keep QA observations out of staging/production trust configurations.

## Work status

**Open — deferred by user.** QA, staging and production setup, qualification, real-delivery acceptance and rollout will be scheduled later. No further deployment work is scheduled in this task. Existing inspection evidence is retained for resumption; completed local development qualification remains recorded separately.

| Environment | Work status | Execution |
| --- | --- | --- |
| QA | Open | Deferred |
| Staging | Open | Deferred |
| Production | Open | Deferred |

## Observed conditions

| Area | Observation | Required next action |
| --- | --- | --- |
| QA runtime | Running, healthy, API image recorded in `qa-identity-inventory.json` | Select and qualify the incoming immutable candidate and compatible rollback image |
| QA tenants/users | Both CirrusAtlantic/Athyper and catl.admin, catl.owner, athyper.admin, athyper.owner exist and are active | Verify identity-provider bindings, authenticate each user and evaluate actual owner scopes; usernames do not confer permissions |
| QA master tables | Present; forced RLS; runtime role is not owner/superuser/BYPASSRLS and has SELECT/INSERT/UPDATE | Exercise cross-tenant and same-tenant scope denials through the application pooler |
| QA schema difference | `master.address.country_code` is nullable; candidate common DDL requires NOT NULL | Inventory null values within authorized scope, prepare a reviewed forward migration/data remedy; do not apply clean-install DDL |
| QA capabilities | No contact/address-sensitive or verification capability matches in deployed registry | Publish candidate canonical catalog/bindings and scoped grants through the environment's established publication process |
| QA owner registry lock | `control.lock_master_data_owner_registry()` absent | Include the scoped lock function and runtime EXECUTE grant in the release migration; preserve SELECT-only registry access |
| QA challenges/trust | Local challenge table absent; API challenge flag off and trust setting absent | Deploy the selected nonlocal ownership workflow with its own secrets/trust; do not copy local pilot keys |
| QA worker inventory | Generic master-table probe fails with `permission denied for schema master` under worker role | Qualify the worker's actual notification/outbox access separately; this is not authority to grant master-table access to a worker |
| Staging | No running staging containers visible on this Docker host | Confirm the intended staging target and access; this does not establish whether remote staging exists |
| Staging email | Existing SES readiness checker reports `SES_REGION is required` | Confirm provider/account and supply the complete environment-specific configuration |
| Ownership workflow | Host permits challenge implementation only for local capture, fixed local tenant and development page URL | Implement and test a nonlocal challenge/attestation boundary after provider/target selection; changing SMTP alone cannot activate it |
| Accountable owners | Domain, integration, IAM, database and release owners not provided | Assign actual people and incident contacts |

No QA/staging/production grants, keys, deployments or application data were changed during this assessment.

## Inputs to complete

Fill `qa-release.json`, `staging-release.json` and `production-release.json` independently:

- Target/environment access reference and intended immutable candidate/rollback artifacts.
- Primary and negative tenants confirmed on that target, scoped actors, owner organizations and an unauthorized actor.
- Named accountable owners.
- Real email provider/account, verified sender domain, authorized acceptance inboxes and secret-store references. Do not put credentials in these JSON records.
- Separate signing/verification and delivery-encryption configuration references per environment. Never trust the local pilot key in staging or production.

QA tenant IDs are recorded as observations; staging and production IDs remain unset. The existing staging deployment adapter supports SES, but its presence is not a provider selection or proof of a configured AWS account.

## Execution order and evidence

1. Freeze the candidate and select the target. Review dirty checkout changes before building the release artifact.
2. Implement the selected ownership protocol. For application-owned challenges, configure tenant allowlists, public HTTPS completion origin, separate keys and real email adapter; retain stored-destination binding, authenticated scope checks, rate limits, single-use confirmation and atomic audit/outbox commits. Do not relax `LOCAL_CONTACT_CHALLENGE_ENABLED` guards to masquerade as local. For provider-owned challenges, authenticate authoritative success results and bind them to stored targets before attestation. Delivery success alone is insufficient.
3. Prepare compatible forward migrations and environment publication/grants. Exercise them in QA first. Include challenge persistence where the selected design requires it. Do not replay local-only setup scripts in another environment.
4. Deploy QA/staging using the ordinary environment deployment path. Qualify runtime and worker connections through the actual pooler and identities. Inspect grants/RLS, canonical bindings and current owner resolution. Record exact image/config/migration revisions.
5. Run authenticated acceptance across all six routes: allowed users, unauthorized users, foreign tenants, out-of-scope owners, stale-value proofs, replay, historical reads, concurrent writes and transaction rollback. Observe audit rows and outbox consumer completion, not just table existence.
6. Send to explicitly authorized real inboxes. Confirm the received link through the deployed HTTPS UI, verify only the correct contact, inspect audit and downstream outbox effects, and retain redacted provider delivery IDs. Test bounded failure/retry handling without exposing links/tokens. This task's email pilot does not qualify SMS, WhatsApp or mobile push devices.
7. Rehearse environment-key isolation, overlapping rotation/revocation, compatible artifact rollback and service recovery. Record the actual rollback result and agreed observation thresholds.
8. Prepare the production configuration/canary for review with named responders and an external alert destination. Deploy the confirmed scope only after the staging evidence is complete; validate real delivery and rollback again on that target. Do not mark release records qualified based only on filled fields.

## Repeatable read-only inventory

```bash
node --test tooling/scripts/verification/inspect-master-data-environment.test.mjs
node tooling/scripts/verification/inspect-master-data-environment.mjs \
  --environment qa --container athyper-qa-db-1 --database athyper_neon \
  --role athyper_runtime --output docs/runbooks/master-data-release/qa-database-inventory.json
node tooling/scripts/verification/verify-notification-provider-readiness.mjs \
  --target staging --push none --json
```

The database command starts a read-only transaction and changes to the specified application role. It connects administratively through local Docker, so it **does not** certify application authentication, pooler behavior or effective IAM. The summary always reports `qualified: false`; acceptance must supply separate evidence. For remote environments use their authorized read-only connection mechanism with `../master-data-phase1/database-compatibility.sql` rather than assuming these Docker targets exist remotely.
