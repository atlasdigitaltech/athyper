# Local master-data deployment and operations

Scope: the `athyper-dev` development instance, Neon, synthetic CirrusAtlantic contact challenges, Mailpit delivery. Athyper remains the negative tenant. These procedures do not qualify QA, staging or production.

## Persistent deployment

The ordinary Stackctl planner now discovers owner-only files under `~/.athyper/instances/dev/config/`:

- `local-master-data.compose.json`: immutable runtime/Neon image IDs, signer key ID and pilot relay configuration.
- `local-runtime-preserved.compose.json`: allowlisted existing local feature flags and secret-file references.

It automatically appends the notification-capture and contact-challenge overlays and checks their three required secrets. This removes dependence on remembering dated deployment overrides. Other instances ignore this development profile. Private keys remain in the instance secret directory, outside Git.

For an already qualified local instance, retain the running configuration once:

```bash
node tooling/scripts/verification/local-master-data-ops.mjs configure --apply
```

Do not run `configure` after selecting an incoming image: it intentionally captures the currently running image again. For subsequent runtime upgrades, build and test the image first, retain the previous immutable image ID for rollback, then:

```bash
node tooling/scripts/verification/local-master-data-ops.mjs pin-runtime QUALIFIED_LOCAL_IMAGE --apply
node tooling/scripts/verification/local-master-data-ops.mjs deploy-runtime --apply
node tooling/scripts/verification/local-master-data-ops.mjs status
```

`deploy-runtime` validates Compose and recreates only API, worker, scheduler and Neon using the ordinary planner's Compose sources. It assumes the database is already provisioned; it is not a migration command. Full Stackctl deployment retains its existing migration/ownership gates. Keep pinned local images available; do not prune them. Rollback selects the recorded prior image and repeats deployment. A Neon upgrade can be captured with `configure` after separately qualifying/deploying its new image; review the resulting profile before the next deployment.

## Signing key rotation

Keys use Ed25519, a 90-day lifetime and a warning at 14 days remaining. Rotate before expiry. Public-key overlap preserves evidence issued by the previous key. The provider, tenant and Neon scope remain unchanged.

```bash
node tooling/scripts/verification/local-master-data-ops.mjs signing prepare --apply
node tooling/scripts/verification/local-master-data-ops.mjs deploy-runtime --apply
# Both public keys are now loaded; the old signer is still active.
docker stop athyper-dev-api-1
node tooling/scripts/verification/local-master-data-ops.mjs signing activate --apply
node tooling/scripts/verification/local-master-data-ops.mjs deploy-runtime --apply
```

Run the Mailpit verification acceptance below. Keep both public keys for at least eleven minutes after activation (ten-minute challenge lifetime plus one minute margin), then:

```bash
node tooling/scripts/verification/local-master-data-ops.mjs signing retire --apply
node tooling/scripts/verification/local-master-data-ops.mjs deploy-runtime --apply
```

Retirement removes the inactive public key and staged private-key backups. Before retirement, rollback uses `docker stop athyper-dev-api-1`, `signing rollback --apply`, then `deploy-runtime --apply`. Repeat acceptance and the eleven-minute overlap before retirement. File replacement requires container recreation so mounted secrets reload. An interrupted multi-file switch fails signer/profile consistency checks; keep API stopped and repeat activate or rollback. Never print or commit private-key files. Rotation was tested with isolated keys; qualification does not imply the live key was rotated.

## Delivery encryption key rotation

The AES-GCM delivery key is independent of the signing key. There is no dual-key decryption protocol. Suspend new requests by stopping the API, allow the worker to drain the queue, confirm `status` reports zero pending deliveries, then stop the worker. `delivery-key --apply` enforces both stopped services and an empty pending queue. Recreate the runtime and run Mailpit acceptance.

The owner-only `.previous` backup is retained for seven days. Do not replay old encrypted delivery rows with the new key. After seven days, successful acceptance, and retention has scrubbed the terminal encrypted history, remove the backup through the local secret-management process. A subsequent rotation refuses to overwrite it. During recovery before new-key messages are created, restore the previous key with API/worker stopped and recreate both. If new-key messages exist, do not revert blindly: drain/reconcile those deliveries first. Terminal or expired challenges should be replaced through a new authenticated request.

## Retention and scheduling

```bash
node tooling/scripts/verification/local-master-data-ops.mjs retention
node tooling/scripts/verification/local-master-data-ops.mjs tick --apply
node tooling/scripts/verification/local-master-data-ops.mjs install-timer --apply
systemctl --user status athyper-local-master-data.timer
journalctl --user -u athyper-local-master-data.service -n 20
```

The timer runs every five minutes while the user service manager is running. This machine has `Linger=no`: do not assume maintenance runs after logout or while the machine is off. It resumes when the user manager starts. A failed health check returns exit status 2 and is visible in systemd/journal; no external pager is configured.

Each transaction processes at most 500 rows per category, uses a maintenance advisory lock, two-second lock timeout and twenty-second statement timeout:

- Delete challenges seven days after expiry, only when no associated active or leased delivery needs them.
- Remove encrypted `localVerification` fields from terminal notification history older than seven days. Preserve other notification fields and all audit/outbox records.
- Delete challenge rate-limit windows older than 24 hours.

All maintenance SQL is restricted to the CirrusAtlantic pilot tenant and, for notification history, the local verification template. Pending deliveries and future leases block cleanup. Expired links remain invalid throughout retention; after deletion their challenge record is no longer available for replay diagnosis. This is a local synthetic-data policy, not an approved production retention schedule.

## Queue monitoring and failed delivery

`status` writes `~/.athyper/instances/dev/receipts/local-master-data-health.json`, with no token or contact value. Alerts cover unhealthy services, image/signer drift, signing-key validity, pending work older than 120 seconds, expired pending challenges, expired worker leases, and terminal failures in the last day. Inspect `event.notification_delivery`, `log.notification_delivery_attempt` and `log.notification_dlq` by delivery ID; do not dump encrypted payloads or verification links into incident logs.

The scheduler discovers pending work every minute. Transport failures receive bounded backoff through the existing queue, up to five attempts. Invalid encrypted envelopes and expired proofs fail permanently, avoiding useless SMTP retries. Transport errors are sanitized. A worker crash after SMTP acceptance can still produce duplicate messages; the challenge remains single-use.

For an eligible transient failure with attempts remaining and a live, unconsumed challenge:

```bash
node tooling/scripts/verification/local-master-data-ops.mjs retry DELIVERY_UUID
node tooling/scripts/verification/local-master-data-ops.mjs retry DELIVERY_UUID --apply
```

Retry only brings the next scheduled attempt forward. It does not reset attempt counters, revive expired proofs or broaden tenant scope. For exhausted, permanent, or expired failures, fix SMTP/configuration as appropriate and request a new challenge through the authenticated application. Do not directly edit a proof or mark a contact verified. After repair, confirm the queue drains, the challenge completes and audit is recorded. A last-day terminal-failure alert can remain until its reporting window expires.

## Acceptance

```bash
node --test deploy/stackctl/tests/local-master-data.test.mjs deploy/stackctl/tests/model.test.mjs deploy/stackctl/tests/execution.test.mjs
node --test tooling/scripts/verification/local-master-data-operations.test.mjs
pnpm --filter @athyper/server-platform-host build
pnpm --filter @athyper/server-platform-host exec vitest run src/composition/__tests__/local-verification-delivery.test.ts
LD_LIBRARY_PATH=/tmp/athyper-playwright-libs/extracted/usr/lib/x86_64-linux-gnu node tooling/scripts/verification/verify-local-contact-workflow.mjs
LD_LIBRARY_PATH=/tmp/athyper-playwright-libs/extracted/usr/lib/x86_64-linux-gnu node tooling/scripts/verification/verify-local-master-data-six-routes.mjs
```

The operations suite runs its PostgreSQL case only with `ATHYPER_LOCAL_MAINTENANCE_DB_TESTS=true` and a disposable `athyper-local-maintenance-tests` PostgreSQL container/database `ops_test`. Never point this fixture at the application database. Browser checks use selected local identities through the existing development SSO helper; they do not test user password/MFA enrollment. See the dated operations evidence alongside the launch records for actual executed checks.

## Local key and channel recheck

The latest [key/channel status](master-data-launch/local-key-channel-status.json) records a valid active key, an enabled maintenance timer and passing isolated rotation/rollback checks. The current key expires on 2026-12-05; its fourteen-day rotation window starts on 2026-11-21. Monitoring raises a warning when the remaining whole-day count is at most fourteen. The live key was not replaced during this recheck.

All six local captures were rechecked successfully: email, SMS, WhatsApp, browser push, Android push and iOS push. The smoke runner now loads the mounted challenge configuration required by startup validation in its separate Docker exec process, without logging secrets. These checks exercise deployed adapters and synthetic push subscriptions; they do not prove real-device delivery.

Real SMS, WhatsApp and push acceptance remains open pending the chosen provider/account references and authorized recipients or devices. QA/staging/production setup remains deferred. The existing code has SMS, Meta WhatsApp, browser push and FCM adapter paths; their presence alone is not provider configuration or acceptance.
